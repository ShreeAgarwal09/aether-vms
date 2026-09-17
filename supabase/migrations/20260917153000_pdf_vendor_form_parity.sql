-- PDF vendor form parity: reference states, extra vendor fields, GST location document links.

create table if not exists public.indian_state_codes (
  code text primary key,
  description text not null,
  gst_code text not null,
  etd_tcs_code text,
  created_at timestamptz not null default now()
);

insert into public.indian_state_codes (code, description, gst_code, etd_tcs_code) values
  ('AN', 'Andaman and Nicobar Islands', '35', '01'),
  ('AP', 'Andhra Pradesh', '37', '02'),
  ('AR', 'Arunachal Pradesh', '12', '03'),
  ('AS', 'Assam', '18', '04'),
  ('BR', 'Bihar', '10', '05'),
  ('CH', 'Chandigarh', '04', '06'),
  ('CT', 'Chhattisgarh', '22', '07'),
  ('DN', 'Dadra and Nagar Haveli and Daman and Diu', '26', '08'),
  ('DL', 'Delhi', '07', '09'),
  ('GA', 'Goa', '30', '10'),
  ('GJ', 'Gujarat', '24', '11'),
  ('HR', 'Haryana', '06', '12'),
  ('HP', 'Himachal Pradesh', '02', '13'),
  ('JK', 'Jammu and Kashmir', '01', '14'),
  ('JH', 'Jharkhand', '20', '15'),
  ('KA', 'Karnataka', '29', '16'),
  ('KL', 'Kerala', '32', '17'),
  ('LA', 'Ladakh', '38', '18'),
  ('LD', 'Lakshadweep', '31', '19'),
  ('MP', 'Madhya Pradesh', '23', '20'),
  ('MH', 'Maharashtra', '27', '21'),
  ('MN', 'Manipur', '14', '22'),
  ('ML', 'Meghalaya', '17', '23'),
  ('MZ', 'Mizoram', '15', '24'),
  ('NL', 'Nagaland', '13', '25'),
  ('OR', 'Odisha', '21', '26'),
  ('PY', 'Puducherry', '34', '27'),
  ('PB', 'Punjab', '03', '28'),
  ('RJ', 'Rajasthan', '08', '29'),
  ('SK', 'Sikkim', '11', '30'),
  ('TN', 'Tamil Nadu', '33', '31'),
  ('TS', 'Telangana', '36', '32'),
  ('TR', 'Tripura', '16', '33'),
  ('UP', 'Uttar Pradesh', '09', '34'),
  ('UT', 'Uttarakhand', '05', '35'),
  ('WB', 'West Bengal', '19', '36')
on conflict (code) do update
set
  description = excluded.description,
  gst_code = excluded.gst_code,
  etd_tcs_code = excluded.etd_tcs_code;

alter table public.indian_state_codes enable row level security;

drop policy if exists "Authenticated read indian state codes" on public.indian_state_codes;
create policy "Authenticated read indian state codes"
  on public.indian_state_codes
  for select
  to authenticated
  using (true);

revoke all on public.indian_state_codes from anon;
grant select on public.indian_state_codes to authenticated;

comment on table public.indian_state_codes is
  'Reference list of Indian states/UTs for vendor address dropdowns. Public onboarding reads via vms-vendor Edge Function.';

alter table public.vendors
  add column if not exists website_url text,
  add column if not exists vendor_email_as_per_bank text,
  add column if not exists registered_under_gst boolean,
  add column if not exists address_line2 text,
  add column if not exists more_than_one_gst boolean,
  add column if not exists number_of_gst_locations text,
  add column if not exists gst_filing_frequency text,
  add column if not exists nature_of_entity text,
  add column if not exists tds_deduction_rate numeric(5, 2);

alter table public.vendor_gst_locations
  add column if not exists address_line2 text;

alter table public.vendor_documents
  add column if not exists gst_location_id uuid references public.vendor_gst_locations (id) on delete cascade;

create index if not exists vendor_documents_gst_location_idx
  on public.vendor_documents (gst_location_id)
  where gst_location_id is not null;

alter table public.vendor_documents drop constraint if exists vendor_documents_type_check;
alter table public.vendor_documents
  add constraint vendor_documents_type_check
  check (
    document_type in (
      'cancelled_cheque',
      'gst_certificate',
      'pan_card',
      'aadhaar_card',
      'aadhaar_declaration',
      'msme_certificate',
      'e_invoice',
      'declaration_non_e_invoicing',
      'udhyam_certificate',
      'declaration_194q',
      'declaration_206ab',
      'gst_location',
      'supporting_document'
    )
  );
