-- Disable online booking for Galina across her existing services.
-- Keep staff.is_active, staff.show_on_marketing_site, service links,
-- work dates and appointments unchanged so reception retains her calendar.
-- public_book_chain checks public_staff_does_service for explicit and "any" staff.
begin;

do $$
declare
  v_staff_id uuid;
begin
  if (select count(*) from public.staff where lower(btrim(name)) = 'galina') <> 1 then
    raise exception 'Expected exactly one staff member named Galina';
  end if;

  select id into v_staff_id
  from public.staff
  where lower(btrim(name)) = 'galina';

  if not exists (select 1 from public.staff_services where staff_id = v_staff_id) then
    raise exception 'Galina must have explicit service links before disabling public booking';
  end if;

  update public.staff_services
  set show_on_site = false
  where staff_id = v_staff_id
    and show_on_site is distinct from false;
end;
$$;

commit;
