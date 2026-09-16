-- Phase 5: public vendor onboarding (token-gated, no vendor Auth).
-- Does not implement company review, Business Central, or Tally posting.

alter table public.vendors
  add column if not exists onboarding_started_at timestamptz,
  add column if not exists current_step integer not null default 1,
  add column if not exists form_snapshot jsonb,
  add column if not exists form_data jsonb not null default '{}'::jsonb,
  add column if not exists invite_expires_at timestamptz,
  add column if not exists last_accessed_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists invite_consumed_at timestamptz,
  add column if not exists template_version integer,
  add column if not exists legal_name text,
  add column if not exists vendor_type text,
  add column if not exists country text,
  add column if not exists registered_address text,
  add column if not exists bank_name text,
  add column if not exists bank_branch text,
  add column if not exists aadhaar_last4 text,
  add column if not exists aadhaar_hash text,
  add column if not exists tds_details text,
  add column if not exists additional_information text,
  add column if not exists declaration_accurate boolean not null default false;

alter table public.vendors drop constraint if exists vendors_current_step_check;
alter table public.vendors
  add constraint vendors_current_step_check check (current_step >= 1 and current_step <= 5);

alter table public.vendors drop constraint if exists vendors_aadhaar_last4_check;
alter table public.vendors
  add constraint vendors_aadhaar_last4_check
  check (aadhaar_last4 is null or aadhaar_last4 ~ '^[0-9]{4}$');

create index if not exists vendors_invite_token_hash_idx
  on public.vendors (invite_token_hash)
  where invite_token_hash is not null;

create index if not exists vendors_invite_expires_idx
  on public.vendors (invite_expires_at)
  where invite_expires_at is not null;

alter table public.vendor_contact_persons
  add column if not exists alternate_phone text,
  add column if not exists is_primary boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.vendor_gst_locations
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists updated_at timestamptz not null default now();

comment on column public.vendors.adhar_card_number is
  'DEPRECATED. Do not store full Aadhaar. Phase 5 writes aadhaar_last4 and aadhaar_hash only.';
comment on column public.vendors.invite_token_hash is
  'SHA-256 hex digest of the vendor invitation token. The raw token is never stored.';
comment on column public.vendors.form_snapshot is
  'Frozen copy of the company active form template (fields/version) captured when onboarding starts.';
comment on column public.vendors.rejection_reason is
  'Reserved for Phase 6 company rejection. Unused by Phase 5 UI.';

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
    new.status := old.status;
    new.submitted_at := old.submitted_at;
    new.onboarding_started_at := old.onboarding_started_at;
    new.form_snapshot := old.form_snapshot;
    new.form_data := old.form_data;
    new.dynamic_field_data := old.dynamic_field_data;
    new.invite_expires_at := old.invite_expires_at;
    new.invite_consumed_at := old.invite_consumed_at;
    new.template_id := old.template_id;
    new.template_version := old.template_version;
    new.pan_card_number := old.pan_card_number;
    new.adhar_card_number := old.adhar_card_number;
    new.aadhaar_last4 := old.aadhaar_last4;
    new.aadhaar_hash := old.aadhaar_hash;
    new.vendor_account_number := old.vendor_account_number;
    new.vendor_bank_ifsc_code := old.vendor_bank_ifsc_code;
    new.rejection_reason := old.rejection_reason;
  end if;

  return new;
end;
$$;

drop policy if exists "Company users view their vendor contacts" on public.vendor_contact_persons;
drop policy if exists "Companies select own vendor contacts" on public.vendor_contact_persons;
create policy "Companies select own vendor contacts"
  on public.vendor_contact_persons for select to authenticated
  using (
    public.is_active_company()
    and exists (
      select 1 from public.vendors v
      where v.id = vendor_contact_persons.vendor_id
        and v.company_user_id = auth.uid()
    )
  );

drop policy if exists "Company users view their vendor GST locations" on public.vendor_gst_locations;
drop policy if exists "Companies select own vendor gst locations" on public.vendor_gst_locations;
create policy "Companies select own vendor gst locations"
  on public.vendor_gst_locations for select to authenticated
  using (
    public.is_active_company()
    and exists (
      select 1 from public.vendors v
      where v.id = vendor_gst_locations.vendor_id
        and v.company_user_id = auth.uid()
    )
  );

drop policy if exists "Company users view their vendor documents" on public.vendor_documents;
drop policy if exists "Companies select own vendor documents" on public.vendor_documents;
create policy "Companies select own vendor documents"
  on public.vendor_documents for select to authenticated
  using (
    public.is_active_company()
    and exists (
      select 1 from public.vendors v
      where v.id = vendor_documents.vendor_id
        and v.company_user_id = auth.uid()
    )
  );

alter table public.vendor_contact_persons enable row level security;
alter table public.vendor_gst_locations enable row level security;
alter table public.vendor_documents enable row level security;

revoke all on public.vendor_contact_persons from anon;
revoke all on public.vendor_gst_locations from anon;
revoke all on public.vendor_documents from anon;
grant select on public.vendor_contact_persons to authenticated;
grant select on public.vendor_gst_locations to authenticated;
grant select on public.vendor_documents to authenticated;

create table if not exists public.vendor_onboarding_throttle (
  key text primary key,
  hit_count integer not null default 1,
  window_start timestamptz not null default now()
);

alter table public.vendor_onboarding_throttle enable row level security;
revoke all on public.vendor_onboarding_throttle from anon, authenticated;

revoke execute on function public.is_admin() from anon, public;
revoke execute on function public.is_active_company() from anon, public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_company() to authenticated;
revoke execute on function public.handle_new_user() from anon, public;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vendor-documents',
  'vendor-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Companies read own vendor files" on storage.objects;
create policy "Companies read own vendor files"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'vendor-documents'
    and public.is_active_company()
    and exists (
      select 1
      from public.vendors v
      where v.id::text = split_part(name, '/', 1)
        and v.company_user_id = auth.uid()
    )
  );
