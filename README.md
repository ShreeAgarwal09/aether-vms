# Vendor Management System

Phase 2 of the Vendor Management System: Admin company-user management on top of the Phase 1 Auth and role foundation.

Vendor invitations, vendor forms, Business Central, and Tally are not included yet.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env.local
```

3. Fill in **public** Supabase values only:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (anon or publishable key)

Never put the Supabase **service-role** key in this app. It belongs only in Edge Functions / the Supabase dashboard.

4. Apply database migrations in order:

- `supabase/migrations/20260827102832_profiles_phase_1.sql`
- `supabase/migrations/20260916090000_phase2_company_management.sql`
- `supabase/migrations/20260916091500_phase2_protect_profile_service_role.sql`

5. Deploy the `vms-admin` Edge Function (`supabase/functions/vms-admin`). Hosted projects already inject `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` into the function. Optional function secret:

- `APP_BASE_URL` — public app origin used in password-email redirect links (falls back to the browser `Origin` header)

6. Create the first Auth user in the Supabase dashboard, then promote it to admin:

```sql
update public.profiles
set role = 'admin'
where email = 'your-admin@example.com';
```

7. Start the app:

```bash
npm run dev
```

The dev server listens on `http://127.0.0.1:45217`.

## Scripts

- `npm run dev` — development server
- `npm run build` — typecheck and production build
- `npm run preview` — serve the production build
- `npm run lint` — oxlint

## Routes

| Path | Access |
| --- | --- |
| `/login` | Public sign-in |
| `/admin` | Authenticated `admin` dashboard |
| `/admin/companies` | Company user management |
| `/company` | Authenticated `company` profiles |
| `/unauthorized` | Signed-in users without that route's role |

Inactive / blocked company profiles cannot enter `/company`. Blocking also bans the Auth user and revokes sessions.

## Admin operations

| Action | Where it runs |
| --- | --- |
| List / search / filter companies | Browser + RLS (`role = company`) |
| Edit company profile fields | Browser + RLS + DB trigger (email/role/status locked for non-admins) |
| Add company user | `vms-admin` Edge Function (`inviteUserByEmail`) |
| Block / unblock | `vms-admin` Edge Function |
| Delete company user | `vms-admin` Edge Function |
| Send set-password email | `vms-admin` Edge Function (`resetPasswordForEmail`) |

Deletion is a hard Auth delete (profile cascades). If vendor rows exist, delete is refused (`ON DELETE RESTRICT`); block the company instead.

## Email

Set-password and invite emails are sent by **Supabase Auth**, not by a frontend mailer.

Configure in the Supabase dashboard:

- Authentication → URL Configuration: add `http://127.0.0.1:45217/login` (and the production origin) to Redirect URLs
- Authentication → SMTP: custom SMTP, or the project's built-in Auth email (rate-limited)

If SMTP is missing, user creation can still succeed while mail delivery fails. The UI reports the Auth/SMTP error instead of faking success.
