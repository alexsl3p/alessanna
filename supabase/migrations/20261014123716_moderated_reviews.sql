-- Reviews are submitted anonymously, but only a verified salon administrator
-- can read the moderation queue or publish. Email never leaves the admin API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.salon_reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  author_name text not null check (char_length(author_name) between 1 and 100),
  author_email text check (author_email is null or char_length(author_email) <= 120),
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(body) between 8 and 2000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  moderated_at timestamptz,
  moderated_by uuid references public.staff(id) on delete set null,
  submission_ip_hash text
);
create index salon_reviews_status_created_idx on public.salon_reviews(status, created_at desc);
create index salon_reviews_ip_created_idx on public.salon_reviews(submission_ip_hash, created_at desc);
alter table public.salon_reviews enable row level security;
revoke all on public.salon_reviews from public, anon, authenticated;

-- Existing email-approved review: retain exactly once, now managed from CRM.
insert into public.salon_reviews(request_id,author_name,rating,body,status,created_at,moderated_at)
values ('de982189-9132-4695-8152-5728bffcb323','Jelena',5,
  'Professionaalne meister, mõistab, mida klient soovib','approved',
  '2026-10-13T09:55:00+03:00','2026-10-13T10:18:12+03:00');

-- No staff-ID-only authorization. Shared salon device tokens are insufficient.
create function private.require_review_admin(p_staff_id uuid, p_device_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_staff public.staff; v_email text;
begin
  select * into v_staff from public.staff where id=p_staff_id and is_active;
  if v_staff.id is null or not (
    coalesce(v_staff.role,'') in ('admin','owner') or
    coalesce(v_staff.roles,array[]::text[]) && array['admin','owner']
  ) then raise exception 'access_denied'; end if;
  select email into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if v_email is not null and lower(v_email)=lower(v_staff.email) then return; end if;
  if nullif(p_device_token,'') is not null and exists (
    select 1 from public.staff_trusted_devices d
    where d.staff_id=v_staff.id and not d.is_salon_device and d.revoked_at is null
      and d.device_token_hash=public._staff_token_hash(p_device_token)
  ) then return; end if;
  raise exception 'review_auth_required';
end $$;
revoke all on function private.require_review_admin(uuid,text) from public, anon, authenticated;

create function public.review_submit(p_request_id uuid, p_name text, p_email text, p_rating integer, p_body text, p_website text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_ip text; v_hash text; v_id uuid; v_headers jsonb;
begin
  if p_request_id is null or p_name is null or char_length(trim(p_name)) not between 1 and 100
    or p_body is null or char_length(trim(p_body)) not between 8 and 2000
    or p_rating is null or p_rating not between 1 and 5
    or (nullif(trim(p_email),'') is not null and
      (char_length(p_email)>120 or trim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
  then raise exception 'review_invalid'; end if;
  if nullif(p_website,'') is not null then raise exception 'review_invalid'; end if;
  -- Never return a submission's state or contents to a visitor.
  if exists(select 1 from public.salon_reviews where request_id=p_request_id) then
    return jsonb_build_object('status','received');
  end if;
  v_headers := coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
  v_ip := coalesce(nullif(v_headers->>'cf-connecting-ip',''),
    nullif(trim(split_part(v_headers->>'x-forwarded-for',',',1)),''),'unknown');
  v_hash := public._staff_token_hash(v_ip);
  perform pg_advisory_xact_lock(hashtext('review:' || v_hash));
  if (select count(*) from public.salon_reviews where submission_ip_hash=v_hash
    and created_at>now()-interval '1 hour') >= 5 then raise exception 'review_rate_limited'; end if;
  insert into public.salon_reviews(request_id,author_name,author_email,rating,body,submission_ip_hash)
    values(p_request_id,trim(p_name),nullif(trim(p_email),''),p_rating,trim(p_body),v_hash)
    on conflict(request_id) do nothing;
  return jsonb_build_object('status','received');
end $$;

create function public.review_public_list()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'author_name',author_name,
    'rating',rating,'body',body,'created_at',created_at) order by created_at desc,id), '[]'::jsonb)
  from (select id,author_name,rating,body,created_at from public.salon_reviews
    where status='approved' order by created_at desc,id limit 100) r;
$$;

create function public.review_admin_list(p_staff_id uuid, p_device_token text default null, p_status text default 'pending', p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_rows jsonb; v_counts jsonb;
begin
  perform private.require_review_admin(p_staff_id,p_device_token);
  if p_status not in ('pending','approved','rejected') or p_status is null then raise exception 'review_invalid'; end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id),'[]'::jsonb) into v_rows
  from (select id,author_name,author_email,rating,body,status,created_at,moderated_at
    from public.salon_reviews where status=p_status order by created_at desc,id
    limit 50 offset greatest(coalesce(p_offset,0),0)) r;
  select jsonb_build_object('pending',count(*) filter(where status='pending'),
    'approved',count(*) filter(where status='approved'),'rejected',count(*) filter(where status='rejected'))
    into v_counts from public.salon_reviews;
  return jsonb_build_object('rows',v_rows,'counts',v_counts);
end $$;

create function public.review_moderate(p_staff_id uuid,p_review_id uuid,p_status text,p_device_token text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_review_admin(p_staff_id,p_device_token);
  if p_status is null or p_status not in ('approved','rejected','pending') then raise exception 'review_invalid'; end if;
  update public.salon_reviews set status=p_status, moderated_at=now(), moderated_by=p_staff_id where id=p_review_id;
  if not found then raise exception 'review_not_found'; end if;
  return jsonb_build_object('status',p_status);
end $$;

revoke all on function public.review_submit(uuid,text,text,integer,text,text) from public;
revoke all on function public.review_public_list() from public;
revoke all on function public.review_admin_list(uuid,text,text,integer) from public;
revoke all on function public.review_moderate(uuid,uuid,text,text) from public;
grant execute on function public.review_submit(uuid,text,text,integer,text,text) to anon,authenticated;
grant execute on function public.review_public_list() to anon,authenticated;
grant execute on function public.review_admin_list(uuid,text,text,integer) to anon,authenticated;
grant execute on function public.review_moderate(uuid,uuid,text,text) to anon,authenticated;
notify pgrst, 'reload schema';
