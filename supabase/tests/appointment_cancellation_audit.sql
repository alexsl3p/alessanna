-- Run after the audit migration. All fixtures and events are rolled back.
begin;
create temporary table appointment_audit_results(result text);
do $$
declare
  v_manager uuid := gen_random_uuid(); v_worker uuid := gen_random_uuid();
  v_reception uuid := gen_random_uuid(); v_appt uuid := gen_random_uuid();
  v_uid uuid := gen_random_uuid(); v_login jsonb; v_worker_login jsonb;
  v_token text; v_time timestamptz; v_rejected boolean; v_count int; v_history jsonb;
begin
  insert into public.staff(id,name,phone,role,roles,is_active,pin_hash,email,show_on_marketing_site)
  values(v_manager,'ТЕСТ-audit manager','000000700001','manager',array['manager'],true,
    extensions.crypt('741852',extensions.gen_salt('bf',4)),'audit-manager@example.invalid',false),
    (v_worker,'ТЕСТ-audit worker','000000700002','worker',array['worker'],true,null,null,false),
    (v_reception,'ТЕСТ-audit reception','000000700003','worker',array['reception'],true,null,null,false);
  insert into public.appointments(id,staff_id,client_name,start_time,end_time,status,source)
  values(v_appt,v_worker,'ТЕСТ-audit — automated check, не обрабатывать',
    '2099-01-05T10:00Z','2099-01-05T11:00Z','confirmed','reception');

  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  v_login := public.staff_login('000000700001','wrong');
  if v_login->>'status'<>'invalid_pin' or v_login ? 'audit_session_token' then raise exception 'Failed login minted token'; end if;
  v_login := public.staff_login('000000700001','741852');
  v_token := v_login->>'audit_session_token';
  if v_token is null then raise exception 'PIN login missing session'; end if;
  v_worker_login := public.staff_login('000000700002');
  if v_worker_login->>'audit_session_token' is null then raise exception 'Existing phone login no longer works'; end if;

  v_rejected := false;
  begin perform public.appointment_cancel(v_appt,v_manager,'forged');
    exception when insufficient_privilege then v_rejected := true; end;
  if not v_rejected then raise exception 'Forged token accepted'; end if;
  v_rejected := false;
  begin perform public.appointment_cancel(v_appt,v_worker,v_token);
    exception when insufficient_privilege then v_rejected := true; end;
  if not v_rejected then raise exception 'Actor ID impersonation accepted'; end if;
  v_rejected := false;
  begin update public.appointments set status='cancelled' where id=v_appt;
    exception when insufficient_privilege then v_rejected := true; end;
  if not v_rejected then raise exception 'Anonymous REST cancellation bypassed audit'; end if;

  perform public.appointment_cancel(v_appt,v_manager,v_token);
  select cancelled_at into v_time from public.appointments where id=v_appt;
  if v_time is null or not exists(select 1 from public.appointments where id=v_appt
    and cancelled_by_staff_id=v_manager and cancelled_by_name='ТЕСТ-audit manager'
    and cancellation_actor_kind='staff' and status='cancelled') then raise exception 'Missing cancellation evidence'; end if;
  v_history := public.appointment_status_history(v_appt,v_manager,v_token);
  if jsonb_array_length(v_history)<>1 or v_history->0->>'actor_staff_id'<>v_manager::text then raise exception 'Missing history'; end if;
  perform public.appointment_cancel(v_appt,v_manager,v_token);
  if jsonb_array_length(public.appointment_status_history(v_appt,v_manager,v_token))<>1
    or (select cancelled_at from public.appointments where id=v_appt)<>v_time then raise exception 'Duplicate overwrote first cancellation'; end if;

  update public.appointments set cancelled_by_name='spoofed',cancelled_at='2000-01-01' where id=v_appt;
  if not exists(select 1 from public.appointments where id=v_appt and cancelled_by_name='ТЕСТ-audit manager'
    and cancelled_at=v_time) then raise exception 'Evidence tampering accepted'; end if;

  -- Restoring and cancelling again produces new entries; the first is retained.
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  update public.appointments set status='confirmed' where id=v_appt;
  if (select cancelled_at from public.appointments where id=v_appt) is not null then raise exception 'Restored row kept stale summary'; end if;
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  perform public.appointment_cancel(v_appt,v_worker,v_worker_login->>'audit_session_token');
  if jsonb_array_length(public.appointment_status_history(v_appt,v_manager,v_token))<>3 then raise exception 'History lost after restoration'; end if;

  -- Workers cannot cancel another worker's visit; reception may cancel it.
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  update public.appointments set status='confirmed',staff_id=v_manager where id=v_appt;
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  v_rejected := false;
  begin perform public.appointment_cancel(v_appt,v_worker,v_worker_login->>'audit_session_token');
    exception when insufficient_privilege then v_rejected := true; end;
  if not v_rejected then raise exception 'Worker cancelled another worker visit'; end if;
  v_login := public.staff_login('000000700003');
  perform public.appointment_cancel(v_appt,v_reception,v_login->>'audit_session_token');

  -- Name snapshots and history survive account renaming / appointment deletion.
  update public.staff set name='ТЕСТ-renamed reception' where id=v_reception;
  if (select cancelled_by_name from public.appointments where id=v_appt)<>'ТЕСТ-audit reception' then raise exception 'Historical name changed'; end if;
  select count(*) into v_count from private.appointment_status_history where appointment_id=v_appt;
  delete from public.appointments where id=v_appt;
  if (select count(*) from private.appointment_status_history where appointment_id=v_appt)<>v_count then raise exception 'Deletion erased history'; end if;

  -- Revoked / expired sessions cannot authorize an action.
  perform public.appointment_audit_logout(v_token);
  v_rejected := false;
  begin perform public.appointment_status_history(v_appt,v_manager,v_token);
    exception when insufficient_privilege then v_rejected := true; end;
  if not v_rejected then raise exception 'Logged-out session accepted'; end if;
  update private.appointment_audit_sessions set expires_at=now()-interval '1 second'
    where staff_id=v_worker;
  v_rejected := false;
  begin perform public.appointment_status_history(v_appt,v_worker,v_worker_login->>'audit_session_token');
    exception when insufficient_privilege then v_rejected := true; end;
  if not v_rejected then raise exception 'Expired session accepted'; end if;

  -- Verified email login has the same actor binding without a phone token.
  insert into auth.users(id,email,email_confirmed_at) values(v_uid,'audit-manager@example.invalid',now());
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_uid)::text,true);
  insert into public.appointments(id,staff_id,client_name,start_time,end_time,status,source)
  values(v_appt,v_worker,'ТЕСТ-audit email — не обрабатывать','2099-01-05T10:00Z','2099-01-05T11:00Z','confirmed','crm');
  perform public.appointment_cancel(v_appt,v_manager);
  if (select cancelled_by_staff_id from public.appointments where id=v_appt)<>v_manager then raise exception 'Email actor missing'; end if;
  if not exists(select 1 from private.appointment_status_history where appointment_id=v_appt and auth_user_id=v_uid) then raise exception 'Auth account ID missing'; end if;

  if has_table_privilege('anon','private.appointment_status_history','insert')
    or has_table_privilege('authenticated','private.appointment_status_history','update')
    or has_table_privilege('anon','private.appointment_audit_sessions','select')
    or has_function_privilege('anon','private.add_appointment_audit_session(jsonb)','execute')
    or has_function_privilege('anon','private.staff_login(text,text,text,boolean,text,text)','execute')
    then raise exception 'Private audit access exposed'; end if;
  insert into appointment_audit_results values('PASS: login, actor binding, direct bypass, first cancellation, idempotency, tampering, restore, worker/reception permissions, snapshots, deletion retention, logout, expiry, email auth, grants');
end $$;
select * from appointment_audit_results;
rollback;
