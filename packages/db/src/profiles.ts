import type { BotStateRow, Language, ProfileRow, Queryable } from './types';

type RawProfile = Omit<ProfileRow, 'telegram_id'> & { telegram_id: string | number | bigint };

function normalizeProfile(row: RawProfile): ProfileRow {
  return {
    ...row,
    telegram_id: String(row.telegram_id),
    coins_balance: Number(row.coins_balance),
    notification_prefs:
      typeof row.notification_prefs === 'string'
        ? JSON.parse(row.notification_prefs)
        : row.notification_prefs,
  };
}

const PROFILE_COLUMNS = `
  id, telegram_id, telegram_username, first_name, last_name, nickname, language, phone,
  avatar_url, coins_balance, status, notification_prefs, is_dev, registered_at, created_at, updated_at
`;

export async function findProfileByTelegramId(
  db: Queryable,
  telegramId: string | number | bigint,
): Promise<ProfileRow | null> {
  const rows = await db.query<RawProfile>(
    `select ${PROFILE_COLUMNS} from profiles where telegram_id = $1`,
    [String(telegramId)],
  );
  return rows[0] ? normalizeProfile(rows[0]) : null;
}

export async function findProfileById(db: Queryable, id: string): Promise<ProfileRow | null> {
  const rows = await db.query<RawProfile>(
    `select ${PROFILE_COLUMNS} from profiles where id = $1`,
    [id],
  );
  return rows[0] ? normalizeProfile(rows[0]) : null;
}

export interface CreateProfileInput {
  telegramId: string | number | bigint;
  nickname: string;
  language: Language;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  isDev?: boolean;
}

export async function createProfile(
  db: Queryable,
  input: CreateProfileInput,
): Promise<ProfileRow> {
  const rows = await db.query<RawProfile>(
    `insert into profiles
      (telegram_id, telegram_username, first_name, last_name, nickname, language, phone, avatar_url, is_dev)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning ${PROFILE_COLUMNS}`,
    [
      String(input.telegramId),
      input.username ?? null,
      input.firstName ?? null,
      input.lastName ?? null,
      input.nickname,
      input.language,
      input.phone ?? null,
      input.avatarUrl ?? null,
      input.isDev ?? false,
    ],
  );
  return normalizeProfile(rows[0]);
}

export async function findProfileByNickname(
  db: Queryable,
  nickname: string,
): Promise<ProfileRow | null> {
  const rows = await db.query<RawProfile>(
    `select ${PROFILE_COLUMNS} from profiles where lower(nickname) = lower($1)`,
    [nickname],
  );
  return rows[0] ? normalizeProfile(rows[0]) : null;
}

export async function isNicknameTaken(
  db: Queryable,
  nickname: string,
  exceptUserId?: string,
): Promise<boolean> {
  const rows = await db.query(
    `select 1 from profiles where lower(nickname) = lower($1) and ($2::uuid is null or id <> $2::uuid)`,
    [nickname, exceptUserId ?? null],
  );
  return rows.length > 0;
}

export async function setProfileLanguage(
  db: Queryable,
  userId: string,
  language: Language,
): Promise<void> {
  await db.query('update profiles set language = $1, updated_at = now() where id = $2', [
    language,
    userId,
  ]);
}

export async function touchUserActivity(
  db: Queryable,
  userId: string,
  activityDate: string,
): Promise<void> {
  await db.query(
    `insert into user_activity (user_id, activity_date) values ($1, $2)
     on conflict (user_id, activity_date) do nothing`,
    [userId, activityDate],
  );
}

export async function getBotState(
  db: Queryable,
  telegramId: string | number,
): Promise<BotStateRow | null> {
  const rows = await db.query<BotStateRow & { telegram_id: string | number | bigint }>(
    'select telegram_id, step, language, nickname, updated_at from bot_registration_states where telegram_id = $1',
    [String(telegramId)],
  );
  const row = rows[0];
  return row ? { ...row, telegram_id: String(row.telegram_id) } : null;
}

export async function setBotState(
  db: Queryable,
  telegramId: string | number,
  state: { step: 'language' | 'nickname' | 'phone'; language?: Language | null; nickname?: string | null },
): Promise<void> {
  await db.query(
    `insert into bot_registration_states (telegram_id, step, language, nickname, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (telegram_id) do update
       set step = excluded.step,
           language = excluded.language,
           nickname = excluded.nickname,
           updated_at = now()`,
    [String(telegramId), state.step, state.language ?? null, state.nickname ?? null],
  );
}

export async function clearBotState(db: Queryable, telegramId: string | number): Promise<void> {
  await db.query('delete from bot_registration_states where telegram_id = $1', [
    String(telegramId),
  ]);
}

export interface ProfileStatsRow {
  iq_completed: number;
  iq_correct: number;
  iq_questions: number;
  entrance_completed: number;
  entrance_correct: number;
  entrance_questions: number;
  coins_earned: number;
  achievements: AchievementRow[];
}

export interface AchievementRow {
  code: string;
  title_uz: string;
  title_ru: string;
  title_en: string;
  description_uz: string | null;
  description_ru: string | null;
  description_en: string | null;
  icon: string;
  awarded_at: string | Date;
}

export async function getProfileStats(db: Queryable, userId: string): Promise<ProfileStatsRow> {
  const [counts] = await db.query<{
    iq_completed: number;
    iq_correct: number;
    iq_questions: number;
    entrance_completed: number;
    entrance_correct: number;
    entrance_questions: number;
    coins_earned: number;
  }>(
    `select
       (select count(*) from iq_attempts where user_id = $1 and status in ('submitted', 'scored'))::int as iq_completed,
       (select coalesce(sum(correct_count), 0) from iq_attempts where user_id = $1 and status = 'scored')::int as iq_correct,
       (select coalesce(sum(total_questions), 0) from iq_attempts where user_id = $1 and status = 'scored')::int as iq_questions,
       (select count(*) from entrance_attempts where user_id = $1 and status in ('submitted', 'expired'))::int as entrance_completed,
       (select coalesce(sum(correct_count), 0) from entrance_attempts where user_id = $1 and status in ('submitted', 'expired'))::int as entrance_correct,
       (select coalesce(sum(total_questions), 0) from entrance_attempts where user_id = $1 and status in ('submitted', 'expired'))::int as entrance_questions,
       (select coalesce(sum(amount), 0) from coin_transactions where user_id = $1 and amount > 0)::int as coins_earned`,
    [userId],
  );

  const achievements = await db.query<AchievementRow>(
    `select a.code, a.title_uz, a.title_ru, a.title_en,
            a.description_uz, a.description_ru, a.description_en,
            a.icon, ua.awarded_at
       from user_achievements ua
       join achievements a on a.id = ua.achievement_id
      where ua.user_id = $1
      order by ua.awarded_at desc`,
    [userId],
  );

  return {
    iq_completed: Number(counts?.iq_completed ?? 0),
    iq_correct: Number(counts?.iq_correct ?? 0),
    iq_questions: Number(counts?.iq_questions ?? 0),
    entrance_completed: Number(counts?.entrance_completed ?? 0),
    entrance_correct: Number(counts?.entrance_correct ?? 0),
    entrance_questions: Number(counts?.entrance_questions ?? 0),
    coins_earned: Number(counts?.coins_earned ?? 0),
    achievements,
  };
}
