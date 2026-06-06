-- 075_clients_profile_and_autocomplete.sql
-- Client profiles for CRM + reception autocomplete toggle.

begin;

alter table public.clients
  add column if not exists last_name text,
  add column if not exists notes text;

alter table public.appointments
  add column if not exists client_email text;

create index if not exists clients_name_search_idx
  on public.clients (lower(name), lower(coalesce(last_name, '')));

insert into public.salon_settings (key, value)
values ('crm_client_autocomplete_enabled', 'true')
on conflict (key) do nothing;

drop function if exists public.public_book_chain(text, text, text, timestamptz, jsonb, text, uuid);

create or replace function public.public_book_chain(
  p_client_name text,
  p_client_phone text,
  p_client_note text,
  p_start_at timestamptz,
  p_items jsonb,
  p_source text default 'public_site',
  p_created_by_staff_id uuid default null,
  p_client_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(btrim(coalesce(p_client_name, '')), '');
  v_phone text := nullif(btrim(coalesce(p_client_phone, '')), '');
  v_note text := nullif(btrim(coalesce(p_client_note, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_client_email, ''))), '');
  v_source text;
  v_created_by uuid;
  v_item jsonb;
  v_items_out jsonb := '[]'::jsonb;
  v_service_id uuid;
  v_wanted_staff text;
  v_service record;
  v_staff_id uuid;
  v_staff_name text;
  v_cursor timestamptz;
  v_end timestamptz;
  v_dur int;
  v_buf int;
  v_appointment_id uuid;
  v_client_id uuid;
  v_idx int := 0;
  v_count int;
  v_cand uuid;
