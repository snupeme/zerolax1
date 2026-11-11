# ZEROLAX

ZEROLAX is a multilingual educational Telegram Mini App with a real Fastify API, PostgreSQL/Supabase schema, a Telegraf bot, daily IQ challenges, university entrance exams, a coin economy and a protected admin dashboard.

The user experience is designed for Telegram's in-app webview but also runs in a normal browser for development and administration.

## Hozirgacha bajarilgan ishlar

Loyiha bitta Telegram Mini App ichida ishlaydi: React interfeys, Fastify API, PostgreSQL/PGlite bazasi va Telegraf bot.

- **Kirish va xavfsizlik:** Telegram initData tekshiruvi, ro‘yxatdan o‘tish, yangilanadigan sessiyalar, alohida admin kirishi, rollar va ruxsatlar, audit jurnali.
- **Bosh sahifa:** foydalanuvchi profili va coinlari, Premium, Math Arcade, IQ/imtihon havolalari, Algebra/Geometriya, haqiqiy statistika va natijalar. Mobil pastki navigatsiya va uch til (uz/ru/en).
- **Kuzgi ko‘rinish (2026-11-11):** umumiy mavzu tokenlari, krem/ivory fon, yashil Premium banner, mis/oltin aksentlar, uyg‘un mini-o‘yinlar va admin ranglari. Bosh sahifada uchta yengil barg, reduced-motion qo‘llovi, yorug‘/qorong‘i rejim va Telegram panel ranglari. Qolgan fasllar uchun arxitektura tayyor; hozir faqat kuz faollashtirilgan.
- **IQ va kirish imtihonlari:** kunlik IQ uchun 10 savol, 24 soatdan so‘ng natija; kirish imtihonlari uchun 20 savol, server taymeri, kunlik urinish chegarasi va natijalar tarixi.
- **Fanlar:** Algebra va Geometriya uchun 5–11-sinflar, sinf → kitob → mavzu → dars/test yo‘li, server baholashi, saqlangan javoblar, davom ettirish, qayta urinish va keyingi kitobni ochish qoidalari.
- **Mini-o‘yinlar (yangi):** Javobni top, Nechta qoldi?, Nechta bo‘ldi? va Tenglik taqsimla: rasm, uchta katta javob tugmasi, qisqa mashq namunasi va odatda 10 savol. Ko‘paytirish 2-sinfdan, bo‘lish 3-sinfdan. Eski interfeyslar olib tashlandi; natijalar va coin tarixi admin arxivida saqlanadi. Faollashtirish uchun lokal API qayta ishga tushirilishi kerak. Kirish yoli: **Bosh sahifa → Imtihonlar → Mini o‘yinlar**. Batafsil: [mini-game guide](docs/mini-games.md).
- **Premium va sertifikatlar:** qo‘lda obuna berish/uzaytirish/bekor qilish, bepul mavzu chegarasi, to‘lov holatlari arxitekturasi, PDF sertifikat, QR va tekshirish sahifasi. Haqiqiy to‘lov provayderi hali sozlanmagan.
- **Admin boshqaruvi:** foydalanuvchilar, xodimlar/rollar, fanlar, sinflar, kitoblar, boy matnli dars muharriri, CSV savollar importi, test qoidalari, bannerlar, xabarnomalar, coinlar, murojaatlar, sertifikatlar va hisobotlar.
- **Shaxsiy bo‘limlar:** profil, sozlamalar, natijalarga asoslangan tahlil, bildirishnomalar, sovg‘alar, yordam va oferta. Tahlil mavjud natijalardan hisoblanadi; tashqi AI xizmati ulanmagan.
- **Bot va joylashtirish:** Mini App kirishi, /app va /games, vaqtinchalik HTTPS preview bo‘yicha yo‘riqnoma. Doimiy hosting va haqiqiy Telegram qurilmasidagi yakuniy tekshiruv alohida bajariladi.

