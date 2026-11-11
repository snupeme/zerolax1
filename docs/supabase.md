# Supabase / PostgreSQL setup

ZEROLAX stores all data in PostgreSQL. Supabase is the recommended managed provider, but any PostgreSQL 14+ server works. The same SQL migrations run on Supabase, a self-hosted PostgreSQL instance and the embedded PGlite used for local development.

## 1. Create a Supabase project

1. Sign in at <https://supabase.com/dashboard>.
2. Create a new project and save the database password.
3. Wait until the database is healthy.

## 2. Get the connection string

Open **Project Settings → Database → Connection string** and copy a URI.

Recommended for the API:

- **Session pooler** (port `5432` on the pooler host) — supports transactions and long-lived connections. Use this when the direct database host is IPv6-only and your server has no IPv6.
- **Direct connection** — fine when your host supports IPv6.

Example values (yours will differ):

```env
DATABASE_URL=postgresql://postgres.abcdefghijklmnop:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
DATABASE_SSL=true
```

The adapter enables SSL automatically only when the host contains `supabase.co`. Pooler hostnames often end in `pooler.supabase.com`, so set `DATABASE_SSL=true` explicitly.

Do not commit the connection string. It contains the database password.

## 3. Apply migrations

The migrations live in `supabase/migrations`:

| File | Purpose |
| --- | --- |
| `0001_init.sql` | Complete schema, indexes and triggers |
| `0002_rls.sql` | Row Level Security and column grants |
| `0003_notification_dedupe.sql` | Notification deduplication support |

Choose one method.

### Option A — let the API migrate (recommended)

Set `DATABASE_URL` (and `DATABASE_SSL=true`) in `.env`, then start the API once:

```bash
npm run start:api
# or, in development:
npm run dev:api
```

`apps/api/src/index.ts` runs pending migrations before listening. Applied names are recorded in `schema_migrations`, so restarts are safe.

This is the production-safe path: it creates the schema and the bootstrap admin without inserting demo content.

### Option B — Supabase CLI

If you use the Supabase CLI:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The CLI uses the same `supabase/migrations` directory. Ensure the migrations are not edited after being applied to a shared environment; add a new numbered migration instead.

### Do not seed production by accident

`npm run seed` applies migrations **and** inserts demo IQ/entrance content, gifts and other reusable sample rows. It is intended for local development or an explicitly approved demo environment. On production, run the API instead and create real tests from the admin dashboard.

## 4. Verify

Run a quick query in the Supabase SQL editor:

```sql
select name, applied_at from schema_migrations order by name;
select count(*) from profiles;
select count(*) from daily_iq_tests;
```

Expected: three migration rows after the first start (`0001_init`, `0002_rls`, `0003_notification_dedupe`).

Set `DATABASE_URL` locally and check the API health endpoint:

```bash
curl http://localhost:4000/health
# {"status":"ok","time":"..."}
```

## 5. Row Level Security

`0002_rls.sql` enables RLS as defence-in-depth:

- profiles can be read/updated only by the matching `app.user_id` session setting;
- coin transactions, notifications and attempts are scoped to the owning user;
- the `phone` column is not granted to the `authenticated` role;
- public `anon` access is revoked.

The ZEROLAX API connects with the trusted database role and performs its own authorization, so RLS is not the primary access control layer. The web app never talks to Supabase directly and does not need the anon or service-role key. If you later add a direct Supabase client, keep the RLS policies and set `app.user_id` only on the server.

## 6. Operational notes

- **Connection limit** — the adapter opens a pool of up to 10 connections per API process. Keep this in mind with small Supabase plans or multiple API instances. Session pooler limits apply per project.
- **Backups** — enable Supabase backups/PITR appropriate for your plan.
- **Migrations on boot** — every API instance runs migrations. They are transactional and recorded per name, so concurrent starts are safe; still, prefer one deploy/migration step in larger environments.
- **Timezone** — application logic uses `Asia/Tashkent` explicitly. Keep `TZ=Asia/Tashkent` on servers for consistent logs.
- **Clock** — scheduled IQ publication, result release, entrance timers and scheduled notifications depend on server clock accuracy. Use NTP.
- **Secrets** — `JWT_SECRET`, the database password and `TELEGRAM_BOT_TOKEN` belong only in server environment variables.

## Self-hosted PostgreSQL

Use any PostgreSQL 14+ database and set:

```env
DATABASE_URL=postgresql://user:password@host:5432/zerolax
DATABASE_SSL=false
```

Run the SQL files in order or start the API once. Nothing in the schema requires Supabase-specific extensions.
