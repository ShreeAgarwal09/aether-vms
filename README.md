# Aether VMS

Vendor Management System for company-controlled onboarding, review, and optional ERP posting.

Admin and company users sign in with Supabase Auth. Vendors never receive an Auth account. They use a one-time invitation URL whose raw token is hashed (SHA-256) before storage.

This repository includes Phases 1–9:

1. Admin authentication  
2. Company management  
3. Company dashboard and vendor invitations  
4. Form Builder  
5. Public vendor onboarding  
6. Company review (approve / reject / resubmit)  
7. Business Central OAuth + vendor sync (Tally XML is deferred and not in the current product flow)  
8. Production hardening (RLS, validation, error handling, UX, docs)  
9. Functional QA (admin isolation, route aliases, submit/review guards)

## Tech stack

- React 19, TypeScript, Vite, React Router, Tailwind CSS
- Supabase Auth, Postgres (RLS), Storage (`vendor-documents`, private), Edge Functions
- Optional: Microsoft Entra + Business Central API v2.0
- Optional: Resend for invitation email

Tally HTTP/XML integration exists in the repository as deferred source (`supabase/functions/vms-tally`) but is **not** part of the current company portal, deploy path, or required secrets.

## Local development

1. `npm install`
2. Copy `.env.example` to `.env.local` and set **public** values only:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (anon or publishable key — never the service-role key)
3. Apply SQL in `supabase/migrations/` in filename order (Phase 1–9).
4. Deploy Edge Functions (see below) and set function secrets.
5. Create an Auth user, promote it to `admin` (see `supabase/seed_promote_admin.sql`), then add companies from `/admin`.
6. `npm run dev` — http://127.0.0.1:45217

Scripts: `npm run lint`, `npm run build`, `npm run preview`.

## Environments

| | Local | Staging | Production |
| --- | --- | --- | --- |
| App origin | `http://127.0.0.1:45217` | Your staging URL | Your production URL |
| `APP_BASE_URL` | Same as origin | Staging origin | Production origin |
| `BC_REDIRECT_URI` | Must match Entra **exactly** | Staging callback URL | Production callback URL |
| Secrets | Local function secrets or dashboard | Staging project | Production project |
| Data | Disposable | Isolated | Live vendors and tokens |

Never reuse production Microsoft client secrets or the service-role key in local Vite env files.

## Supabase configuration

- Enable Email auth. Do not enable public sign-up for vendors.
- RLS is enabled on application tables. Company users see their own rows; admins follow admin policies; anonymous clients cannot read profiles.
- Invitation tokens: store **hash only**. The raw token is emailed or shown once to the company if mail is not configured.
- Storage bucket `vendor-documents` is **private**. Signed URLs expire in minutes and are issued only by Edge Functions after ownership checks.

## Database migrations

Apply every file in `supabase/migrations/` in order. Do not edit old migrations; add a new file for schema changes.

Phase 8 adds `20260916190000_phase8_hardening.sql` (revoke leftover grants, indexes, private buckets).

## Edge Functions

| Function | JWT | Role |
| --- | --- | --- |
| `vms-auth` | **Disabled** | Public password-reset requests (Resend) |
| `vms-admin` | Required | Admin company CRUD, set-password emails (Resend) |
| `vms-company` | Required | Invite, review, delete/block vendor, template notifications |
| `vms-vendor` | **Disabled** | Public onboarding; token is the credential |
| `vms-business-central` | Required | OAuth, BC API, vendor sync, BC contact sync |
| `vms-tally` | **Disabled (`enabled = false`)** | Deferred. Do not deploy. |

Deploy from a machine with the Supabase CLI logged in, for example:

```bash
npx supabase functions deploy vms-auth --project-ref <ref>
npx supabase functions deploy vms-admin --project-ref <ref>
npx supabase functions deploy vms-company --project-ref <ref>
npx supabase functions deploy vms-vendor --project-ref <ref>
npx supabase functions deploy vms-business-central --project-ref <ref>
```

Do **not** deploy `vms-tally` for the current release. Set `verify_jwt = false` only for `vms-vendor` and `vms-auth`.

Transactional email (invites, approve/reject, template updates, password reset) uses **Resend** via `RESEND_API_KEY` and `EMAIL_FROM`.

## Required secrets (Edge Functions / server)

**Never** prefix these with `VITE_`. They must not appear in the React bundle.

Business Central:

- `BC_CLIENT_ID`
- `BC_CLIENT_SECRET`
- `BC_REDIRECT_URI` — e.g. `{APP_BASE_URL}/company/integrations/business-central/oauth-callback`
- `BC_TENANT_ID` — optional default directory ID
- `BC_TOKEN_ENCRYPTION_KEY` — optional AES-GCM key; if omitted, the function derives a key from `BC_CLIENT_SECRET`

