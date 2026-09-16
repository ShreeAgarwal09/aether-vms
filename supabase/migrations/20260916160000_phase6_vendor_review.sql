-- Phase 6: company vendor review, approve/reject, resubmission audit.
-- Does not implement Business Central, Tally posting, or OAuth.

alter table public.vendors
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles (id) on delete set null,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references public.profiles (id) on delete set null,
  add column if not exists resubmitted_at timestamptz;

comment on column public.vendors.rejection_reason is
  'Latest rejection explanation shown to the vendor while status is rejected. Historical reasons live in vendor_review_history.';

create table if not exists public.vendor_review_history (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  company_user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint vendor_review_history_action_check
    check (action in ('submitted', 'approved', 'rejected', 'resubmitted'))
);

create index if not exists vendor_review_history_vendor_created_idx
  on public.vendor_review_history (vendor_id, created_at desc);

alter table public.vendor_review_history enable row level security;

drop policy if exists "Companies select own vendor review history" on public.vendor_review_history;
create policy "Companies select own vendor review history"
  on public.vendor_review_history
  for select
  to authenticated
  using (
    public.is_active_company()
    and exists (
      select 1 from public.vendors v
      where v.id = vendor_review_history.vendor_id
        and v.company_user_id = auth.uid()
    )
  );

drop policy if exists "Admins select vendor review history" on public.vendor_review_history;
create policy "Admins select vendor review history"
  on public.vendor_review_history
  for select
  to authenticated
  using (public.is_admin());

revoke all on public.vendor_review_history from anon, authenticated, public;
grant select on public.vendor_review_history to authenticated;

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
  end if;

  return new;
end;
$$;

revoke update on public.vendors from authenticated;
revoke select on public.vendors from authenticated;

grant select (
  id,
  company_user_id,
  email,
  vendor_name,
  vendor_phone_number,
  status,
  invited_at,
  submitted_at,
  created_at,
  updated_at,
  rejection_reason,
  approved_at,
  rejected_at,
  resubmitted_at,
  current_step,
  legal_name,
  vendor_type
) on public.vendors to authenticated;

revoke all on public.vendor_contact_persons from anon, authenticated;
revoke all on public.vendor_gst_locations from anon, authenticated;
revoke all on public.vendor_documents from anon, authenticated;

drop policy if exists "Companies read own vendor files" on storage.objects;

comment on table public.vendor_review_history is
  'Append-only review events written by Edge Functions. Browser clients cannot insert.';
