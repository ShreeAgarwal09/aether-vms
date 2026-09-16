-- Phase 6 follow-up: drop leftover table-level mutation privileges on vendors.
-- Column-level SELECT for the company directory remains.

revoke insert, update, delete, truncate, references, trigger on public.vendors from anon, authenticated;
revoke all on public.vendor_review_history from anon;
revoke insert, update, delete, truncate, references, trigger on public.vendor_review_history from authenticated;
grant select on public.vendor_review_history to authenticated;
