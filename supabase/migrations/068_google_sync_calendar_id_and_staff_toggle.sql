-- 068_google_sync_calendar_id_and_staff_toggle.sql
-- Enqueue Google Calendar outbox with explicit validation (no silent skips):
--   * salon row: connected + non-empty google_calendar_id in salon_settings
--   * staff row: sync enabled + connected + non-empty staff.google_calendar_id
-- Adds staff.google_calendar_sync_enabled (default true).

alter table public.staff
  add column if not exists google_calendar_sync_enabled boolean not null default true;

comment on column public.staff.google_calendar_sync_enabled is
  'When false, no staff-scope google_calendar_event outbox row is enqueued for this person.';

create or replace function public.enqueue_appointment_outbox()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_salon_status text;
  v_salon_cal text;
  v_staff_status text;
  v_staff_cal text;
  v_staff_sync_en boolean;
  v_scope text;
  v_payload jsonb;
  v_op text;
  v_salon_out_status text;
  v_salon_err text;
  v_staff_out_status text;
  v_staff_err text;
  v_staff_id uuid;
begin
  if tg_op = 'INSERT' then
    v_op := case when new.status = 'cancelled' then 'delete' else 'upsert' end;
    v_payload := jsonb_build_object(
      'operation', v_op,
      'appointment_id', new.id,
      'staff_id', new.staff_id,
      'service_id', new.service_id,
      'client_name', new.client_name,
      'client_phone', new.client_phone,
      'start_time', new.start_time,
      'end_time', new.end_time,
      'status', new.status,
      'source', coalesce(new.source, 'crm'),
      'note', coalesce(new.note, ''),
      'google_event_id', new.google_event_id
    );
  elsif tg_op = 'UPDATE' then
    if (new.staff_id, new.service_id, new.client_name, new.client_phone, new.start_time, new.end_time, new.status, new.note)
      is not distinct from
       (old.staff_id, old.service_id, old.client_name, old.client_phone, old.start_time, old.end_time, old.status, old.note)
    then
      return new;
    end if;
    v_op := case when new.status = 'cancelled' then 'delete' else 'upsert' end;
    v_payload := jsonb_build_object(
      'operation', v_op,
      'appointment_id', new.id,
      'staff_id', new.staff_id,
      'service_id', new.service_id,
      'client_name', new.client_name,
      'client_phone', new.client_phone,
      'start_time', new.start_time,
      'end_time', new.end_time,
      'status', new.status,
      'source', coalesce(new.source, 'crm'),
      'note', coalesce(new.note, ''),
      'google_event_id', new.google_event_id
    );
  else
    return coalesce(new, old);
  end if;

  select coalesce(value, 'disconnected')
    into v_salon_status
    from public.salon_settings
    where key = 'google_calendar_status'
    limit 1;

  select value
    into v_salon_cal
    from public.salon_settings
    where key = 'google_calendar_id'
    limit 1;

  if v_salon_status = 'connected' then
    if v_salon_cal is null or length(trim(v_salon_cal)) = 0 or trim(v_salon_cal) = 'primary' then
      v_salon_out_status := 'error';
      v_salon_err := 'Salon Google Calendar ID is not configured (Integrations).';
    else
      v_salon_out_status := 'pending';
      v_salon_err := null;
    end if;
  else
    v_salon_out_status := 'error';
    v_salon_err := 'Google auth is disconnected for salon scope.';
  end if;

  insert into public.notifications_outbox (
    appointment_id, kind, target_scope, payload, status, last_error
  )
  values (
    coalesce(new.id, old.id),
    'google_calendar_event',
    'salon',
    v_payload,
    v_salon_out_status,
    v_salon_err
  );

  v_staff_id := coalesce(new.staff_id, old.staff_id);
  v_scope := 'staff:' || v_staff_id::text;
  if v_staff_id is not null then
    select
      coalesce(google_calendar_status, 'disconnected'),
      google_calendar_id,
      coalesce(google_calendar_sync_enabled, true)
      into v_staff_status, v_staff_cal, v_staff_sync_en
    from public.staff
    where id = v_staff_id;

    if not v_staff_sync_en then
      v_staff_out_status := 'error';
      v_staff_err := 'Google Calendar sync is disabled for this staff member.';
    elsif v_staff_status = 'connected' then
      if v_staff_cal is null or length(trim(v_staff_cal)) = 0 or trim(v_staff_cal) = 'primary' then
        v_staff_out_status := 'error';
        v_staff_err := 'Master Google Calendar ID is missing. Set google_calendar_id for this staff in Integrations.';
      else
        v_staff_out_status := 'pending';
        v_staff_err := null;
      end if;
    else
      v_staff_out_status := 'error';
      v_staff_err := 'Google auth is disconnected for staff scope.';
    end if;

    insert into public.notifications_outbox (
      appointment_id, kind, target_scope, payload, status, last_error
    )
    values (
      coalesce(new.id, old.id),
      'google_calendar_event',
      v_scope,
      v_payload,
      v_staff_out_status,
      v_staff_err
    );
  end if;

  return new;
exception when others then
  raise warning 'enqueue_appointment_outbox failed: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.enqueue_appointment_outbox() from public;
