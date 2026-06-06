-- PWA email auth: добавляем email к staff + функция для получения staff по auth.users email.
-- После применения: администратор задаёт email в карточке мастера; мастер регистрируется
-- в PWA с тем же адресом → функция связывает сессию с записью staff.

set search_path = public, auth;

alter table public.staff add column if not exists email text;

create unique index if not exists staff_email_unique_idx
  on public.staff (lower(email))
  where email is not null;

-- Возвращает staff-запись для текущего пользователя Supabase Auth по email.
create or replace function public.staff_get_by_auth_email()
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_staff record;
begin
  select au.email into v_email
  from auth.users au
  where au.id = auth.uid()
  limit 1;

  if v_email is null then
    return json_build_object('status', 'unauthenticated');
  end if;

  select s.* into v_staff
  from public.staff s
  where lower(s.email) = lower(v_email)
    and s.is_active = true
  limit 1;

  if not found then
    return json_build_object('status', 'not_found');
  end if;

  return json_build_object(
    'status', 'ok',
    'staff', json_build_object(
      'id',       v_staff.id,
      'name',     v_staff.name,
      'phone',    v_staff.phone,
      'is_active',v_staff.is_active,
      'roles',    v_staff.roles,
      'role',     v_staff.role
    )
  );
end;
$$;

grant execute on function public.staff_get_by_auth_email() to authenticated;
