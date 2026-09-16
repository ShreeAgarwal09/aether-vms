-- QA follow-up: company vendor data is not readable by admin JWTs.
-- Admin privileged operations already use the service role in vms-admin.

drop policy if exists "Admins select vendors" on public.vendors;
drop policy if exists "Admins select ip configs" on public.ip_configs;
drop policy if exists "Admins select vendor review history" on public.vendor_review_history;