begin
  if v_name is null then
    return jsonb_build_object('ok', false, 'error', 'missing_name',
      'message', 'Имя посетителя обязательно.');
  end if;
  if p_start_at is null then
    return jsonb_build_object('ok', false, 'error', 'missing_start',
      'message', 'Не указано стартовое время.');
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid_items',
      'message', 'Ожидается массив услуг.');
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'empty_items',
      'message', 'Выберите хотя бы одну услугу.');
  end if;
  if v_count > 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many_items',
      'message', 'Слишком много услуг за один визит.');
  end if;

  v_source := lower(coalesce(nullif(btrim(p_source), ''), 'public_site'));
  if v_source not in ('public_site', 'reception', 'crm') then
    v_source := 'public_site';
  end if;

  v_created_by := null;
  if p_created_by_staff_id is not null then
    select id into v_created_by
      from public.staff
      where id = p_created_by_staff_id
        and is_active = true;
  end if;

  if v_phone is not null then
    select id into v_client_id from public.clients
      where phone = v_phone limit 1;
    if v_client_id is null then
      insert into public.clients (name, phone, email)
      values (v_name, v_phone, v_email)
      returning id into v_client_id;
    else
      update public.clients
         set name = v_name,
             email = coalesce(v_email, email)
       where id = v_client_id
         and (name is distinct from v_name or (v_email is not null and email is distinct from v_email));
    end if;
  elsif v_email is not null then
    select id into v_client_id from public.clients
      where lower(email) = v_email limit 1;
    if v_client_id is null then
      insert into public.clients (name, phone, email)
      values (v_name, null, v_email)
      returning id into v_client_id;
    else
      update public.clients set name = v_name where id = v_client_id and name is distinct from v_name;
    end if;
  else
    insert into public.clients (name, phone, email)
    values (v_name, null, null)
    returning id into v_client_id;
  end if;

  v_cursor := p_start_at;

  for v_idx in 0 .. (v_count - 1) loop
    v_item := p_items -> v_idx;

    if jsonb_typeof(v_item) is distinct from 'object' then
      return jsonb_build_object('ok', false, 'error', 'invalid_item',
        'message', 'Некорректный элемент в списке услуг.',
        'hint', jsonb_build_object('index', v_idx));
    end if;

    begin
      v_service_id := nullif(v_item ->> 'service_id', '')::uuid;
    exception when others then
      v_service_id := null;
    end;
    if v_service_id is null then
      return jsonb_build_object('ok', false, 'error', 'invalid_service',
        'message', 'Не указана услуга.',
        'hint', jsonb_build_object('index', v_idx));
    end if;

    select sl.id, sl.name, coalesce(sl.is_active, true) as is_active,
           sl.duration, coalesce(sl.buffer_after_min, 0) as buffer_after_min
      into v_service
      from public.service_listings sl
      where sl.id = v_service_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'service_not_found',
        'message', 'Услуга не найдена.',
        'hint', jsonb_build_object('index', v_idx, 'service_id', v_service_id));
    end if;
    if not v_service.is_active then
      return jsonb_build_object('ok', false, 'error', 'service_inactive',
        'message', 'Услуга сейчас недоступна.',
        'hint', jsonb_build_object('index', v_idx, 'service_id', v_service_id));
    end if;
    v_dur := coalesce(v_service.duration, 0);
    v_buf := coalesce(v_service.buffer_after_min, 0);
    if v_dur <= 0 then
      return jsonb_build_object('ok', false, 'error', 'service_no_duration',
        'message', 'Для услуги не указана длительность.',
        'hint', jsonb_build_object('index', v_idx, 'service_id', v_service_id));
    end if;
    v_end := v_cursor + make_interval(mins => v_dur);

    v_wanted_staff := coalesce(v_item ->> 'staff_id', '');
    v_staff_id := null;
    if v_wanted_staff is null or v_wanted_staff = '' or v_wanted_staff = 'any' then
      for v_cand in
        select s.id
          from public.staff s
         where s.is_active = true
           and coalesce(s.show_on_marketing_site, true) <> false
           and public.public_staff_does_service(s.id, v_service_id)
         order by s.name
      loop
        if not public.public_staff_busy_during(v_cand, v_cursor, v_end) then
          v_staff_id := v_cand;
          exit;
        end if;
      end loop;
      if v_staff_id is null then
        return jsonb_build_object('ok', false, 'error', 'no_free_master',
          'message', 'Нет свободного мастера для услуги в выбранное время.',
          'hint', jsonb_build_object(
            'index', v_idx,
            'service_id', v_service_id,
            'start_time', v_cursor,
            'end_time', v_end
          ));
      end if;
    else
      begin
        v_staff_id := v_wanted_staff::uuid;
      exception when others then
        return jsonb_build_object('ok', false, 'error', 'invalid_staff',
          'message', 'Некорректный мастер.',
          'hint', jsonb_build_object('index', v_idx));
      end;

      if not exists (
        select 1 from public.staff s
        where s.id = v_staff_id
          and s.is_active = true
          and coalesce(s.show_on_marketing_site, true) <> false
      ) then
        return jsonb_build_object('ok', false, 'error', 'staff_unavailable',
          'message', 'Выбранный мастер недоступен.',
          'hint', jsonb_build_object('index', v_idx, 'staff_id', v_staff_id));
      end if;

      if not public.public_staff_does_service(v_staff_id, v_service_id) then
        return jsonb_build_object('ok', false, 'error', 'staff_not_service',
          'message', 'Этот мастер не делает выбранную услугу.',
          'hint', jsonb_build_object('index', v_idx,
            'staff_id', v_staff_id, 'service_id', v_service_id));
      end if;

      if public.public_staff_busy_during(v_staff_id, v_cursor, v_end) then
        return jsonb_build_object('ok', false, 'error', 'staff_busy',
          'message', 'Мастер занят в выбранное время.',
          'hint', jsonb_build_object('index', v_idx,
            'staff_id', v_staff_id, 'start_time', v_cursor, 'end_time', v_end));
      end if;
    end if;

    select s.name into v_staff_name from public.staff s where s.id = v_staff_id;

    v_items_out := v_items_out || jsonb_build_array(jsonb_build_object(
      'service_id', v_service_id,
      'service_name', v_service.name,
      'staff_id', v_staff_id,
      'staff_name', v_staff_name,
      'start_time', v_cursor,
      'end_time', v_end,
      'duration_min', v_dur,
      'buffer_after_min', v_buf
    ));

    v_cursor := v_end + make_interval(mins => v_buf);
  end loop;

  insert into public.appointments (
    staff_id, service_id, client_id, client_name, client_phone, client_email,
    start_time, end_time, note, source, created_by_staff_id
  )
  values (
    (v_items_out->0->>'staff_id')::uuid,
    (v_items_out->0->>'service_id')::uuid,
    v_client_id,
    v_name,
    v_phone,
    v_email,
    (v_items_out->0->>'start_time')::timestamptz,
    (v_items_out->(jsonb_array_length(v_items_out) - 1)->>'end_time')::timestamptz,
    v_note,
    v_source,
    v_created_by
  )
  returning id into v_appointment_id;

  insert into public.appointment_services (
    appointment_id, service_id, staff_id, start_time, end_time
  )
  select
    v_appointment_id,
    (x->>'service_id')::uuid,
    (x->>'staff_id')::uuid,
    (x->>'start_time')::timestamptz,
    (x->>'end_time')::timestamptz
  from jsonb_array_elements(v_items_out) x;

  return jsonb_build_object(
    'ok', true,
    'appointment_id', v_appointment_id,
    'client_id', v_client_id,
    'note', v_note,
    'source', v_source,
    'created_by_staff_id', v_created_by,
    'items', v_items_out
  );
end;
$$;

revoke all on function
  public.public_book_chain(text, text, text, timestamptz, jsonb, text, uuid, text)
  from public;
grant execute on function
  public.public_book_chain(text, text, text, timestamptz, jsonb, text, uuid, text)
  to anon, authenticated, service_role;

comment on column public.clients.last_name is 'Optional client surname for CRM profile search/display.';
comment on column public.clients.notes is 'Internal CRM notes about the client.';
comment on function
  public.public_book_chain(text, text, text, timestamptz, jsonb, text, uuid, text)
is
  'Public booking endpoint for multi-service chain. Persists client profile, optional email, note, source and created_by_staff_id.';

commit;
