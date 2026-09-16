-- Phase 1: profiles, roles, and authentication helpers.
-- Apply this against a fresh Supabase project (SQL editor or CLI).
-- Do not put service-role keys in the frontend.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  company_name text,
  company_mobile_number text,
  company_address text,
  gst_number text,
  role text not null default 'company',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('admin', 'company'))
);

create index if not exists profiles_role_idx on public.profiles (role);

alter table public.profiles enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and is_active = true
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can update their own company details" on public.profiles;
create policy "Users can update their own company details"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "Admins manage company profiles" on public.profiles;
create policy "Admins manage company profiles"
  on public.profiles
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin() and role = 'company');

revoke all on public.profiles from anon;
grant select, update, insert, delete on public.profiles to authenticated;

comment on table public.profiles is 'Application users. role is admin or company. New auth users get a company profile by default.';
