-- 077_public_booking_holidays.sql
-- Public booking must respect salon-wide closed days from salon_holidays.

begin;

drop policy if exists "holidays_select" on public.salon_holidays;
create policy "holidays_select" on public.salon_holidays
  for select to anon, authenticated using (true);

create or replace function public.public_staff_busy_during(
  p_staff_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.salon_holidays h
     where p_start is not null
       and p_end is not null
       and p_end > p_start
       and h.holiday_date >= (p_start at time zone 'Europe/Tallinn')::date
       and h.holiday_date <= ((p_end - interval '1 millisecond') at time zone 'Europe/Tallinn')::date
  )
  or exists (
    select 1 from public.appointment_services a
    where a.staff_id = p_staff_id
      and a.start_time < p_end
      and a.end_time > p_start
  )
  or exists (
    select 1 from public.appointments a
    where a.staff_id = p_staff_id
      and a.start_time is not null
      and a.end_time is not null
      and a.start_time < p_end
      and a.end_time > p_start
      and not exists (
        select 1 from public.appointment_services s where s.appointment_id = a.id
      )
  )
  or exists (
    select 1 from public.staff_time_off t
    where t.staff_id = p_staff_id
      and t.start_time < p_end
      and t.end_time > p_start
  );
$$;

revoke all on function public.public_staff_busy_during(uuid, timestamptz, timestamptz) from public;
grant execute on function public.public_staff_busy_during(uuid, timestamptz, timestamptz)
  to anon, authenticated, service_role;

commit;
