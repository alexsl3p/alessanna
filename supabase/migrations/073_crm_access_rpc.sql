-- 073_crm_access_rpc.sql
-- Move the CRM access password gate from the client JS bundle to Supabase.
-- The hardcoded string comparison in ReceptionSidebar.tsx is replaced by
-- a server-side RPC so the password is never exposed in the frontend bundle.
--
-- To change the password (SQL Editor):
--   UPDATE public.salon_settings
--   SET value = crypt('newpassword', gen_salt('bf', 8))
--   WHERE key = 'crm_access_password';

create extension if not exists pgcrypto;

-- Persist hashed password in salon_settings; ON CONFLICT DO NOTHING so a
-- manually set password is never overwritten by re-running this migration.
insert into public.salon_settings (key, value)
values ('crm_access_password', crypt('2025alessanna', gen_salt('bf', 8)))
on conflict (key) do nothing;

-- RPC callable by anon (reception kiosk is not authenticated as staff).
create or replace function public.verify_crm_access(p_password text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
begin
  select value into v_hash
  from public.salon_settings
  where key = 'crm_access_password';
  if v_hash is null then return false; end if;
  return crypt(p_password, v_hash) = v_hash;
end;
$$;

revoke all on function public.verify_crm_access(text) from public;
grant execute on function public.verify_crm_access(text) to anon, authenticated;

comment on function public.verify_crm_access(text) is
  'Validates the reception→CRM gate password against the bcrypt hash stored in salon_settings. '
  'Called by the reception kiosk UI (anon key). Never returns the hash itself.';
