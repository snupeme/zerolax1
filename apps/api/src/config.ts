import './env';

export interface AppConfig {
  nodeEnv: string;
  isProd: boolean;
  port: number;
  host: string;
  webUrl: string;
  corsOrigins: string[];
  databaseUrl?: string;
  pgliteDir: string;
  databaseSsl: boolean;
  jwtSecret: string;
  accessTtlSeconds: number;
  refreshTtlDays: number;
  devAuthEnabled: boolean;
  botToken?: string;
  botUsername: string;
  webappUrl: string;
  telegramAuthMaxAgeSeconds: number;
  adminEmail?: string;
  adminPassword?: string;
  adminName: string;
  supportEmail: string;
  logLevel: string;
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const isProd = nodeEnv === 'production';
  const webUrl = (env.WEB_URL ?? 'http://localhost:5173').replace(/\/$/, '');
  const jwtSecret = env.JWT_SECRET ?? 'dev-only-insecure-secret-change-me';

  if (isProd && jwtSecret === 'dev-only-insecure-secret-change-me') {
    throw new Error('JWT_SECRET must be configured in production');
  }

  const devAuthEnabled = !isProd && bool(env.DEV_AUTH_ENABLED, true);

  const corsOrigins = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    nodeEnv,
    isProd,
    port: int(env.PORT, 4000),
    host: env.HOST ?? '0.0.0.0',
    webUrl,
    corsOrigins,
    databaseUrl: env.DATABASE_URL?.trim() || undefined,
    pgliteDir: env.PGLITE_DIR ?? '.data/zerolax',
    databaseSsl: bool(env.DATABASE_SSL, false),
    jwtSecret,
    accessTtlSeconds: int(env.ACCESS_TOKEN_TTL_SECONDS, 900),
    refreshTtlDays: int(env.REFRESH_TOKEN_TTL_DAYS, 30),
    devAuthEnabled,
    botToken: env.TELEGRAM_BOT_TOKEN?.trim() || undefined,
    botUsername: (env.TELEGRAM_BOT_USERNAME ?? 'ZerolaxBot').replace(/^@/, ''),
    webappUrl: (env.TELEGRAM_WEBAPP_URL ?? webUrl).replace(/\/$/, ''),
    telegramAuthMaxAgeSeconds: int(env.TELEGRAM_AUTH_MAX_AGE_SECONDS, 300),
    adminEmail: env.ADMIN_EMAIL?.trim() || undefined,
    adminPassword: env.ADMIN_PASSWORD || undefined,
    adminName: env.ADMIN_NAME?.trim() || 'ZEROLAX Admin',
    supportEmail: env.SUPPORT_EMAIL?.trim() || 'support@zerolax.uz',
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
