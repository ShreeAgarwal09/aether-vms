-- Phase 7: Business Central OAuth/sync and Tally XML posting.
-- Does not change Phase 1–6 onboarding/review semantics except adding sync fields.

alter table public.vendors
  add column if not exists bc_sync_status text not null default 'not_started',
  add column if not exists bc_vendor_id text,
  add column if not exists bc_vendor_number text,
  add column if not exists bc_last_synced_at timestamptz,
  add column if not exists bc_last_error text,
  add column if not exists bc_sync_attempts integer not null default 0,
  add column if not exists bc_contact_sync_status text not null default 'not_started',
  add column if not exists bc_gst_sync_status text not null default 'not_started',
  add column if not exists bc_bank_sync_status text not null default 'not_started',
  add column if not exists bc_document_sync_status text not null default 'not_started',
  add column if not exists tally_sync_status text not null default 'not_started',
  add column if not exists tally_last_synced_at timestamptz,
  add column if not exists tally_last_error text,
  add column if not exists tally_sync_attempts integer not null default 0,
  add column if not exists tally_external_name text;

alter table public.vendors drop constraint if exists vendors_bc_sync_status_check;
alter table public.vendors
  add constraint vendors_bc_sync_status_check
  check (bc_sync_status in ('not_started', 'validating', 'creating', 'partial', 'synced', 'failed'));

alter table public.vendors drop constraint if exists vendors_tally_sync_status_check;
alter table public.vendors
  add constraint vendors_tally_sync_status_check
  check (tally_sync_status in ('not_started', 'pending', 'syncing', 'synced', 'failed', 'unsupported'));

create unique index if not exists vendors_bc_vendor_id_unique
  on public.vendors (company_user_id, bc_vendor_id)
  where bc_vendor_id is not null;

alter table public.ip_configs
  add column if not exists tally_company_name text,
  add column if not exists last_tested_at timestamptz,
  add column if not exists last_error text,
  add column if not exists last_sync_at timestamptz,
  add column if not exists connection_status text not null default 'unknown';

alter table public.ip_configs drop constraint if exists ip_configs_connection_status_check;
alter table public.ip_configs
  add constraint ip_configs_connection_status_check
  check (connection_status in ('unknown', 'connected', 'error', 'disabled'));

create table if not exists public.business_central_connections (
  id uuid primary key default gen_random_uuid(),
  company_user_id uuid not null unique references public.profiles (id) on delete cascade,
  tenant_id text,
  environment text not null default 'Production',
  bc_company_id text,
  bc_company_name text,
  connection_status text not null default 'not_connected',
  connected_at timestamptz,
  last_tested_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bc_connections_status_check
    check (connection_status in ('not_connected', 'connected', 'connection_error'))
);

create table if not exists public.business_central_tokens (
  company_user_id uuid primary key references public.profiles (id) on delete cascade,
  access_token_cipher text not null,
  refresh_token_cipher text,
  token_expires_at timestamptz,
  token_type text,
  scope text,
  updated_at timestamptz not null default now()
);

