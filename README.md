# Vendor Management System

Company portal, admin console, Form Builder, public vendor onboarding, company review, and **Phase 7 Business Central + Tally integrations**.

## Local setup

1. `npm install`
2. `cp .env.example .env.local` and set **public** values only:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Apply migrations in `supabase/migrations/` (Phase 1–7).
4. Deploy Edge Functions:
   - `vms-admin` — JWT required
   - `vms-company` — JWT required
   - `vms-vendor` — JWT verification **disabled**; invitation token is the credential
   - `vms-business-central` — JWT required
   - `vms-tally` — JWT required
5. Create an Auth user and promote it to admin, then add company users from the Admin console.
6. `npm run dev` — http://127.0.0.1:45217

Never put the Supabase **service-role** key, Microsoft client secret, or OAuth tokens in Vite or React.

## Routes

| Path | Purpose |
| --- | --- |
| `/company/vendors/:id/review` | Review, local approve/reject, BC validate/sync, Tally retry |
| `/company/integrations/business-central` | BC OAuth, company select, test, disconnect, logs |
| `/company/integrations/business-central/oauth-callback` | Server-side code exchange (tokens never stored in React) |
| `/company/integrations/business-central/master-data` | Live BC companies/vendors/contacts/paymentTerms |
| `/company/integrations/business-central/vendor-templates` | VMS→BC field maps |
| `/company/integrations/tally` | Host/port, test, XML preview, logs |
| `/company/tally` | Redirects to Tally integration |

## Business Central

Secrets (Edge Functions only):

- `BC_CLIENT_ID`
- `BC_CLIENT_SECRET`
- `BC_TENANT_ID` (optional default directory ID; UI can override)
- `BC_REDIRECT_URI` must match Entra **exactly**, e.g. `{APP_BASE_URL}/company/integrations/business-central/oauth-callback`
- `BC_TOKEN_ENCRYPTION_KEY` (optional; falls back to hashing `BC_CLIENT_SECRET` for AES-GCM)

Entra app:

- Web redirect URI = `BC_REDIRECT_URI`
- Delegated permission: Dynamics 365 Business Central `Financials.ReadWrite.All`
- Admin consent as required

API used (v2.0, confirmed Microsoft docs):

- `GET /companies`
- `GET/POST /companies({id})/vendors`
- `GET/POST /companies({id})/contacts`
- `GET /companies({id})/paymentTerms`
- `POST /companies({id})/vendors({id})/documentAttachments` (best-effort; marked unsupported if rejected)

**Not faked / not in standard vendor API:** vendor bank accounts, extra GST locations, PAN, designations, assessee codes. Those stay in VMS and show `not_supported`.

Local **Approve vendor** still works without BC. **Approve & sync** requires a connected BC company and will not create a second vendor if `bc_vendor_id` is already stored. Tally never blocks BC.

## Tally

Configure host, port, and company name. The server POSTs Import Data XML (`LEDGER` under Sundry Creditors) to `http://host:port`. Hosted Edge Functions cannot reach private LAN IPs — tests fail honestly until Tally is reachable.

## Scripts

- `npm run lint`
- `npm run build`
- `npm run dev`
