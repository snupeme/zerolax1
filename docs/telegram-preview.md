# Connected Telegram preview

The supplied bot token is stored only in the ignored root `.env`. It was verified with Telegram `getMe`; the bot is `@ZerolaxBot`.

Current connection details are in `.data/telegram-preview.json`; process IDs are in `.data/telegram-processes.json`. A verified official Cloudflare binary runs a temporary HTTPS tunnel to the compiled web preview on loopback port 5180. The API remains on loopback port 4000. The development Vite server on 5173 is not the tunnel target.

Security changes for public access:

- `DEV_AUTH_ENABLED=false`: the public app accepts verified Telegram authentication instead of development identities.
- `WEB_URL` and `TELEGRAM_WEBAPP_URL` match the temporary HTTPS address.
- The previously shared local admin password and the local JWT secret were replaced with random values. Current administrator credentials are in the private `.env`; bootstrap updates were applied to the existing local admin row.
- The compiled browser assets were checked and do not contain the bot token.
- Only the tunnel hostname is added to Vite preview's allowed hosts.

Open `https://t.me/ZerolaxBot`, send `/start`, select a language, choose a nickname and share your own contact using the bot keyboard. Registration writes through the protected internal API. After registration, the bot's inline **Open app / Ilovani ochish** button opens the Mini App. `/app` also opens this flow. `/start` sets a private-chat Mini App menu as well.

The global `setChatMenuButton` request succeeded, but `getChatMenuButton` without a chat ID still reported `commands`. A global menu change has therefore not been claimed as verified. The private-chat setup and inline button provide the app entry path. Actual interaction in the user's Telegram client still needs the user to send `/start`.

Verified: public page and health HTTP 200, public API metadata with development login disabled, bot-token internal API authentication HTTP 200, Telegram SDK in the HTML, bot polling startup and bot workspace type check. No user message was fabricated or sent to an unrelated account.

The managed environment cannot launch tsx because its OS-user lookup fails. Node 24's TypeScript support is used with `scripts/register-typescript.mjs` to resolve local extensionless imports. The bot additionally needs `--experimental-transform-types` for existing TypeScript parameter properties:

```powershell
# Run from the workspace root, one bot polling instance only.
node --import ./scripts/register-typescript.mjs apps/api/src/index.ts
node --experimental-transform-types --import ./scripts/register-typescript.mjs apps/bot/src/index.ts
```

This is a temporary live preview, not a permanent deployment. The computer, API, web preview, tunnel and polling bot must remain running. A new quick-tunnel session receives a new URL. Before reconfiguring a changed tunnel, stop the API, run `scripts/configure-telegram.ts` with the same Node loader, then restart the services with the new allowed hostname and URLs. The helper reads the current tunnel log and rotates local admin/JWT secrets during configuration.

Stable 24/7 operation requires a persistent HTTPS deployment and a continuously running bot/API service.

2026-11-09: the expired quick tunnel was renewed and its URL was saved to the private environment and `.data/telegram-preview.json`. API, compiled preview and bot were restarted. The bot now registers `/games`, which opens the mathematics mini-games after registration. Live verification confirmed `/games` and `/api` return HTTP 200, the game catalog contains four definitions and twenty grade configurations, and Telegram lists the new command. Send `/games` or `/start` again to receive a button using the current tunnel URL; old messages can still contain the expired address.


## Runtime verification ? 2026-11-11

The local API (4000), compiled web preview (5180), current public Mini App URL and public health endpoint all returned HTTP 200. The public page was opened with valid signed Telegram initData for an existing registered account: homepage rendered, Telegram SDK was present, and no navigation, page, console or request errors were observed. The current global Web App menu points to the configured public URL; Telegram adds a trailing slash, which is equivalent. Registered-user menu settings were refreshed. This verifies the running temporary preview; permanent hosting is unchanged.
