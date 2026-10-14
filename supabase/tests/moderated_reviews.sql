-- Transactional integration/security checks; no test data survives.
-- Requires at least one active admin/owner (normal Alessanna CRM fixture).
begin;
create temporary table review_test_results(ok boolean);
do $$
declare
  v_admin uuid; v_worker uuid; v_id uuid; v_req uuid := gen_random_uuid();
  v_token text := gen_random_uuid()::text; v_result jsonb; v_rejected boolean;
begin
  select id into v_admin from public.staff where is_active and
    (role in ('admin','owner') or roles && array['admin','owner']) limit 1;
  if v_admin is null then raise exception 'No admin fixture'; end if;
  select id into v_worker from public.staff where is_active and
    not (role in ('admin','owner') or roles && array['admin','owner']) limit 1;
  insert into public.staff_trusted_devices(staff_id,device_token_hash,label,is_salon_device)
    values(v_admin,public._staff_token_hash(v_token),'TEST-reviews-transaction',false);
  perform set_config('request.headers','{"x-forwarded-for":"192.0.2.123"}',true);
  perform public.review_submit(v_req,'TEST-review','private@example.invalid',4,'TEST review body');
  perform public.review_submit(v_req,'TEST-review','private@example.invalid',4,'TEST review body');
  if (select count(*) from public.salon_reviews where request_id=v_req)<>1 then raise exception 'Duplicate submission'; end if;
  select id into v_id from public.salon_reviews where request_id=v_req;
  if public.review_public_list() @> jsonb_build_array(jsonb_build_object('id',v_id)) then raise exception 'Pending review exposed'; end if;
  v_result := public.review_admin_list(v_admin,v_token);
  if not (v_result->'rows' @> jsonb_build_array(jsonb_build_object('id',v_id,'author_email','private@example.invalid')))
    then raise exception 'Not in admin queue'; end if;
  v_rejected := false;
  begin perform public.review_moderate(v_admin,v_id,'approved'); exception when others then v_rejected := SQLERRM='review_auth_required'; end;
  if not v_rejected then raise exception 'Staff ID impersonation permitted'; end if;
  if v_worker is not null then
    v_rejected := false;
    begin perform public.review_moderate(v_worker,v_id,'approved',v_token); exception when others then v_rejected := SQLERRM='access_denied'; end;
    if not v_rejected then raise exception 'Worker allowed to moderate'; end if;
  end if;
  update public.staff_trusted_devices set is_salon_device=true where device_token_hash=public._staff_token_hash(v_token);
  v_rejected := false;
  begin perform public.review_admin_list(v_admin,v_token); exception when others then v_rejected := SQLERRM='review_auth_required'; end;
  if not v_rejected then raise exception 'Shared kiosk allowed to moderate'; end if;
  update public.staff_trusted_devices set is_salon_device=false where device_token_hash=public._staff_token_hash(v_token);
  perform public.review_moderate(v_admin,v_id,'approved',v_token);
  v_result := public.review_public_list();
  if not (v_result @> jsonb_build_array(jsonb_build_object('id',v_id))) then raise exception 'Approved missing'; end if;
  if v_result::text like '%private@example.invalid%' or v_result::text like '%submission_ip_hash%' then raise exception 'Private data exposed'; end if;
  perform public.review_moderate(v_admin,v_id,'rejected',v_token);
  if public.review_public_list() @> jsonb_build_array(jsonb_build_object('id',v_id)) then raise exception 'Rejected review exposed'; end if;
  perform public.review_moderate(v_admin,v_id,'approved',v_token);
  perform public.review_moderate(v_admin,v_id,'pending',v_token);
  if public.review_public_list() @> jsonb_build_array(jsonb_build_object('id',v_id)) then raise exception 'Unpublished review exposed'; end if;
  v_rejected := false;
  begin perform public.review_submit(gen_random_uuid(),'Bad',null,6,'Invalid rating body'); exception when others then v_rejected := SQLERRM='review_invalid'; end;
  if not v_rejected then raise exception 'Invalid rating accepted'; end if;
  v_rejected := false;
  begin perform public.review_submit(gen_random_uuid(),'Bad',null,5,'Invalid honeypot body','spam'); exception when others then v_rejected := SQLERRM='review_invalid'; end;
  if not v_rejected then raise exception 'Honeypot accepted'; end if;
  for i in 1..4 loop perform public.review_submit(gen_random_uuid(),'TEST-review',null,5,'Rate limiting test body'); end loop;
  v_rejected := false;
  begin perform public.review_submit(gen_random_uuid(),'TEST-review',null,5,'Rate limiting test body'); exception when others then v_rejected := SQLERRM='review_rate_limited'; end;
  if not v_rejected then raise exception 'Rate limit missing'; end if;
  update public.staff_trusted_devices set revoked_at=now() where device_token_hash=public._staff_token_hash(v_token);
  v_rejected := false;
  begin perform public.review_admin_list(v_admin,v_token); exception when others then v_rejected := SQLERRM='review_auth_required'; end;
  if not v_rejected then raise exception 'Revoked token allowed'; end if;
  if has_table_privilege('anon','public.salon_reviews','select')
    or has_table_privilege('anon','public.salon_reviews','insert')
    or has_table_privilege('anon','public.salon_reviews','update')
    or has_table_privilege('authenticated','public.salon_reviews','select')
    then raise exception 'Direct table access exposed'; end if;
  insert into review_test_results values(true);
end $$;
select 'PASS: submit, idempotency, admin queue, approval, rejection, unpublish, private fields, PIN/device authorization, revoked token, validation, spam limit, grants' as result from review_test_results;
rollback;
