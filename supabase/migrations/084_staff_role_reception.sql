-- 084_staff_role_reception.sql
-- Новая роль "reception" (общий аккаунт стойки ресепшена). Он может добавлять
-- в график любого мастера, но НЕ бывает мастером сам (фильтруется из
-- календарей/списков). Право удалять рабочие дни и закрывать салон — только у
-- manager/admin; reception и worker — только добавляют (это на уровне UI).
--
-- Здесь только расширяем CHECK-ограничение допустимых ролей на staff.roles,
-- чтобы можно было присвоить 'reception'. Идемпотентно.

begin;

alter table public.staff drop constraint if exists staff_roles_allowed;
alter table public.staff
  add constraint staff_roles_allowed
  check (
    roles <@ array['owner','admin','manager','worker','reception']::text[]
  );

commit;
