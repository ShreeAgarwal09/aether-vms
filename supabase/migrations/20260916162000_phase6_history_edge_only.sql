-- Phase 6: review history is not directly readable by browser clients.
-- Company UI loads history through vms-company (service role).

revoke all on public.vendor_review_history from anon, authenticated, public;
