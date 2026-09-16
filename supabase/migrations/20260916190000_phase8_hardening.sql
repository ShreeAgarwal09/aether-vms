-- Phase 8: RLS grant hardening, storage privacy, justified indexes.
-- Does not rewrite Phase 1–7 policies; only tightens leftover privileges.

revoke all on table public.profiles from anon, public;
grant select, update on table public.profiles to authenticated;

revoke insert, update, delete, truncate, references, trigger on table public.ip_configs from anon, authenticated, public;
grant select on table public.ip_configs to authenticated;

revoke all on table public.vendor_onboarding_throttle from anon, authenticated, public;
revoke all on table public.business_central_tokens from anon, authenticated, public;
revoke all on table public.bc_oauth_states from anon, authenticated, public;

drop policy if exists "Companies update own vendors" on public.vendors;

revoke execute on function public.handle_new_user() from anon, authenticated, public;

create index if not exists vendors_email_idx
  on public.vendors (lower(email));

create index if not exists business_central_connections_company_idx
  on public.business_central_connections (company_user_id);

update storage.buckets
set public = false
where id in ('vendor-documents', 'vendor-gst-locations');

comment on table public.ip_configs is
  'Tally connection settings. Browser clients may SELECT own rows; writes go through vms-tally.';