Batafsil tarix, tekshiruvlar va qolgan ishlar: [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md). Kuzgi tizimni o‘zgartirish: [docs/seasonal-theme.md](docs/seasonal-theme.md).

## Features

- **Telegram Mini App** — opens from the bot menu button, validates Telegram `initData` with HMAC-SHA256, and never exposes secrets to the browser.
- **Daily IQ challenge** — exactly 10 questions per test. Publication is scheduled at 09:00 Asia/Tashkent. Results stay hidden until publication + 24 hours, then coins are credited exactly once through an idempotent ledger.
- **Entrance exams** — exactly 20 questions, a server-enforced timer, immediate results, and one attempt per user per Tashkent calendar day.
- **Three languages** — Uzbek (default), Russian and English across the UI, validation messages, bot replies and notifications.
- **Coin economy** — server-side reward calculation, immutable `coin_transactions` ledger, achievements and an admin coin-adjustment flow with an audit trail.
- **User area** — home dashboard, test history, profile and statistics, notification inbox, gift catalog, support request form, public offer and settings.
- **Admin dashboard** — overview analytics, user search/blocking, coin adjustments, IQ and entrance test editors with publish rules, multilingual notifications with scheduling, delivery logs and an audit log.
- **Scheduler** — in-process, idempotent tick that publishes IQ tests, releases results, finalizes expired entrance attempts and sends scheduled notifications.
- **Real tests** — API integration tests cover authentication, IQ, entrance, admin, database constraints and the internal bot API.

## Tech stack

| Layer | Technology |
| --- | --- |
| Web | React 19, TypeScript, Vite, Tailwind CSS, shadcn-style components, Lucide, React Router, TanStack Query, Zod |
| API | Fastify 5, TypeScript, JWT (`jose`), Zod, rate limiting, Helmet, CORS |
| Database | PostgreSQL (Supabase) in production, embedded PGlite for local development and tests; SQL migrations are the source of truth |
| Bot | Telegraf 4, HTTP internal API (the bot never connects to the database directly) |
| Shared | `@zerolax/shared` types, validation schemas, date/coin utilities and full uz/ru/en dictionaries |

## Repository layout

```text
apps/
  api/                  Fastify API, scheduler, seed script, integration tests
  bot/                  Telegraf bot and internal API client
  web/                  React Mini App + admin dashboard
packages/
  db/                   PGlite/PostgreSQL adapter, migrations runner, data helpers
  shared/               Shared types, Zod schemas, i18n dictionaries, utilities
supabase/migrations/    PostgreSQL schema and RLS policies
scripts/                Migration code generator
docs/                   Setup, deployment and admin guides
```

## Quick start

Requirements: Node.js **>= 20.19** and npm. On Windows use `npm.cmd` if your shell blocks `npm`.

```bash
# 1. Install dependencies
npm install

# 2. Create the environment file and review it
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env

# 3. Create the embedded database, apply migrations and seed content
npm run seed

# 4. Start API, web and bot together
npm run dev
```

Open:

- Web app: <http://localhost:5173>
- API health: <http://localhost:4000/health>
- API metadata: <http://localhost:4000/api>
- Admin: <http://localhost:5173/admin/login>

Outside production, development login is enabled by default. The login screen creates a real profile through the API — no mock users and no fake tokens. Set `DEV_AUTH_ENABLED=false` to disable it. Telegram login is used automatically when the app is opened inside Telegram with valid `initData`.

The default embedded database lives in `.data/zerolax`. Delete that directory to start over.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Generate migrations and run API, web and bot with hot reload |
| `npm run dev:api` / `dev:web` / `dev:bot` | Run one workspace |
| `npm run seed` | Apply migrations and seed reusable demo content + bootstrap admin |
| `npm run migrations:generate` | Regenerate `packages/db/src/migrations.generated.ts` from `supabase/migrations` |
| `npm run typecheck` | Type-check every workspace |
| `npm test` | Run the API integration test suite |
| `npm run build` | Generate migrations, type-check and build web, API and bot |
| `npm run start:api` / `start:bot` | Start the compiled API / bot |

