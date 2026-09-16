-- Phase 2: company-user management on the existing profiles table.
-- Auth user create/delete/password emails stay in the vms-admin Edge Function.

alter table public.profiles
  add column if not exists full_name text,
  add column if not exists updated_at timestamptz not null default now();

update public.profiles
set full_name = coalesce(nullif(full_name, ''), nullif(company_name, ''), split_part(email, '@', 1))
where full_name is null or btrim(full_name) = '';

create unique index if not exists profiles_email_lower_idx
  on public.profiles (lower(email));

create index if not exists profiles_is_active_idx
  on public.profiles (is_active);

create index if not exists profiles_created_at_idx
  on public.profiles (created_at desc);

create index if not exists profiles_company_role_idx
  on public.profiles (role, is_active)
  where role = 'company';

create or replace function public.touch_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.touch_profile_updated_at();

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

drop trigger if exists protect_profile_auth_fields on public.profiles;
create trigger protect_profile_auth_fields
  before update on public.profiles
  for each row
  execute function public.protect_profile_auth_fields();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, company_name, role, is_active)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'company_name', ''),
    'company',
    true
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        company_name = coalesce(public.profiles.company_name, excluded.company_name);
  return new;
end;
$$;

drop policy if exists "Admins manage company profiles" on public.profiles;
drop policy if exists "Users can update their own company details" on public.profiles;
drop policy if exists "Admins read company profiles" on public.profiles;
drop policy if exists "Admins update company profiles" on public.profiles;

create policy "Admins read company profiles"
  on public.profiles
  for select
  to authenticated
  using (public.is_admin() and role = 'company');

create policy "Admins update company profiles"
  on public.profiles
  for update
  to authenticated
  using (public.is_admin() and role = 'company')
  with check (public.is_admin() and role = 'company');

create policy "Users can update their own company details"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and is_active = (select p.is_active from public.profiles p where p.id = auth.uid())
  );

revoke insert, delete, truncate on public.profiles from authenticated;
grant select, update on public.profiles to authenticated;

-- Future vendor rows must not disappear if a company Auth user is removed.
alter table if exists public.vendors
  drop constraint if exists vendors_company_user_id_fkey;

alter table if exists public.vendors
  add constraint vendors_company_user_id_fkey
  foreign key (company_user_id)
  references public.profiles (id)
  on delete restrict;

comment on column public.profiles.full_name is 'Display name of the company user. Required in the Admin create/edit UI.';
comment on table public.profiles is 'Auth-linked application users. Company create/delete is performed by the vms-admin Edge Function so Auth and profile rows stay aligned. Hard delete is refused when vendor rows exist.';
