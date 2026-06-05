-- Онлайн-чат на лендинге: вкл/выкл из CRM (настройки сайта).
-- Значение в salon_settings.value: 'true' | 'false' (по умолчанию true).

set search_path = public;

insert into public.salon_settings (key, value)
values ('site_chat_enabled', 'true')
on conflict (key) do nothing;

drop policy if exists salon_settings_public_site_read on public.salon_settings;

create policy salon_settings_public_site_read
on public.salon_settings
for select
using (
  key in (
    'site_booking_cart_enabled',
    'reception_section_order',
    'public_booking_panel_enabled',
    'site_chat_enabled'
  )
);
