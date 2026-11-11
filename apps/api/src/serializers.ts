import type {
  Achievement,
  CoinTransaction,
  NotificationPrefs,
  Profile,
  ProfileStats,
  QuestionPublic,
  QuestionResult,
} from '@zerolax/shared';
import { localizeText, type Language } from './localize';
import type { AchievementRow, ProfileRow, ProfileStatsRow } from '@zerolax/db';

export function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function parsePrefs(value: NotificationPrefs | string): NotificationPrefs {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as NotificationPrefs;
    } catch {
      return { dailyIq: true, results: true, announcements: true };
    }
  }
  return value;
}

export function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    nickname: row.nickname,
    language: row.language,
    // Phone numbers are private and never returned by the API.
    phone: null,
    avatarUrl: row.avatar_url,
    coinsBalance: Number(row.coins_balance),
    status: row.status,
    notificationPrefs: parsePrefs(row.notification_prefs),
    registeredAt: toIso(row.registered_at) ?? new Date().toISOString(),
  };
}

export function mapAchievement(row: AchievementRow, language: Language): Achievement {
  return {
    code: row.code,
    title: localizeText(row, 'title', language),
    description: localizeText(row, 'description', language),
    icon: row.icon,
    awardedAt: toIso(row.awarded_at) ?? new Date().toISOString(),
  };
}

export function mapStats(row: ProfileStatsRow, language: Language): ProfileStats {
  return {
    iqCompleted: Number(row.iq_completed),
    iqCorrect: Number(row.iq_correct),
    iqQuestions: Number(row.iq_questions),
    entranceCompleted: Number(row.entrance_completed),
    entranceCorrect: Number(row.entrance_correct),
    entranceQuestions: Number(row.entrance_questions),
    coinsEarned: Number(row.coins_earned),
    achievements: row.achievements.map((achievement) => mapAchievement(achievement, language)),
  };
}

export function mapCoinTransaction(row: {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  balance_after: number | null;
  created_at: string | Date;
}): CoinTransaction {
  return {
    id: row.id,
    amount: Number(row.amount),
    type: row.type,
    description: row.description,
    balanceAfter: row.balance_after === null ? null : Number(row.balance_after),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  };
}

export interface QuestionTextRow {
  id: string;
  position: number;
  text_uz: string;
  text_ru: string;
  text_en: string;
  image_url: string | null;
  explanation_uz?: string | null;
  explanation_ru?: string | null;
  explanation_en?: string | null;
  coins?: number;
  correct_option_index?: number;
}

export interface OptionTextRow {
  id: string;
  question_id: string;
  position: number;
  text_uz: string;
  text_ru: string;
  text_en: string;
}

export function mapPublicQuestions(
  questions: QuestionTextRow[],
  options: OptionTextRow[],
  language: Language,
): QuestionPublic[] {
  const grouped = new Map<string, OptionTextRow[]>();
  for (const option of options) {
    const list = grouped.get(option.question_id) ?? [];
    list.push(option);
    grouped.set(option.question_id, list);
  }

  return questions.map((question) => ({
    id: question.id,
    position: question.position,
    text: localizeText(question, 'text', language),
    imageUrl: question.image_url,
    options: (grouped.get(question.id) ?? [])
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((option) => ({
        id: option.id,
        position: Number(option.position),
        text: localizeText(option, 'text', language),
      })),
  }));
}

export function mapResultQuestions(
  questions: QuestionTextRow[],
  options: OptionTextRow[],
  answers: Map<string, string>,
  language: Language,
): QuestionResult[] {
  const grouped = new Map<string, OptionTextRow[]>();
  for (const option of options) {
    const list = grouped.get(option.question_id) ?? [];
    list.push(option);
    grouped.set(option.question_id, list);
  }

  return questions.map((question) => {
    const questionOptions = (grouped.get(question.id) ?? []).sort(
      (a, b) => Number(a.position) - Number(b.position),
    );
    const correctOption = questionOptions.find(
      (option) => Number(option.position) === Number(question.correct_option_index),
    );
    const selectedOptionId = answers.get(question.id) ?? null;
    const publicOptions = questionOptions.map((option) => ({
      id: option.id,
      position: Number(option.position),
      text: localizeText(option, 'text', language),
    }));

    return {
      id: question.id,
      position: question.position,
      text: localizeText(question, 'text', language),
      imageUrl: question.image_url,
      options: publicOptions,
      correctOptionId: correctOption?.id ?? '',
      selectedOptionId,
      isCorrect: Boolean(correctOption && selectedOptionId === correctOption.id),
      explanation: localizeText(question, 'explanation', language) || null,
      coins: Number(question.coins ?? 0),
    };
  });
}

// Telegram identity must never hitchhike in profile, audit or nested admin payloads.
const TELEGRAM_PRIVATE_KEYS = new Set([
  'telegramId','telegram_id','telegramUserId','telegram_user_id','telegramUsername',
  'telegram_username','username','firstName','first_name','lastName','last_name',
  'telegram','initData','init_data','authDate','auth_date','tg','isDev','is_dev',
]);
export function withoutTelegramIdentity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutTelegramIdentity);
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !TELEGRAM_PRIVATE_KEYS.has(key)).map(([key, item]) => [key, withoutTelegramIdentity(item)]));
}
