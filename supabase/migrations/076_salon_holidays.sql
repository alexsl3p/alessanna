-- 076_salon_holidays.sql
-- Таблица праздничных / закрытых дней салона.

begin;

create table if not exists public.salon_holidays (
  id           uuid        default gen_random_uuid() primary key,
  holiday_date date        not null unique,
  reason       text,
  created_at   timestamptz default now()
);

alter table public.salon_holidays enable row level security;

create policy "holidays_select" on public.salon_holidays
  for select to authenticated using (true);

create policy "holidays_all" on public.salon_holidays
  for all to authenticated using (true) with check (true);

commit;
