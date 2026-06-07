-- Shared reception email/password login with worker-only privileges.
-- Password is stored as a bcrypt hash; the plaintext password is intentionally not in git.

set search_path = public, auth;

do $$
declare
  v_email constant text := 'alessanna.ilusalong@gmail.com';
  v_staff_id uuid;
  v_user_id uuid;
  v_password_hash constant text := '$2a$06$I9rLdYVecjvyRADiYgq3W.01JNeWN2fJoDPi37S7EHklfjTznQohS';
begin
  select id into v_staff_id
  from public.staff
  where lower(email) = lower(v_email)
  limit 1;

  if v_staff_id is null then
    insert into public.staff (
      name,
      phone,
      email,
      role,
      roles,
      is_active,
      show_on_marketing_site
    )
    values (
      'Reception',
      null,
      v_email,
      'worker',
      array['worker']::text[],
      true,
      false
    )
    returning id into v_staff_id;
  else
    update public.staff
    set name = coalesce(nullif(name, ''), 'Reception'),
        role = 'worker',
        roles = array['worker']::text[],
        is_active = true,
        show_on_marketing_site = false
    where id = v_staff_id;
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower(v_email)
  limit 1;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      phone_change,
      phone_change_token,
      email_change_token_current,
      reauthentication_token,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      v_password_hash,
      now(),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
      now(),
      now()
    );
  else
    update auth.users
    set encrypted_password = v_password_hash,
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        confirmation_token = coalesce(confirmation_token, ''),
        recovery_token = coalesce(recovery_token, ''),
        email_change_token_new = coalesce(email_change_token_new, ''),
        email_change = coalesce(email_change, ''),
        phone_change = coalesce(phone_change, ''),
        phone_change_token = coalesce(phone_change_token, ''),
        email_change_token_current = coalesce(email_change_token_current, ''),
        reauthentication_token = coalesce(reauthentication_token, ''),
        raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
          || jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
        updated_at = now()
    where id = v_user_id;
  end if;

  insert into auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    v_user_id::text,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email',
    now(),
    now(),
    now()
  )
  on conflict (provider_id, provider) do update
    set user_id = excluded.user_id,
        identity_data = excluded.identity_data,
        updated_at = now();
end $$;
