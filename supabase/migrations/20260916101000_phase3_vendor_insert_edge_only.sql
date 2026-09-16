-- Company users must not insert vendor rows from the browser.
-- Invites go through the vms-company Edge Function so tokens are hashed server-side.

drop policy if exists "Companies insert own vendors" on public.vendors;
revoke insert on public.vendors from authenticated;
grant select, update on public.vendors to authenticated;
