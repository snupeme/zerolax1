export type Dialect = 'pglite' | 'postgres';

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  dialect: Dialect;
}

export interface CreateDbOptions {
  /** Postgres connection string. When omitted, an embedded PGlite database is used. */
  databaseUrl?: string;
  /** Directory for the embedded database. Defaults to `.data/zerolax`. */
  pgliteDir?: string;
  /** Enable SSL for the Postgres connection. */
  ssl?: boolean;
  /** Use an in-memory PGlite instance (tests). */
  memory?: boolean;
}

export type Language = 'uz' | 'ru' | 'en';

export interface NotificationPrefs {
  dailyIq: boolean;
  results: boolean;
  announcements: boolean;
}

export interface ProfileRow {
  id: string;
  telegram_id: string;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  nickname: string;
  language: Language;
  phone: string | null;
  avatar_url: string | null;
  coins_balance: number;
  status: 'active' | 'blocked';
  notification_prefs: NotificationPrefs;
  is_dev: boolean;
  registered_at: string | Date;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface BotStateRow {
  telegram_id: string;
  step: 'language' | 'nickname' | 'phone';
  language: Language | null;
  nickname: string | null;
  updated_at: string | Date;
}

export interface CreditCoinsInput {
  userId: string;
  amount: number;
  type: string;
  sourceType?: string | null;
  sourceId?: string | null;
  idempotencyKey: string;
  description?: string | null;
  createdBy?: string | null;
}

export interface CreditCoinsResult {
  credited: boolean;
  balance: number;
}
