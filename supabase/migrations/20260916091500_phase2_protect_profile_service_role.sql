create or replace function public.protect_profile_auth_fields()
returns trigger
language plpgsql
as $$
begin
  if new.id <> old.id then
    raise exception 'Profile identity cannot be changed';
  end if;

  -- Client JWTs cannot change email, role, or status. Service-role updates (auth.uid() is null) may.
  if auth.uid() is not null then
    if new.email is distinct from old.email then
      raise exception 'Email must be changed through authentication, not the profile record';
    end if;

    if new.role is distinct from old.role then
      raise exception 'Role cannot be changed from the client';
    end if;

    if new.is_active is distinct from old.is_active and not public.is_admin() then
      raise exception 'Account status can only be changed by an administrator';
    end if;
  end if;

  return new;
end;
$$;
