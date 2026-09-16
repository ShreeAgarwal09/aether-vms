# Vendor Management System

Company portal, admin console, Form Builder, and public vendor onboarding (Phase 5).

Company review/approve/reject, Business Central, and Tally posting are not included.

## Local setup

1. `npm install`
2. `cp .env.example .env.local` and set **public** values only:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Apply migrations in `supabase/migrations/` (Phase 1–5).
4. Deploy Edge Functions:
   - `vms-admin` (Phase 2)
   - `vms-company` (Phase 3 invites) — JWT required
   - `vms-vendor` (Phase 5 public onboarding) — JWT verification **disabled**; the invitation token is the credential
5. Create an Auth user and promote it to admin, then add company users from the Admin console.
6. `npm run dev` — http://127.0.0.1:45217

Never put the Supabase **service-role** key in Vite or React.

## Routes

| Path | Purpose |
| --- | --- |
| `/login` | Admin and company sign-in |
| `/company` | Master dashboard |
| `/company/vendors` | Vendor list |
| `/company/vendors/invite` | Invite one vendor (shows the onboarding link once) |
| `/company/form-builder` | Form templates |
| `/onboard/:token` | Public 5-step vendor form (no login) |

## Email

Set these as **Edge Function secrets** on `vms-company` (and `APP_BASE_URL` so mail contains an absolute `/onboard/:token` link):

- `RESEND_API_KEY`
- `EMAIL_FROM` (verified Resend sender)
- `APP_BASE_URL` (public site origin, no trailing slash)

If mail is not configured, the invite is still created. The company UI shows the secure link once at invite/resend time. The raw token is never stored; only `invite_token_hash` (SHA-256) is persisted. Links expire after 30 days.

## Vendor documents

Private bucket `vendor-documents`. Uploads go through `vms-vendor`. Objects are not public. Company users may read files under `{vendor_id}/…` for vendors they own, via Storage RLS. Vendors receive short-lived signed URLs for their own files only.

## Aadhaar

Full Aadhaar is not stored. The server saves `aadhaar_hash` (SHA-256 of digits) and `aadhaar_last4`. Column `adhar_card_number` is deprecated and left empty. Production hardening still needed: field-level encryption or a KMS, log redaction at the platform layer, and a dedicated Phase 6 review API so company browsers do not `select *` sensitive columns.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run lint`