Email:

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `APP_BASE_URL`

Supabase injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` into functions. Do not copy the service-role key into the frontend.

## Business Central setup

1. Register a Microsoft Entra application.
2. Add a **Web** redirect URI equal to `BC_REDIRECT_URI`.
3. Delegated permission: Dynamics 365 Business Central `Financials.ReadWrite.All` (plus `offline_access` on the token request).
4. Admin consent as required by your tenant.
5. Store client id/secret as function secrets.
6. In the company portal, connect, select a BC company, then validate or Approve & sync.

API used (v2.0, documented Microsoft endpoints):

- `GET /companies`
- `GET/POST /companies({id})/vendors`
- `GET/POST /companies({id})/contacts`
- `GET /companies({id})/paymentTerms`
- `POST /companies({id})/vendors({id})/documentAttachments` (best-effort; marked unsupported if rejected)

**Not faked and not on the standard vendor API:** vendor bank accounts, extra GST locations, PAN, designations, assessee codes. Those remain in VMS and report `not_supported` / `unsupported`.

Local **Approve vendor** works without BC. **Approve & sync** requires a connected BC company and will not create a second vendor once `bc_vendor_id` is stored.

OAuth uses PKCE. Access and refresh tokens are encrypted at rest and never returned to the browser. Refresh runs server-side.

## Microsoft Entra setup

- Redirect URI must match character-for-character, including scheme and path.
- Use a confidential web client (client secret), not a public SPA client, because exchange happens in Edge Functions.
- Restrict the app to the intended tenant if you do not want `common`.

## Tally (deferred)

Tally is **not currently required** and is not shown in the company portal.

- No Tally secrets.
- No Tally setup for go-live.
- Historical columns on `vendors` / `ip_configs` remain in applied Phase 3/7 migrations so existing databases stay compatible; the SPA does not read or write them.
- Function source is retained under `supabase/functions/vms-tally` with `enabled = false` in `supabase/config.toml`.

Do not re-enable until a later release explicitly restores the UI and deploy path.

## Email setup

Set `RESEND_API_KEY` and `EMAIL_FROM`. If they are missing, invitations still create hashed tokens; the company may receive the onboarding URL in the function response so they can share it out of band.

## Deployment steps

1. Create a production Supabase project.
2. Apply all migrations.
3. Deploy the Edge Functions listed above (`vms-admin`, `vms-company`, `vms-vendor`, `vms-business-central`) and set secrets. Do not deploy `vms-tally`.
4. Confirm `vendor-documents` is private.
5. Build the SPA (`npm run build`) and host the `dist/` folder. `vercel.json` rewrites unknown paths to `index.html` so React Router deep links work on Vercel. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at **build** time only.
6. Set `APP_BASE_URL` and `BC_REDIRECT_URI` to the public origin.
7. Promote the first admin user; create companies from `/admin`.

## Security notes

- Roles and `is_active` live in `profiles` and cannot be changed by a browser JWT (trigger + RLS).
- Blocked / inactive company users are signed out and cannot use the company portal.
- Vendors cannot enumerate other vendors; invalid/expired links share one generic message.
- Full Aadhaar is not stored; last four digits plus hash only.
- Bank account numbers are masked in review until an authorized reveal request.
- Integration logs store sanitized messages, not tokens or secrets.
- Allowed uploads: PDF, JPEG, PNG, WebP, maximum 10 MB, enforced in `vms-vendor`.

## Known limitations

- Business Central does not expose every Indian GST/bank field on the standard vendor API.
- Invitation email requires Resend (or another provider you wire in).
- There is no vendor Auth account or password reset for vendors.
- `indian_state_codes` is not a separate table in this project; states are free-text with GSTIN format checks.

## Testing instructions

```bash
npm run lint
npm run build
```

Manual route checks (with a real session where required):

- `/login`
- `/admin`
- `/company`
- `/company/vendors`
- `/company/sync`
- `/company/sync-data` (redirects to `/company/sync`)
- `/company/form-builder`
- `/company/profile`
- `/company/password`
- `/company/integrations/business-central`
- `/company/integrations/business-central/oauth-callback`
- `/company/integrations/business-central/master-data`
- `/company/integrations/business-central/vendor-templates`
- `/onboard/:token`

External Business Central tests need live Entra/BC credentials. The app must not report success unless Business Central responds.

## Routes (company)

| Path | Purpose |
| --- | --- |
| `/company/vendors/:id/review` | Review, approve/reject, BC validate/sync |
| `/company/integrations/business-central` | OAuth, company select, test, disconnect |
