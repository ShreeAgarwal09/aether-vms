-- Phase 3: company-owned vendors, invite-token hashes, and Tally IP foundation.
-- Extends the existing vendors table. Does not implement the vendor form, BC, or Tally XML.

create or replace function public.is_active_company()
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
      and role = 'company'
      and is_active = true
  );
$$;

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  company_user_id uuid not null references public.profiles (id) on delete restrict,
  email text not null,
  vendor_name text,
  vendor_phone_number text,
  status text not null default 'invited',
  invite_token_hash text,
  invited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vendors
  add column if not exists invite_token_hash text,
  add column if not exists invited_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.vendors drop constraint if exists vendors_status_check;

update public.vendors
set status = case
  when status in ('Invitation Email Sent', 'invited') then 'invited'
  when lower(status) = 'pending' then 'pending'
  when lower(status) = 'approved' then 'approved'
  when lower(status) = 'rejected' then 'rejected'
  when lower(status) = 'blocked' then 'blocked'
  else 'invited'
end;

alter table public.vendors
  add constraint vendors_status_check
  check (status in ('invited', 'pending', 'approved', 'rejected', 'blocked'));

alter table public.vendors alter column status set default 'invited';

update public.vendors
set invited_at = coalesce(invited_at, created_at)
where invited_at is null;

create unique index if not exists vendors_company_email_lower_idx
  on public.vendors (company_user_id, lower(email));

create index if not exists vendors_company_status_idx
  on public.vendors (company_user_id, status);

create index if not exists vendors_company_created_idx
  on public.vendors (company_user_id, created_at desc);

create or replace function public.touch_vendor_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vendors_updated_at on public.vendors;
create trigger vendors_updated_at
  before update on public.vendors
  for each row
  execute function public.touch_vendor_updated_at();

create or replace function public.enforce_vendor_company_owner()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.company_user_id := auth.uid();
    end if;
    if new.status is null or new.status = '' then
      new.status := 'invited';
    end if;
    if new.invited_at is null then
      new.invited_at := now();
    end if;
    return new;
  end if;

  if auth.uid() is not null then
    new.company_user_id := old.company_user_id;
    new.invite_token_hash := old.invite_token_hash;
    new.email := old.email;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_vendor_company_owner on public.vendors;
create trigger enforce_vendor_company_owner
  before insert or update on public.vendors
  for each row
  execute function public.enforce_vendor_company_owner();

create or replace function public.prevent_public_vendor_mutation()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'anon' then
    if new.email is distinct from old.email
      or new.company_user_id is distinct from old.company_user_id
      or new.invite_token_hash is distinct from old.invite_token_hash
      or new.status is distinct from old.status then
      raise exception 'Public vendor access cannot change ownership, email, token, or status';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_vendor_invitation_fields on public.vendors;
create trigger protect_vendor_invitation_fields
  before update on public.vendors
  for each row
  execute function public.prevent_public_vendor_mutation();

alter table public.vendors enable row level security;

drop policy if exists "Admins delete vendors" on public.vendors;
drop policy if exists "Company users create their own vendors" on public.vendors;
drop policy if exists "Company users update their own vendors" on public.vendors;
drop policy if exists "Company users view their own vendors" on public.vendors;
drop policy if exists "Companies select own vendors" on public.vendors;
drop policy if exists "Companies insert own vendors" on public.vendors;
drop policy if exists "Companies update own vendors" on public.vendors;
drop policy if exists "Admins select vendors" on public.vendors;

create policy "Companies select own vendors"
  on public.vendors
  for select
  to authenticated
  using (company_user_id = auth.uid() and public.is_active_company());

create policy "Companies update own vendors"
  on public.vendors
  for update
  to authenticated
  using (company_user_id = auth.uid() and public.is_active_company())
  with check (company_user_id = auth.uid() and public.is_active_company());

create policy "Admins select vendors"
  on public.vendors
  for select
  to authenticated
  using (public.is_admin());

revoke all on public.vendors from anon;
grant select, update on public.vendors to authenticated;

create table if not exists public.ip_configs (
  id uuid primary key default gen_random_uuid(),
  company_user_id uuid not null unique references public.profiles (id) on delete cascade,
  tally_host text,
  tally_port integer,
  is_enabled boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ip_configs_port_check check (
    tally_port is null or (tally_port >= 1 and tally_port <= 65535)
  )
);

create index if not exists ip_configs_company_user_idx
  on public.ip_configs (company_user_id);

alter table public.ip_configs enable row level security;

drop policy if exists "Companies manage own ip config" on public.ip_configs;
drop policy if exists "Admins select ip configs" on public.ip_configs;

create policy "Companies manage own ip config"
  on public.ip_configs
  for all
  to authenticated
  using (company_user_id = auth.uid() and public.is_active_company())
  with check (company_user_id = auth.uid() and public.is_active_company());

create policy "Admins select ip configs"
  on public.ip_configs
  for select
  to authenticated
  using (public.is_admin());

revoke all on public.ip_configs from anon;
grant select, insert, update on public.ip_configs to authenticated;

comment on table public.vendors is 'Company-owned vendor invitations. Ownership is company_user_id (the company profile). Invitation secrets are stored only as invite_token_hash.';
comment on column public.vendors.invite_token_hash is 'SHA-256 hex digest of the one-time vendor invitation token. The raw token is emailed and never stored.';
comment on table public.ip_configs is 'Tally connection settings only. No Tally XML or posting is implemented in Phase 3.';
