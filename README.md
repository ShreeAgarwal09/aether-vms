# Vendor Management System

Phase 3 of the Vendor Management System: company portal, vendor invitations, and profile/settings on top of Phase 1 auth and Phase 2 admin company-user management.

Phase 4 form builder, the 5-step vendor form, Business Central, and Tally posting are not included.

## Local setup

1. `npm install`
2. `cp .env.example .env.local` and set **public** values only:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Apply migrations in `supabase/migrations/` (Phase 1–3).
4. Deploy Edge Functions:
   - `vms-admin` (Phase 2)
   - `vms-company` (Phase 3 invites)
5. Create an Auth user and promote it to admin, then add company users from the Admin console.
6. `npm run dev` — http://127.0.0.1:45217

Never put the Supabase **service-role** key in Vite or React.

## Company routes

| Path | Purpose |
| --- | --- |
| `/company` | Master dashboard and vendor stats |
| `/company/vendors` | Vendor list, search, filters, Excel export |
| `/company/vendors/invite` | Invite one vendor |
| `/company/vendors/bulk` | Bulk Excel invite |
| `/company/vendors/:id` | Stored vendor details (no 5-step form) |
| `/company/sync` | Refresh local vendor data (no BC) |
| `/company/form-builder` | Phase 4 placeholder |
| `/company/profile` | Company profile |
| `/company/password` | Change password |
| `/company/tally` | Tally host/port settings only |

## Security

- Vendors are owned by `company_user_id` (the company profile). RLS plus an insert trigger bind rows to `auth.uid()`.
- Company users cannot insert vendors from the browser. Invites go through `vms-company`, which hashes the invitation token (SHA-256) and never returns the raw token.
- Duplicate vendor emails are unique per company (`lower(email)`).
- Blocked company users (`is_active = false`) cannot read or update vendors.

## Email (optional)

Set these on the `vms-company` Edge Function (Supabase secrets), not in the frontend:

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `APP_BASE_URL` (optional; falls back to the request Origin)

If they are missing, the vendor row is still created and the UI reports that mail is pending configuration.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run lint`
