-- 072_disable_google_calendar_outbox.sql
-- External calendar integrations are removed. Public site, CRM and reception
-- bookings stay only in the internal appointments calendar.

drop trigger if exists trg_appointments_enqueue_outbox on public.appointments;
drop function if exists public.enqueue_appointment_outbox();

delete from public.notifications_outbox
where kind = 'google_calendar_event';
