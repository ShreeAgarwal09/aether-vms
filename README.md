# Vendor Management System

Company portal, admin console, Form Builder, public vendor onboarding, and **company review / approve / reject** (Phase 6).

Business Central and Tally posting are **not** included.

## Local setup

1. `npm install`
2. `cp .env.example .env.local` and set **public** values only:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Apply migrations in `supabase/migrations/` (Phase 1–6).
4. Deploy Edge Functions:
   - `vms-admin` (Phase 2)
   - `vms-company` (invites + **review_vendor / get_vendor_review / sign_vendor_document**) — JWT required
   - `vms-vendor` (public onboarding + resubmission) — JWT verification **disabled**; the invitation token is the credential
5. Create an Auth user and promote it to admin, then add company users from the Admin console.
6. `npm run dev` — http://127.0.0.1:45217

Never put the Supabase **service-role** key in Vite or React.

## Routes

| Path | Purpose |
| --- | --- |
| `/login` | Admin and company sign-in |
| `/company` | Master dashboard |
| `/company/vendors` | Vendor list (Review / View submission) |
| `/company/vendors/invite` | Invite one vendor (shows the onboarding link once) |
| `/company/vendors/:id` | Invitation metadata |
| `/company/vendors/:id/review` | Company review, approve, reject |
| `/company/form-builder` | Form templates |
| `/onboard/:token` | Public 5-step vendor form (no login). Rejected vendors see the reason and can edit/resubmit. |

## Review workflow

`invited` → vendor submits → `pending` → company **Approve** (`approved`) or **Reject** with a required reason (`rejected`) → vendor opens the same hashed invite link → edits previous data → resubmits → `pending`.

Approve/reject run only in `vms-company` (`review_vendor`). The browser cannot set `vendors.status`. `rejected → pending` happens only through `vms-vendor` submit.

## Email

Set these as **Edge Function secrets** on `vms-company` (and `APP_BASE_URL` so invite mail contains an absolute `/onboard/:token` link):

- `RESEND_API_KEY`
- `EMAIL_FROM` (verified Resend sender)
- `APP_BASE_URL` (public site origin, no trailing slash)

If mail is not configured, invites and rejections still persist. The UI reports that notification email is pending configuration. Rejection email never includes the raw token, bank details, PAN, or Aadhaar.

## Vendor documents

Private bucket `vendor-documents`. Uploads go through `vms-vendor`. Objects are not public. Company users receive **short-lived signed URLs** (2 minutes) from `sign_vendor_document` after ownership checks. Direct Storage listing from the browser is not granted.

## Data access limitation

Company browsers can `SELECT` a **directory column set** on `vendors` (name, email, phone, status, dates, latest rejection reason). They cannot select PAN, Aadhaar hash/last4, account numbers, token hashes, or form snapshots through PostgREST. Full review payloads come from `get_vendor_review`. Contacts, GST locations, documents, and `vendor_review_history` are not granted to `anon` or `authenticated` for direct table reads.

## Aadhaar

Full Aadhaar is not stored. The server saves `aadhaar_hash` and `aadhaar_last4`. Review UI shows last-four only and never the hash.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run lint`
