-- 081_public_booking_respect_work_dates.sql
-- Публичная запись с сайта («Мастер — не важно», а также явный выбор мастера)
-- должна учитывать реальные рабочие дни мастера из staff_work_dates.
--
-- Проблема: public_staff_busy_during() проверяла только праздники салона,
-- пересечения с записями и отгулы (staff_time_off), но НЕ проверяла, работает ли
-- мастер в этот день вообще. Из-за этого «не важно» отдавало запись первому по
-- алфавиту мастеру, который умеет услугу и не занят (обычно Anne) — даже если в
-- этот день его нет в графике. Такую запись потом сложно вести: она висит на
-- мастере, которого нет.
--
-- Источник истины по рабочим дням — та же таблица staff_work_dates, по которой
-- сайт строит свободные слоты (см. supaSlotsForStaffDay в script.js). Здесь мы
-- добавляем это же условие в серверный guard: мастер, у которого нет строки
-- staff_work_dates на дату записи (по времени Таллина), считается недоступным.
--
-- Идемпотентно (create or replace). Правка только ужесточает подбор: создать
-- некорректную запись она не может — в худшем случае вернёт 'no_free_master'.

begin;

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
  -- Мастер не работает в этот день (нет строки в staff_work_dates) → недоступен.
  -- work_date приводим к тексту, чтобы условие работало и для date, и для text.
  select not exists (
    select 1
      from public.staff_work_dates wd
     where wd.staff_id = p_staff_id
       and wd.work_date::text
           = to_char((p_start at time zone 'Europe/Tallinn')::date, 'YYYY-MM-DD')
  )
  or exists (
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
