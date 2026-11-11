# Local development

This guide runs the complete ZEROLAX stack on one machine using the embedded PGlite database. No Supabase project or Telegram bot token is required for development.

## Prerequisites

- Node.js **>= 20.19** (Node 22/24 recommended)
- npm 10+
- Windows: if `npm` is blocked by the execution policy, use `npm.cmd` in every command.

## 1. Install

```bash
npm install
```

## 2. Configure

```bash
cp .env.example .env
# PowerShell:
# Copy-Item .env.example .env
```

The defaults are designed for local development:

- API: `http://localhost:4000`
- Web: `http://localhost:5173`
- Embedded database: `.data/zerolax`
- `DEV_AUTH_ENABLED=true`
- Bot: starts in idle mode when `TELEGRAM_BOT_TOKEN` is empty

Keep `DATABASE_URL` empty unless you intentionally want to develop against Supabase/PostgreSQL.

## 3. Migrate and seed

```bash
npm run seed
```

This command:

1. regenerates `packages/db/src/migrations.generated.ts` from `supabase/migrations/*.sql`;
2. creates the PGlite database;
3. applies all pending migrations inside transactions;
4. seeds reusable demo IQ/entrance content and the bootstrap admin (when `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set);
5. exits.

The seed is safe to run again. Migrations are tracked in `schema_migrations`, and seed inserts use stable keys.

## 4. Run

```bash
npm run dev
```

Or run services separately:

```bash
npm run dev:api
npm run dev:web
npm run dev:bot
```

Open <http://localhost:5173>. Outside Telegram, the app shows a development login screen. It creates a real profile through `/api/auth/dev`; nothing is mocked.

Useful endpoints:

| URL | Purpose |
| --- | --- |
| `http://localhost:4000/health` | API + database health |
| `http://localhost:4000/api` | API metadata, timezone, bot username, dev-auth flag |
| `http://localhost:5173/admin/login` | Admin dashboard login |

## Development authentication

`DEV_AUTH_ENABLED` is only honored when `NODE_ENV !== 'production'`. The API ignores it in production, so it cannot be used to bypass Telegram auth in a deployed app.

You can create a user from the web login form without a Telegram account. The same user then exercises the real database, coin ledger, attempts and admin pages.

To disable the form locally, set:

```env
DEV_AUTH_ENABLED=false
```

## How the web reaches the API

- `VITE_API_URL` is empty by default, so the browser calls same-origin `/api` and `/health`.
- Vite dev and preview servers proxy `/api` and `/health` to `API_URL` (default `http://localhost:4000`).
- In production, Nginx or another reverse proxy should do the same. See [deployment](deployment.md).

If you host the API on a different origin, set `VITE_API_URL` at build time and add the web origin to `CORS_ORIGINS`.

## Database workflow

SQL files in `supabase/migrations` are the source of truth. Never edit `packages/db/src/migrations.generated.ts`; it is generated and git-ignored.

```bash
npm run migrations:generate
```

To add a migration:

1. Create `supabase/migrations/0004_my_change.sql`.
2. Run `npm run migrations:generate`.
3. Restart the API (it runs pending migrations on startup) or run `npm run seed`.

Migrations must be compatible with both PostgreSQL and PGlite. Avoid extensions that PGlite does not bundle.

### Reset local data

Stop the API first, then delete the PGlite directory:

```bash
rm -rf .data/zerolax
# PowerShell:
# Remove-Item -Recurse -Force .data\zerolax
npm run seed
```

PGlite uses a single embedded database process. Only the API (or seed/test process) may open it; the bot talks to the API over HTTP.

## Quality checks

```bash
npm run typecheck
npm test
npm run build
```

`npm test` uses in-memory PGlite databases, applies the real migrations and drives the real Fastify app. It does not need a running API or PostgreSQL server.

## Preview a production build locally

```bash
npm run build
npm run start:api                 # terminal 1
npm run preview -w @zerolax/web   # terminal 2
```

Open <http://localhost:4173>. The preview server proxies `/api` and `/health` to the API, so same-origin requests keep working.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Cannot find module .../migrations.generated` | Run `npm run migrations:generate` |
| Web requests fail with network errors | Make sure the API is running on `API_URL` |
| `database is locked` / PGlite error | Stop other API/seed/test processes using the same `.data/zerolax` |
| Telegram init data rejected | `initData` is older than `TELEGRAM_AUTH_MAX_AGE_SECONDS`; reopen the Mini App |
| Bot exits or stays idle | Set a real `TELEGRAM_BOT_TOKEN`; without it the bot intentionally runs in idle mode |
| Admin login fails | The bootstrap admin is created only when `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set before API/seed start |
