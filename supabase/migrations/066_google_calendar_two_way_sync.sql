-- 066_google_calendar_two_way_sync.sql
-- -----------------------------------------------------------------------------
-- Two-way Google Calendar sync foundation:
--   * keep mapping fields on appointments (event id, etag, scope);
--   * store webhook/sync cursors per scope (salon / staff:<uuid>);
--   * enqueue outbox tasks on INSERT + UPDATE (upsert/delete operations).
-- -----------------------------------------------------------------------------

alter table public.appointments
  add column if not exists google_event_id text,
  add column if not exists google_calendar_scope text not null default 'salon',
  add column if not exists google_event_etag text,
  add column if not exists google_last_synced_at timestamptz,
  add column if not exists google_sync_source text not null default 'crm'
    check (google_sync_source in ('crm', 'google', 'website', 'import'));

create unique index if not exists uq_appointments_google_scope_event
  on public.appointments (google_calendar_scope, google_event_id)
  where google_event_id is not null;

create index if not exists idx_appointments_google_scope
  on public.appointments (google_calendar_scope, start_time desc);

comment on column public.appointments.google_event_id is
  'Mapped Google Calendar event id for duplicate prevention and two-way sync.';
comment on column public.appointments.google_calendar_scope is
  'Target calendar scope for sync: salon or staff:<uuid>.';
comment on column public.appointments.google_sync_source is
  'Last writer source. google means row was updated from webhook pull.';

create table if not exists public.google_calendar_sync_state (
  scope text primary key,
  google_calendar_id text not null,
  sync_token text,
  channel_id text,
  channel_resource_id text,
  channel_expires_at timestamptz,
  last_webhook_at timestamptz,
  last_pull_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.google_calendar_sync_state_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_google_calendar_sync_state_touch on public.google_calendar_sync_state;
create trigger trg_google_calendar_sync_state_touch
before update on public.google_calendar_sync_state
for each row execute function public.google_calendar_sync_state_touch_updated_at();

alter table public.google_calendar_sync_state enable row level security;

drop policy if exists google_calendar_sync_state_read on public.google_calendar_sync_state;
create policy google_calendar_sync_state_read
  on public.google_calendar_sync_state
  for select
  using (true);

comment on table public.google_calendar_sync_state is
  'Webhook channel + incremental sync token state per scope (salon, staff:<uuid>).';

create or replace function public.enqueue_appointment_outbox()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_salon_status text;
  v_staff_status text;
  v_scope text;
  v_payload jsonb;
  v_op text;
begin
  -- INSERT / UPDATE supported. DELETE handled as status=cancelled updates.
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

  insert into public.notifications_outbox (
    appointment_id, kind, target_scope, payload, status
  )
  values (
    coalesce(new.id, old.id),
    'google_calendar_event',
    'salon',
    v_payload,
    case when v_salon_status = 'connected' then 'pending' else 'skipped' end
  );

  v_scope := 'staff:' || coalesce(new.staff_id, old.staff_id)::text;
  if coalesce(new.staff_id, old.staff_id) is not null then
    select coalesce(google_calendar_status, 'disconnected')
      into v_staff_status
      from public.staff
      where id = coalesce(new.staff_id, old.staff_id);

    if v_staff_status = 'connected' then
      insert into public.notifications_outbox (
        appointment_id, kind, target_scope, payload, status
      )
      values (
        coalesce(new.id, old.id),
        'google_calendar_event',
        v_scope,
        v_payload,
        'pending'
      );
    end if;
  end if;

  return new;
exception when others then
  raise warning 'enqueue_appointment_outbox failed: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.enqueue_appointment_outbox() from public;

drop trigger if exists trg_appointments_enqueue_outbox on public.appointments;
create trigger trg_appointments_enqueue_outbox
after insert or update on public.appointments
for each row execute function public.enqueue_appointment_outbox();

