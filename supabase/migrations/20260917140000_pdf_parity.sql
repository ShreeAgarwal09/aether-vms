-- PDF parity: BC contact sync metadata on vendors.

alter table public.vendors
  add column if not exists company_no text,
  add column if not exists company_name text;

comment on column public.vendors.company_no is 'Business Central contact or company number when synced from ERP.';
comment on column public.vendors.company_name is 'Business Central company or contact display name when synced from ERP.';
