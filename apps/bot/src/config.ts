import dotenv from 'dotenv';
import {resolve} from 'node:path';

// Both workspace-root launches and npm workspace launches must read the same bot secret.
dotenv.config({path:[resolve(process.cwd(),'.env'),resolve(process.cwd(),'../../.env')],quiet:true});

export interface BotConfig {
  /** Telegram bot token from BotFather. When empty the bot idles in dev mode. */
  token?: string;
  botUsername: string;
  /** Base URL of the ZEROLAX API (server-to-server). */
  apiBaseUrl: string;
  /** Public URL of the Mini App used by WebApp buttons. */
  webappUrl: string;
  supportEmail: string;
  logLevel: string;
}

export function loadBotConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  const port = env.PORT ?? '4000';
  return {
    token: env.TELEGRAM_BOT_TOKEN?.trim() || undefined,
    botUsername: (env.TELEGRAM_BOT_USERNAME ?? 'ZerolaxBot').replace(/^@/, ''),
    apiBaseUrl: (env.API_URL ?? `http://localhost:${port}`).replace(/\/$/, ''),
    webappUrl: (env.TELEGRAM_WEBAPP_URL ?? env.WEB_URL ?? 'http://localhost:5173').replace(
      /\/$/,
      '',
    ),
    supportEmail: env.SUPPORT_EMAIL?.trim() || 'support@zerolax.uz',
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