`packages/db/src/migrations.generated.ts` is generated and git-ignored. It is created automatically by `dev`, `seed`, `test` and `build`.

## Environment variables

Copy `.env.example` to `.env`. The most important values:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | yes | `development` or `production` |
| `PORT`, `HOST` | no | API listener (default `4000`, `0.0.0.0`) |
| `WEB_URL` | production | Public web app URL, used for CORS and WebApp links |
| `API_URL` | no | API URL for the bot and Vite dev proxy (default `http://localhost:4000`) |
| `VITE_API_URL` | no | Browser API base. Leave empty to use same-origin `/api` via a proxy |
| `CORS_ORIGINS` | no | Extra comma-separated allowed origins |
| `DATABASE_URL` | production | PostgreSQL/Supabase connection string; empty uses PGlite |
| `DATABASE_SSL` | production | `true` for Supabase or other SSL-only Postgres hosts |
| `PGLITE_DIR` | no | Embedded database directory (default `.data/zerolax`) |
| `JWT_SECRET` | production | Long random secret; the default is rejected in production |
| `ACCESS_TOKEN_TTL_SECONDS` | no | Access token lifetime (default `900`) |
| `REFRESH_TOKEN_TTL_DAYS` | no | Refresh session lifetime (default `30`) |
| `DEV_AUTH_ENABLED` | no | Development login; always disabled in production |
| `TELEGRAM_BOT_TOKEN` | production | Token from @BotFather |
| `TELEGRAM_BOT_USERNAME` | no | Bot username without `@` |
| `TELEGRAM_WEBAPP_URL` | production | Public **HTTPS** Mini App URL |
| `TELEGRAM_AUTH_MAX_AGE_SECONDS` | no | Maximum accepted `initData` age (default `300`) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | production | Bootstrap the first superadmin on API start |
| `SUPPORT_EMAIL` | no | Support address shown in the app and bot |
| `TZ` | recommended | `Asia/Tashkent` |
| `LOG_LEVEL` | no | Pino log level (default `info`) |

Never commit `.env`. Only `VITE_*` values are exposed to the browser.

## Security model

- Telegram `initData` is verified server-side with HMAC-SHA256, an auth-date freshness check and a constant-time comparison.
- Users receive a short-lived HS256 access token and an opaque, rotating refresh token. Refresh tokens are hashed in the database and revoked on logout.
- Admin authentication uses a separate token audience. Admin routes require a real `admin_users` row; the frontend cannot grant admin access.
- The browser never receives the bot token, database URL, JWT secret or service-role key.
- Coin balances are changed only by server-side transactional ledger entries with unique idempotency keys. Users cannot update their own balance.
- Telegram IDs, usernames, Telegram names and development-auth metadata are omitted from ordinary profile/auth responses and new user JWTs. Private admin identity access requires both `users.read` and `users.private`; private fields are also filtered from lists, audit/details and exports. Phone numbers are not returned by the normal user profile API.
- Rate limiting, Helmet headers and strict CORS are enabled on the API.
- Supabase RLS policies are included as defence-in-depth for any direct client access. The API performs its own authorization.

## Verification

```bash
npm run typecheck
npm test
npm run build
```

Type checking, API tests and the web build are verified separately. See DEVELOPMENT_STATUS.md for the latest counts and the previously observed API/bot bundling restriction. Run `npm run test:mobile` for the isolated learning, navigation and mini-game browser checks.

## Documentation

- [Learning, Premium and certificates](docs/learning.md)

- [Local development](docs/local-development.md)
- [Supabase / PostgreSQL setup](docs/supabase.md)
- [Telegram bot and BotFather setup](docs/botfather.md)
- [Admin dashboard guide](docs/admin.md)
- [Production deployment](docs/deployment.md)
- [Development status](DEVELOPMENT_STATUS.md)
