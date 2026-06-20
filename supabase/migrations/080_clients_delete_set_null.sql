begin;

alter table public.appointments
  drop constraint if exists appointments_client_id_fkey;

alter table public.appointments
  add constraint appointments_client_id_fkey
  foreign key (client_id)
  references public.clients (id)
  on delete set null;

commit;
