-- Server-issued staff sessions bind appointment changes to the account that
-- actually logged in (phone/PIN, trusted device, or Supabase Auth).
-- Historical cancellations deliberately remain unknown: never backfill guesses.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.appointment_audit_sessions (
  token_hash text primary key,
  staff_id uuid not null references public.staff(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours')
);
create index appointment_audit_sessions_staff_idx on private.appointment_audit_sessions(staff_id);
alter table private.appointment_audit_sessions enable row level security;
revoke all on private.appointment_audit_sessions from public, anon, authenticated;

create function private.add_appointment_audit_session(p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if p_result->>'status' <> 'ok' or p_result#>>'{staff,id}' is null then return p_result; end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  delete from private.appointment_audit_sessions where expires_at < now();
  insert into private.appointment_audit_sessions(token_hash,staff_id)
    values(public._staff_token_hash(v_token),(p_result#>>'{staff,id}')::uuid);
  return p_result || jsonb_build_object('audit_session_token',v_token);
end $$;
revoke all on function private.add_appointment_audit_session(jsonb) from public, anon, authenticated;

-- Keep the existing login implementation, including PIN lockout, unchanged.
alter function public.staff_login(text,text,text,boolean,text,text) set schema private;
alter function public.staff_login_by_device(text,text) set schema private;
revoke all on function private.staff_login(text,text,text,boolean,text,text) from public, anon, authenticated;
revoke all on function private.staff_login_by_device(text,text) from public, anon, authenticated;

create function public.staff_login(phone_input text,pin_input text default null,
  device_token text default null,trust_this_device boolean default false,
  device_label text default null,user_agent_input text default null)
returns jsonb language sql security definer set search_path = '' as $$
  select private.add_appointment_audit_session(private.staff_login(
    phone_input,pin_input,device_token,trust_this_device,device_label,user_agent_input));
$$;
create function public.staff_login_by_device(device_token text,user_agent_input text default null)
returns jsonb language sql security definer set search_path = '' as $$
  select private.add_appointment_audit_session(private.staff_login_by_device(device_token,user_agent_input));
$$;
revoke all on function public.staff_login(text,text,text,boolean,text,text) from public;
revoke all on function public.staff_login_by_device(text,text) from public;
grant execute on function public.staff_login(text,text,text,boolean,text,text) to anon, authenticated;
grant execute on function public.staff_login_by_device(text,text) to anon, authenticated;

create function public.appointment_audit_logout(p_session_token text)
returns void language sql security definer set search_path = '' as $$
  delete from private.appointment_audit_sessions
    where token_hash=public._staff_token_hash(p_session_token);
$$;
revoke all on function public.appointment_audit_logout(text) from public;
grant execute on function public.appointment_audit_logout(text) to anon, authenticated;

create function private.appointment_audit_actor(p_staff_id uuid,p_session_token text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid;
begin
  if nullif(p_session_token,'') is not null then
    select s.id into v_id from private.appointment_audit_sessions a
      join public.staff s on s.id=a.staff_id
      where a.token_hash=public._staff_token_hash(p_session_token)
        and a.expires_at>now() and s.is_active and s.id=p_staff_id;
  else
    select s.id into v_id from auth.users u join public.staff s on lower(s.email)=lower(u.email)
      where u.id=auth.uid() and u.email_confirmed_at is not null
        and s.is_active and s.id=p_staff_id;
  end if;
  if v_id is null then raise exception 'appointment_auth_required' using errcode='42501'; end if;
  return v_id;
end $$;
revoke all on function private.appointment_audit_actor(uuid,text) from public, anon, authenticated;

alter table public.appointments
  add column cancelled_at timestamptz,
  add column cancelled_by_staff_id uuid,
  add column cancelled_by_name text,
  add column cancellation_actor_kind text;
-- No FK for these historical actor snapshots: deleting/renaming an account must
-- not erase who cancelled. The private history also survives appointment deletion.
create table private.appointment_status_history (
  id bigint generated always as identity primary key,
  appointment_id uuid not null,
  occurred_at timestamptz not null default clock_timestamp(),
  old_status text,
  new_status text not null,
  actor_kind text not null check(actor_kind in ('staff','system','google')),
  actor_staff_id uuid,
  actor_name text,
  auth_user_id uuid,
  appointment_staff_id uuid,
  client_name text,
  start_time timestamptz,
  end_time timestamptz
);
create index appointment_status_history_appointment_idx
  on private.appointment_status_history(appointment_id,occurred_at desc,id desc);
alter table private.appointment_status_history enable row level security;
revoke all on private.appointment_status_history from public, anon, authenticated;

create function private.audit_appointment_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_name text; v_kind text; v_time timestamptz := clock_timestamp();
  v_changed boolean; v_old text;
begin
  if tg_op='UPDATE' then
    v_old := old.status;
    v_changed := old.status is distinct from new.status;
    -- The summary is server-owned; ordinary edits cannot replace the evidence.
    new.cancelled_at := old.cancelled_at;
    new.cancelled_by_staff_id := old.cancelled_by_staff_id;
    new.cancelled_by_name := old.cancelled_by_name;
    new.cancellation_actor_kind := old.cancellation_actor_kind;
  else
    v_changed := new.status='cancelled';
    new.cancelled_at := null;
    new.cancelled_by_staff_id := null;
    new.cancelled_by_name := null;
    new.cancellation_actor_kind := null;
  end if;
  if not v_changed then return new; end if;

  v_actor := nullif(current_setting('alessanna.appointment_actor',true),'')::uuid;
  if v_actor is null and auth.uid() is not null then
    select s.id into v_actor from auth.users u join public.staff s on lower(s.email)=lower(u.email)
      where u.id=auth.uid() and u.email_confirmed_at is not null and s.is_active;
  end if;
  if v_actor is not null then
    select s.name into v_name from public.staff s where s.id=v_actor and s.is_active;
    if v_name is null then raise exception 'appointment_auth_required' using errcode='42501'; end if;
    v_kind := 'staff';
  elsif coalesce(auth.role(),'') in ('anon','authenticated') then
    -- An old tab/direct REST update must not silently produce an anonymous cancellation.
    raise exception 'appointment_auth_required' using errcode='42501';
  else
    v_kind := case when coalesce(auth.role(),'')='service_role'
      and new.google_sync_source='google' then 'google' else 'system' end;
  end if;
  insert into private.appointment_status_history(appointment_id,occurred_at,old_status,new_status,
    actor_kind,actor_staff_id,actor_name,auth_user_id,appointment_staff_id,client_name,start_time,end_time)
  values(new.id,v_time,v_old,new.status,v_kind,v_actor,v_name,auth.uid(),new.staff_id,
    new.client_name,new.start_time,new.end_time);
  if new.status='cancelled' then
    new.cancelled_at := v_time;
    new.cancelled_by_staff_id := v_actor;
    new.cancelled_by_name := v_name;
    new.cancellation_actor_kind := v_kind;
  else
    new.cancelled_at := null;
    new.cancelled_by_staff_id := null;
    new.cancelled_by_name := null;
    new.cancellation_actor_kind := null;
  end if;
  return new;
end $$;
revoke all on function private.audit_appointment_status() from public, anon, authenticated;
create trigger appointments_status_audit before insert or update on public.appointments
  for each row execute function private.audit_appointment_status();

create function public.appointment_cancel(p_appointment_id uuid,p_staff_id uuid,p_session_token text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_staff public.staff; v_appt public.appointments; v_previous text;
begin
  v_actor := private.appointment_audit_actor(p_staff_id,p_session_token);
  select * into v_staff from public.staff where id=v_actor;
  select * into v_appt from public.appointments where id=p_appointment_id for update;
  if v_appt.id is null then raise exception 'appointment_not_found'; end if;
  if v_appt.staff_id is distinct from v_actor and not (
    v_staff.role in ('admin','owner','manager','reception') or
    coalesce(v_staff.roles,array[]::text[]) && array['admin','owner','manager','reception']
  ) then raise exception 'access_denied' using errcode='42501'; end if;
  if v_appt.status='cancelled' then return jsonb_build_object('status','already_cancelled'); end if;
  v_previous := current_setting('alessanna.appointment_actor',true);
  perform set_config('alessanna.appointment_actor',v_actor::text,true);
  update public.appointments set status='cancelled' where id=p_appointment_id;
  perform set_config('alessanna.appointment_actor',coalesce(v_previous,''),true);
  return jsonb_build_object('status','ok');
end $$;
revoke all on function public.appointment_cancel(uuid,uuid,text) from public;
grant execute on function public.appointment_cancel(uuid,uuid,text) to anon, authenticated;

create function public.appointment_status_history(p_appointment_id uuid,p_staff_id uuid,p_session_token text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_staff public.staff; v_manage boolean;
begin
  v_actor := private.appointment_audit_actor(p_staff_id,p_session_token);
  select * into v_staff from public.staff where id=v_actor;
  v_manage := v_staff.role in ('admin','owner','manager','reception') or
    coalesce(v_staff.roles,array[]::text[]) && array['admin','owner','manager','reception'];
  return (select coalesce(jsonb_agg(to_jsonb(h) order by h.occurred_at desc,h.id desc),'[]'::jsonb)
    from private.appointment_status_history h where h.appointment_id=p_appointment_id
      and (v_manage or h.appointment_staff_id=v_actor));
end $$;
revoke all on function public.appointment_status_history(uuid,uuid,text) from public;
grant execute on function public.appointment_status_history(uuid,uuid,text) to anon, authenticated;
notify pgrst, 'reload schema';
