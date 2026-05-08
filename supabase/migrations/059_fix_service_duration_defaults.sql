-- 059_fix_service_duration_defaults.sql
-- Исправляет услуги без длительности, из-за которых public_book_chain
-- возвращает service_no_duration.

-- Актуальный каталог (service_listings): длительность обязательна для онлайн-записи.
update public.service_listings
set duration = 60
where coalesce(duration, 0) <= 0;

alter table public.service_listings
  alter column duration set default 60;

-- Legacy-таблица services (используется в отдельных CRM-экранах/фолбэках).
update public.services
set duration_min = 60
where duration_min is null or duration_min <= 0;