create table if not exists public.bc_oauth_states (
  state text primary key,
  company_user_id uuid not null references public.profiles (id) on delete cascade,
  code_verifier text not null,
  tenant_id text,
  environment text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.business_central_vendor_templates (
  id uuid primary key default gen_random_uuid(),
  company_user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  is_active boolean not null default false,
  field_mappings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists bc_vendor_templates_one_active
  on public.business_central_vendor_templates (company_user_id)
  where is_active;

create table if not exists public.bc_master_cache (
  id uuid primary key default gen_random_uuid(),
  company_user_id uuid not null references public.profiles (id) on delete cascade,
  resource_type text not null,
  external_id text not null,
  display_name text,
  payload_safe jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  unique (company_user_id, resource_type, external_id)
);

create table if not exists public.designations (
  id uuid primary key default gen_random_uuid(),
  company_user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  source text not null default 'local',
  created_at timestamptz not null default now()
);

create unique index if not exists designations_company_name_idx
  on public.designations (company_user_id, lower(name));

create table if not exists public.assessee_codes (
  id uuid primary key default gen_random_uuid(),
  company_user_id uuid not null references public.profiles (id) on delete cascade,
  code text not null,
  description text,
  source text not null default 'local',
  created_at timestamptz not null default now()
);

create unique index if not exists assessee_codes_company_code_idx
  on public.assessee_codes (company_user_id, lower(code));

create table if not exists public.integration_sync_logs (
  id uuid primary key default gen_random_uuid(),
  company_user_id uuid not null references public.profiles (id) on delete cascade,
  vendor_id uuid references public.vendors (id) on delete set null,
  integration_type text not null,
  operation text not null,
  status text not null,
  external_id text,
  error_code text,
  error_message text,
  metadata_safe_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint integration_sync_logs_type_check
    check (integration_type in ('business_central', 'tally')),
  constraint integration_sync_logs_status_check
    check (status in ('started', 'success', 'failed', 'partial', 'unsupported', 'skipped'))
);

create index if not exists integration_sync_logs_company_created_idx
  on public.integration_sync_logs (company_user_id, created_at desc);
create index if not exists integration_sync_logs_vendor_idx
  on public.integration_sync_logs (vendor_id, created_at desc);

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
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
    new.rejected_at := old.rejected_at;
    new.rejected_by := old.rejected_by;
    new.resubmitted_at := old.resubmitted_at;
    new.bank_name := old.bank_name;
    new.bank_branch := old.bank_branch;
    new.vendor_name_as_per_bank := old.vendor_name_as_per_bank;
    new.vendor_account_type := old.vendor_account_type;
    new.bc_sync_status := old.bc_sync_status;
    new.bc_vendor_id := old.bc_vendor_id;
    new.bc_vendor_number := old.bc_vendor_number;
    new.bc_last_synced_at := old.bc_last_synced_at;
    new.bc_last_error := old.bc_last_error;
    new.bc_sync_attempts := old.bc_sync_attempts;
    new.bc_contact_sync_status := old.bc_contact_sync_status;
    new.bc_gst_sync_status := old.bc_gst_sync_status;
    new.bc_bank_sync_status := old.bc_bank_sync_status;
    new.bc_document_sync_status := old.bc_document_sync_status;
    new.tally_sync_status := old.tally_sync_status;
    new.tally_last_synced_at := old.tally_last_synced_at;
    new.tally_last_error := old.tally_last_error;
    new.tally_sync_attempts := old.tally_sync_attempts;
    new.tally_external_name := old.tally_external_name;
  end if;

  return new;
end;
$$;

create or replace function public.protect_bc_connection_fields()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new.company_user_id := old.company_user_id;
    new.connection_status := old.connection_status;
    new.connected_at := old.connected_at;
    new.last_tested_at := old.last_tested_at;
    new.last_error := old.last_error;
    new.bc_company_id := old.bc_company_id;
    new.bc_company_name := old.bc_company_name;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_bc_connection_fields on public.business_central_connections;
create trigger protect_bc_connection_fields
  before update on public.business_central_connections
  for each row execute function public.protect_bc_connection_fields();

create or replace function public.protect_ip_config_server_fields()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new.company_user_id := old.company_user_id;
    new.last_tested_at := old.last_tested_at;
    new.last_error := old.last_error;
    new.last_sync_at := old.last_sync_at;
    new.connection_status := old.connection_status;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_ip_config_server_fields on public.ip_configs;
create trigger protect_ip_config_server_fields
  before update on public.ip_configs
  for each row execute function public.protect_ip_config_server_fields();

alter table public.business_central_connections enable row level security;
alter table public.business_central_tokens enable row level security;
alter table public.bc_oauth_states enable row level security;
alter table public.business_central_vendor_templates enable row level security;
alter table public.bc_master_cache enable row level security;
alter table public.designations enable row level security;
alter table public.assessee_codes enable row level security;
alter table public.integration_sync_logs enable row level security;

drop policy if exists "Companies select own bc connections" on public.business_central_connections;
create policy "Companies select own bc connections"
  on public.business_central_connections for select to authenticated
  using (company_user_id = auth.uid() and public.is_active_company());

drop policy if exists "Companies select own bc templates" on public.business_central_vendor_templates;
create policy "Companies select own bc templates"
  on public.business_central_vendor_templates for select to authenticated
  using (company_user_id = auth.uid() and public.is_active_company());

drop policy if exists "Companies select own bc master cache" on public.bc_master_cache;
create policy "Companies select own bc master cache"
  on public.bc_master_cache for select to authenticated
  using (company_user_id = auth.uid() and public.is_active_company());

drop policy if exists "Companies select own designations" on public.designations;
create policy "Companies select own designations"
  on public.designations for select to authenticated
  using (company_user_id = auth.uid() and public.is_active_company());

drop policy if exists "Companies select own assessee codes" on public.assessee_codes;
create policy "Companies select own assessee codes"
  on public.assessee_codes for select to authenticated
  using (company_user_id = auth.uid() and public.is_active_company());

drop policy if exists "Companies select own integration logs" on public.integration_sync_logs;
create policy "Companies select own integration logs"
  on public.integration_sync_logs for select to authenticated
  using (company_user_id = auth.uid() and public.is_active_company());

revoke all on public.business_central_connections from anon, authenticated, public;
revoke all on public.business_central_tokens from anon, authenticated, public;
revoke all on public.bc_oauth_states from anon, authenticated, public;
revoke all on public.business_central_vendor_templates from anon, authenticated, public;
revoke all on public.bc_master_cache from anon, authenticated, public;
revoke all on public.designations from anon, authenticated, public;
revoke all on public.assessee_codes from anon, authenticated, public;
revoke all on public.integration_sync_logs from anon, authenticated, public;

grant select (
  id, company_user_id, tenant_id, environment, bc_company_id, bc_company_name,
  connection_status, connected_at, last_tested_at, last_error, created_at, updated_at
) on public.business_central_connections to authenticated;

grant select (
  id, company_user_id, name, is_active, field_mappings, created_at, updated_at
) on public.business_central_vendor_templates to authenticated;

grant select (id, company_user_id, resource_type, external_id, display_name, payload_safe, fetched_at)
  on public.bc_master_cache to authenticated;

grant select (id, company_user_id, name, source, created_at) on public.designations to authenticated;
grant select (id, company_user_id, code, description, source, created_at) on public.assessee_codes to authenticated;
grant select (
  id, company_user_id, vendor_id, integration_type, operation, status, external_id,
  error_code, error_message, metadata_safe_json, created_at
) on public.integration_sync_logs to authenticated;

grant select (
  id, company_user_id, email, vendor_name, vendor_phone_number, status, invited_at,
  submitted_at, created_at, updated_at, rejection_reason, approved_at, rejected_at,
  resubmitted_at, current_step, legal_name, vendor_type, bc_sync_status, bc_vendor_id,
  bc_vendor_number, bc_last_synced_at, tally_sync_status, tally_last_synced_at
) on public.vendors to authenticated;

comment on table public.business_central_tokens is
  'OAuth tokens. No anon/authenticated grants. Edge Functions (service role) only.';
comment on table public.bc_oauth_states is
  'Short-lived PKCE/state records. Service role only.';
comment on column public.vendors.bc_gst_sync_status is
  'GST locations have no standard BC API v2.0 child resource. Extra locations are marked not_supported.';
comment on column public.vendors.bc_bank_sync_status is
  'Vendor bank details are not on the standard BC vendor resource. Company bankAccounts is a different entity.';
