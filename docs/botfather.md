# Telegram bot and BotFather setup

The ZEROLAX bot handles registration, language selection, profile/support commands and the Mini App menu button. It uses Telegraf with long polling and calls the API over HTTP; it never connects to the database directly.

## 1. Create the bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram.
2. Send `/newbot`.
3. Choose a display name (e.g. `ZEROLAX`) and a username ending in `bot` (e.g. `ZerolaxBot`).
4. Copy the token. Treat it like a password.

Create the environment values:

```env
TELEGRAM_BOT_TOKEN=123456789:AA...
TELEGRAM_BOT_USERNAME=ZerolaxBot
TELEGRAM_WEBAPP_URL=https://app.example.com
```

`TELEGRAM_BOT_USERNAME` must not include `@`. The API exposes it to the web app for the "open in Telegram" flow.

## 2. HTTPS Mini App URL

Telegram requires a public **HTTPS** URL for Web Apps. `http://localhost` works for local browser testing but cannot be used as a Telegram Mini App.

For local testing, expose the Vite server with a tunnel, for example:

```bash
# any HTTPS tunnel is fine (cloudflared, ngrok, ...)
cloudflared tunnel --url http://localhost:5173
```

Then set `TELEGRAM_WEBAPP_URL` to the tunnel URL. Keep `WEB_URL` aligned when the API must accept that origin:

```env
WEB_URL=https://your-tunnel.example
TELEGRAM_WEBAPP_URL=https://your-tunnel.example
```

For production use the real deployment URL. See [deployment](deployment.md).

## 3. Register the Mini App

In BotFather:

1. Send `/newapp` and select your bot.
2. Provide the title, description, photo, optional GIF and the HTTPS Web App URL.
3. Choose a short name (used in `t.me/<bot>/<shortname>`).

Alternatively, after the Mini App is registered, use `/setmenubutton` to point the menu button at the URL.

The bot also configures the chat menu button automatically at startup:

```ts
await bot.telegram.setChatMenuButton({
  menuButton: { type: 'web_app', text: 'ZEROLAX', web_app: { url: config.webappUrl } },
});
```

If `TELEGRAM_WEBAPP_URL` is not HTTPS, the bot logs a warning and skips this step. It still registers commands and runs.

## 4. Start the services

The bot needs the API to be reachable at `API_URL` (default `http://localhost:4000`):

```bash
npm run dev:api
npm run dev:bot
```

The bot authenticates internal API calls with `x-bot-secret: <TELEGRAM_BOT_TOKEN>`. The API compares it in constant time with its own configured token. Both processes must use the same token.

Without a token, the bot intentionally starts in idle mode so local development does not fail. It does not poll Telegram.

Only run **one polling instance** per bot token. Multiple instances cause Telegram `409 Conflict` errors.

## 5. Test registration

1. Open the bot and send `/start`.
2. Choose Uzbek, Russian or English.
3. Enter a nickname that is not taken.
4. Send your phone number with the contact button (Telegram contact request).
5. Open the Mini App from the menu button or the "Open app" button.

The bot checks that the shared contact belongs to the sender before accepting it. Registration state is stored in `bot_registration_states`, and the profile is created in the same database used by the Mini App.

Available commands:

| Command | Purpose |
| --- | --- |
| `/start` | Register or open the platform |
| `/profile` | Show profile, coins and activity |
| `/language` | Change the interface language |
| `/support` | Support contact |
| `/help` | Help text |

Commands are registered with Telegram automatically at startup. Descriptions are intentionally short and language-neutral (`Profile / Profil`, etc.).

## 6. Verify authentication

The Mini App receives `initData` from the Telegram WebApp SDK. The API:

1. parses the query string;
2. removes `hash`;
3. builds the data-check-string in Telegram's required order;
4. computes HMAC-SHA256 with the key derived from `HMAC_SHA256("WebAppData", bot_token)`;
5. compares the result in constant time;
6. rejects stale `auth_date` values older than `TELEGRAM_AUTH_MAX_AGE_SECONDS`.

If the app is opened in a normal browser, Telegram auth is unavailable; development login is used only outside production.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Bot logs `409 Conflict` | Another bot instance is polling with the same token |
| Menu button missing | `TELEGRAM_WEBAPP_URL` must be HTTPS and the app visible in BotFather |
| `BOT_NOT_CONFIGURED` | API has no `TELEGRAM_BOT_TOKEN`; set it and restart both services |
| Init data rejected | App and bot use different tokens, URL is stale, or clock/auth age is off |
| Bot says service error | API is down or `API_URL` is wrong |
| WebApp opens blank | The web build must include the Telegram script and be served over HTTPS |

## Revoking a token

If a token leaks, use BotFather `/revoke` and update `TELEGRAM_BOT_TOKEN` on both the API and bot. Restart both processes. Internal API calls will fail until they share the new token.
