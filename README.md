# Vendor Management System

Phase 1 foundation for a production Vendor Management System: Vite + React + TypeScript, React Router, Supabase Auth, PostgreSQL profiles/roles, and role-protected Admin and Company routes.

Later phases (company user management, vendor forms, Business Central, Tally) are intentionally not included yet.

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

Never put the Supabase **service-role** key in this app. It belongs only in trusted server-side environments.

4. Apply the Phase 1 database migration in the Supabase SQL editor or CLI:

- `supabase/migrations/20260827102832_profiles_phase_1.sql`

5. Create the first Auth user in the Supabase dashboard, then promote it to admin:

```sql
update public.profiles
set role = 'admin'
where email = 'your-admin@example.com';
```

New Auth users receive `role = 'company'` automatically.

6. Start the app:

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
| `/admin` | Authenticated `admin` profiles |
| `/company` | Authenticated `company` profiles |
| `/unauthorized` | Signed-in users without that route's role |

Inactive profiles (`is_active = false`) cannot enter protected routes.

## Architecture notes

- The browser talks to Supabase with the anon/publishable key and the user's JWT.
- Role checks are enforced in React **and** in Postgres RLS (`is_admin()`, own-profile policies).
- Admins cannot be created or promoted from the React client.
