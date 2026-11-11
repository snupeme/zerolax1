import type { Db, Queryable } from '@zerolax/db';
import { creditCoins } from '@zerolax/db';
import type { Language } from '@zerolax/shared';
import { ApiError } from '../errors';

export const EDTECH_SUBJECTS = [
  'all',
  'algebra',
  'geometry',
  'iq',
  'entrance',
  'games',
  'dtm',
  'sat',
  'english',
] as const;
export type EdtechSubject = (typeof EDTECH_SUBJECTS)[number];
export type LeaderboardPeriod = 'weekly' | 'monthly' | 'all';
export type FlashcardRating = 'again' | 'hard' | 'good' | 'easy';

const TZ = 'Asia/Tashkent';
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Date & text helpers
// ---------------------------------------------------------------------------
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date in the platform timezone as YYYY-MM-DD. */
export function localDate(value: Date = new Date()): string {
  return dateFormatter.format(value);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date + 'T00:00:00Z') + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY_MS);
}

export function weekStart(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  const offset = (d.getUTCDay() + 6) % 7;
  return addDays(date, -offset);
}

export function monthStart(date: string): string {
  return date.slice(0, 8) + '01';
}

export interface DateRange {
  start: string;
  end: string;
}

export function periodRange(period: LeaderboardPeriod, today = localDate()): DateRange {
  if (period === 'weekly') return { start: weekStart(today), end: today };
  if (period === 'monthly') return { start: monthStart(today), end: today };
  return { start: '2000-01-01', end: today };
}

export function previousRange(period: LeaderboardPeriod, today = localDate()): DateRange {
  if (period === 'weekly') {
    const start = addDays(weekStart(today), -7);
    return { start, end: addDays(start, 6) };
  }
  if (period === 'monthly') {
    const start = addDays(monthStart(today), -1);
    return { start: monthStart(start), end: start };
  }
  return { start: '2000-01-01', end: '2000-01-01' };
}

type Localized = { uz?: string; ru?: string; en?: string } | null | undefined;

export function pick(value: Localized, language: Language): string {
  if (!value || typeof value !== 'object') return '';
  return value[language] ?? value.uz ?? value.en ?? '';
}

export function toLocalized(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const key of ['uz', 'ru', 'en']) {
    if (typeof record[key] === 'string') result[key] = record[key] as string;
  }
  return result;
}

function asDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '').slice(0, 10);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export interface EdtechSettings {
  intervals: Record<FlashcardRating, number>;
  leaderboardWeights: { correct: number; test: number };
  streakRewards: Record<string, number>;
}

export async function getEdtechSettings(db: Queryable): Promise<EdtechSettings> {
  const [row] = await db.query<{
    intervals: unknown;
    leaderboard_weights: unknown;
    streak_rewards: unknown;
  }>('select intervals, leaderboard_weights, streak_rewards from edtech_settings where id = 1');
  const intervals = (row?.intervals ?? {}) as Record<string, unknown>;
  const weights = (row?.leaderboard_weights ?? {}) as Record<string, unknown>;
  const rewards = (row?.streak_rewards ?? {}) as Record<string, unknown>;
  return {
    intervals: {
      again: Number(intervals.again ?? 0),
      hard: Number(intervals.hard ?? 1),
      good: Number(intervals.good ?? 3),
      easy: Number(intervals.easy ?? 7),
    },
    leaderboardWeights: {
      correct: Number(weights.correct ?? 1),
      test: Number(weights.test ?? 5),
    },
    streakRewards: Object.fromEntries(
      Object.entries(rewards).map(([key, value]) => [key, Number(value)]),
    ),
  };
}

// ---------------------------------------------------------------------------
// Activity recording
// ---------------------------------------------------------------------------
export type ActivityKind = 'question' | 'test' | 'topic' | 'flashcard' | 'mistake_review' | 'game';

export interface ActivityInput {
  kind: ActivityKind;
  subject?: string;
  topicKey?: string;
  topic?: string;
  questionRef?: string | null;
  correct?: boolean | null;
  score?: number | null;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}

/**
 * Writes activity rows, keeps the learning map and streak current and refreshes
 * today's missions. Everything is derived from real submissions.
 */
export async function recordActivity(
  db: Queryable,
  userId: string,
  items: ActivityInput[],
): Promise<void> {
  if (items.length === 0) return;
  const dates = new Set<string>();

  for (const item of items) {
    const occurredAt = item.occurredAt ?? new Date();
    const activityDate = localDate(occurredAt);
    dates.add(activityDate);
    await db.query(
      `insert into learning_activity
        (user_id, kind, subject, topic_key, topic, question_ref, correct, score,
         source_type, source_id, activity_date, occurred_at, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::date,$12,$13::jsonb)`,
      [
        userId,
        item.kind,
        item.subject ?? 'general',
        item.topicKey ?? 'general',
        item.topic ?? '',
        item.questionRef ?? null,
        item.correct ?? null,
        item.score ?? null,
        item.sourceType ?? null,
        item.sourceId ?? null,
        activityDate,
        occurredAt.toISOString(),
        JSON.stringify(item.metadata ?? {}),
      ],
    );

    if (item.kind === 'question' || item.kind === 'test' || item.kind === 'topic' || item.kind === 'game') {
      const subject = item.subject ?? 'general';
      const topicKey = item.topicKey ?? 'general';
      const correct = item.correct ?? null;
      await db.query(
        `insert into learning_analytics
          (user_id, subject, topic_key, topic, status, attempts, correct_count, total_count, last_activity_at)
         values ($1,$2,$3,$4,'in_progress',1,
                 case when $5::boolean then 1 else 0 end,
                 case when $5::boolean is null then 0 else 1 end, now())
         on conflict (user_id, subject, topic_key) do update set
           attempts = learning_analytics.attempts + 1,
           correct_count = learning_analytics.correct_count + case when $5::boolean then 1 else 0 end,
           total_count = learning_analytics.total_count + case when $5::boolean is null then 0 else 1 end,
           topic = case when excluded.topic <> '' then excluded.topic else learning_analytics.topic end,
           last_activity_at = now()`,
        [userId, subject, topicKey, item.topic ?? '', correct],
      );
      if (item.kind === 'topic' && correct !== false) {
        await db.query(
          `update learning_analytics set status = 'mastered'
            where user_id=$1 and subject=$2 and topic_key=$3`,
          [userId, subject, topicKey],
        );
      } else {
        await db.query(
          `update learning_analytics set status = case
             when total_count >= 5 and correct_count * 100 >= total_count * 80 then 'mastered'
             when total_count >= 3 and correct_count * 100 < total_count * 50 then 'needs_review'
             when status = 'mastered' and correct_count * 100 < total_count * 60 then 'needs_review'
             else 'in_progress' end
            where user_id=$1 and subject=$2 and topic_key=$3`,
          [userId, subject, topicKey],
        );
      }
    }
  }

  await touchStreak(db, userId);
  for (const date of dates) await refreshDailyMissions(db, userId, date);
  await evaluateAchievements(db, userId);
}

// ---------------------------------------------------------------------------
// Streak
// ---------------------------------------------------------------------------
export interface StreakInfo {
  current: number;
  longest: number;
  lastActivityDate: string | null;
  nextMilestone: number | null;
  milestones: Array<{ milestone: number; reward: number; claimed: boolean; reached: boolean }>;
}

export async function touchStreak(db: Queryable, userId: string): Promise<void> {
  const today = localDate();
  const [row] = await db.query<{
    current_streak: number;
    longest_streak: number;
    last_activity_date: unknown;
  }>('select current_streak, longest_streak, last_activity_date from user_streaks where user_id=$1 for update', [
    userId,
  ]);

  let current = 1;
  if (!row) {
    await db.query(
      `insert into user_streaks (user_id, current_streak, longest_streak, last_activity_date)
       values ($1,1,1,$2::date) on conflict (user_id) do nothing`,
      [userId, today],
    );
  } else {
    const last = row.last_activity_date ? asDateString(row.last_activity_date) : null;
    if (last === today) return;
    const diff = last ? dayDiff(last, today) : null;
    current = diff === 1 ? Number(row.current_streak) + 1 : 1;
    const longest = Math.max(Number(row.longest_streak), current);
    await db.query(
      `update user_streaks set current_streak=$2, longest_streak=$3, last_activity_date=$4::date, updated_at=now()
        where user_id=$1`,
      [userId, current, longest, today],
    );
  }

  const settings = await getEdtechSettings(db);
  for (const [key, reward] of Object.entries(settings.streakRewards)) {
    const milestone = Number(key);
    if (!Number.isFinite(milestone) || milestone > current || reward <= 0) continue;
    const inserted = await db.query<{ milestone: number }>(
      `insert into user_streak_rewards (user_id, milestone) values ($1,$2)
       on conflict (user_id, milestone) do nothing returning milestone`,
      [userId, milestone],
    );
    if (inserted.length === 0) continue;
    await creditCoins(db, {
      userId,
      amount: reward,
      type: 'streak',
      sourceType: 'streak',
      sourceId: String(milestone),
      idempotencyKey: `streak:${userId}:${milestone}`,
      description: `Streak milestone ${milestone} days`,
    });
  }
}

export async function getStreak(db: Queryable, userId: string): Promise<StreakInfo> {
  const [row] = await db.query<{
    current_streak: number;
    longest_streak: number;
    last_activity_date: unknown;
  }>('select current_streak, longest_streak, last_activity_date from user_streaks where user_id=$1', [
    userId,
  ]);
  const settings = await getEdtechSettings(db);
  const claimed = await db.query<{ milestone: number }>(
    'select milestone from user_streak_rewards where user_id=$1',
    [userId],
  );
  const claimedSet = new Set(claimed.map((item) => Number(item.milestone)));
  const milestones = Object.entries(settings.streakRewards)
    .map(([key, reward]) => Number(key))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const current = Number(row?.current_streak ?? 0);
  const nextMilestone = milestones.find((milestone) => milestone > current) ?? null;
  return {
    current,
    longest: Number(row?.longest_streak ?? 0),
    lastActivityDate: row?.last_activity_date ? asDateString(row.last_activity_date) : null,
    nextMilestone,
    milestones: milestones.map((milestone) => ({
      milestone,
      reward: Number(settings.streakRewards[String(milestone)] ?? 0),
      claimed: claimedSet.has(milestone),
      reached: current >= milestone,
    })),
  };
}

// ---------------------------------------------------------------------------
// Daily missions
// ---------------------------------------------------------------------------
interface MissionCounts {
  questions_answered: number;
  algebra_topic: number;
  geometry_practice: number;
  flashcards_reviewed: number;
  mistakes_reviewed: number;
  daily_test: number;
}

async function missionCounts(db: Queryable, userId: string, date: string): Promise<MissionCounts> {
  const [row] = await db.query<Record<string, number>>(
    `select
       count(*) filter (where kind in ('question','game'))::int as questions_answered,
       count(*) filter (where kind='topic' and subject='algebra')::int as algebra_topic,
       count(*) filter (where kind='question' and subject='geometry')::int as geometry_practice,
       count(*) filter (where kind='flashcard')::int as flashcards_reviewed,
       count(*) filter (where kind='mistake_review')::int as mistakes_reviewed,
       count(*) filter (where kind='test')::int as daily_test
     from learning_activity where user_id=$1 and activity_date=$2::date`,
    [userId, date],
  );
  return {
    questions_answered: Number(row?.questions_answered ?? 0),
    algebra_topic: Number(row?.algebra_topic ?? 0),
    geometry_practice: Number(row?.geometry_practice ?? 0),
    flashcards_reviewed: Number(row?.flashcards_reviewed ?? 0),
    mistakes_reviewed: Number(row?.mistakes_reviewed ?? 0),
    daily_test: Number(row?.daily_test ?? 0),
  };
}

export interface MissionView {
  id: string;
  code: string;
  metric: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  rewardCoins: number;
  completed: boolean;
  rewardCredited: boolean;
  completedAt: string | null;
}

export async function refreshDailyMissions(
  db: Queryable,
  userId: string,
  date = localDate(),
): Promise<void> {
  const counts = await missionCounts(db, userId, date);
  const missions = await db.query<{
    id: string;
    code: string;
    metric: keyof MissionCounts;
    target: number;
    reward_coins: number;
  }>(
    `select id, code, metric, target, reward_coins from daily_missions
      where active = true
        and (starts_on is null or starts_on <= $1::date)
        and (ends_on is null or ends_on >= $1::date)
      order by sort_order`,
    [date],
  );

  for (const mission of missions) {
    const value = Math.min(counts[mission.metric] ?? 0, Number(mission.target));
    await db.query(
      `insert into user_daily_missions
        (user_id, mission_id, mission_date, progress, target, completed_at)
       values ($1,$2,$3::date,$4::int,$5::int, case when $4::int >= $5::int then now() else null end)
       on conflict (user_id, mission_id, mission_date) do update set
         progress = greatest(user_daily_missions.progress, excluded.progress),
         target = excluded.target,
         completed_at = coalesce(user_daily_missions.completed_at, excluded.completed_at)`,
      [userId, mission.id, date, value, mission.target],
    );
  }

  const claimable = await db.query<{
    id: string;
    code: string;
    reward_coins: number;
  }>(
    `select udm.id, m.code, m.reward_coins
       from user_daily_missions udm
       join daily_missions m on m.id = udm.mission_id
      where udm.user_id=$1 and udm.mission_date=$2::date
        and udm.completed_at is not null and udm.reward_credited_at is null`,
    [userId, date],
  );
  for (const mission of claimable) {
    if (Number(mission.reward_coins) > 0) {
      await creditCoins(db, {
        userId,
        amount: Number(mission.reward_coins),
        type: 'daily_mission',
        sourceType: 'daily_mission',
        sourceId: mission.id,
        idempotencyKey: `mission:${userId}:${date}:${mission.code}`,
        description: `Daily mission completed: ${mission.code}`,
      });
    }
    await db.query('update user_daily_missions set reward_credited_at = now() where id=$1', [
      mission.id,
    ]);
  }
}

export async function getMissions(
  db: Queryable,
  userId: string,
  language: Language,
  date = localDate(),
): Promise<{ date: string; missions: MissionView[]; completed: number; total: number }> {
  await refreshDailyMissions(db, userId, date);
  const rows = await db.query<{
    id: string;
    code: string;
    metric: string;
    titles: unknown;
    descriptions: unknown;
    target: number;
    reward_coins: number;
    progress: number;
    completed_at: string | Date | null;
    reward_credited_at: string | Date | null;
  }>(
    `select m.id, m.code, m.metric, m.titles, m.descriptions, m.target, m.reward_coins,
            coalesce(udm.progress, 0) as progress, udm.completed_at, udm.reward_credited_at
       from daily_missions m
       left join user_daily_missions udm
         on udm.mission_id = m.id and udm.user_id = $1 and udm.mission_date = $2::date
      where m.active = true
        and (m.starts_on is null or m.starts_on <= $2::date)
        and (m.ends_on is null or m.ends_on >= $2::date)
      order by m.sort_order`,
    [userId, date],
  );
  const missions: MissionView[] = rows.map((row) => ({
    id: row.id,
    code: row.code,
    metric: row.metric,
    title: pick(toLocalized(row.titles), language),
    description: pick(toLocalized(row.descriptions), language),
    progress: Number(row.progress),
    target: Number(row.target),
    rewardCoins: Number(row.reward_coins),
    completed: Boolean(row.completed_at),
    rewardCredited: Boolean(row.reward_credited_at),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  }));
  return {
    date,
    missions,
    completed: missions.filter((mission) => mission.completed).length,
    total: missions.length,
  };
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------
export interface AchievementView {
  code: string;
  title: string;
  description: string;
  icon: string;
  coinReward: number;
  criteria: Record<string, unknown>;
  unlocked: boolean;
  awardedAt: string | null;
}

export async function evaluateAchievements(db: Queryable, userId: string): Promise<string[]> {
  const [counts] = await db.query<Record<string, number>>(
    `select
       (select count(*)::int from learning_activity where user_id=$1 and kind in ('question','game')) as questions,
       (select coalesce(current_streak,0)::int from user_streaks where user_id=$1) as streak,
       (select count(*)::int from learning_analytics where user_id=$1 and status='mastered') as topics,
       (select count(*)::int from mistake_review_history where user_id=$1 and correct=true) as mistake_reviews,
       (select count(*)::int from user_flashcard_progress where user_id=$1 and correct_count > 0) as flashcards,
       (select count(*)::int from user_daily_missions where user_id=$1 and completed_at is not null) as missions`,
    [userId],
  );
  const metrics: Record<string, number> = {
    questions: Number(counts?.questions ?? 0),
    streak: Number(counts?.streak ?? 0),
    topics: Number(counts?.topics ?? 0),
    mistake_reviews: Number(counts?.mistake_reviews ?? 0),
    flashcards: Number(counts?.flashcards ?? 0),
    missions: Number(counts?.missions ?? 0),
    rank: 9999,
  };

  const weekly = await computeLeaderboard(db, 'weekly', 'all', 1000, userId);
  if (weekly.currentUser?.rank) metrics.rank = weekly.currentUser.rank;

  const catalogue = await db.query<{
    id: string;
    code: string;
    coin_reward: number;
    criteria: unknown;
  }>(
    `select id, code, coin_reward, criteria from achievements
      where active = true and criteria <> '{}'::jsonb`,
  );
  const awarded: string[] = [];
  for (const achievement of catalogue) {
    const criteria = (achievement.criteria ?? {}) as { type?: string; value?: number };
    if (!criteria.type || !(criteria.type in metrics)) continue;
    if (metrics[criteria.type] < Number(criteria.value ?? 0)) continue;
    const inserted = await db.query<{ achievement_id: string }>(
      `insert into user_achievements (user_id, achievement_id) values ($1,$2)
       on conflict (user_id, achievement_id) do nothing returning achievement_id`,
      [userId, achievement.id],
    );
    if (inserted.length === 0) continue;
    awarded.push(achievement.code);
    if (Number(achievement.coin_reward) > 0) {
      await creditCoins(db, {
        userId,
        amount: Number(achievement.coin_reward),
        type: 'achievement',
        sourceType: 'achievement',
        sourceId: achievement.code,
        idempotencyKey: `achievement:${userId}:${achievement.code}`,
        description: `Achievement unlocked: ${achievement.code}`,
      });
    }
  }
  return awarded;
}

export async function getAchievements(
  db: Queryable,
  userId: string,
  language: Language,
): Promise<{ achievements: AchievementView[]; unlocked: number; total: number }> {
  const rows = await db.query<{
    code: string;
    title_uz: string;
    title_ru: string;
    title_en: string;
    description_uz: string | null;
    description_ru: string | null;
    description_en: string | null;
    icon: string;
    coin_reward: number;
    criteria: unknown;
    awarded_at: string | Date | null;
  }>(
    `select a.code, a.title_uz, a.title_ru, a.title_en,
            a.description_uz, a.description_ru, a.description_en,
            a.icon, a.coin_reward, a.criteria, ua.awarded_at
       from achievements a
       left join user_achievements ua on ua.achievement_id = a.id and ua.user_id = $1
      where a.active = true
      order by a.sort_order, a.code`,
    [userId],
  );
  const achievements: AchievementView[] = rows.map((row) => ({
    code: row.code,
    title: pick(
      { uz: row.title_uz, ru: row.title_ru, en: row.title_en },
      language,
    ),
    description: pick(
      { uz: row.description_uz ?? '', ru: row.description_ru ?? '', en: row.description_en ?? '' },
      language,
    ),
    icon: row.icon,
    coinReward: Number(row.coin_reward),
    criteria: (row.criteria ?? {}) as Record<string, unknown>,
    unlocked: Boolean(row.awarded_at),
    awardedAt: row.awarded_at ? new Date(row.awarded_at).toISOString() : null,
  }));
  return {
    achievements,
    unlocked: achievements.filter((achievement) => achievement.unlocked).length,
    total: achievements.length,
  };
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------
export interface LeaderboardRow {
  rank: number | null;
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  score: number;
  questions: number;
  growth: number;
  isCurrentUser: boolean;
}

export interface LeaderboardResult {
  period: LeaderboardPeriod;
  subject: string;
  range: DateRange;
  rows: LeaderboardRow[];
  currentUser: LeaderboardRow | null;
  hidden: boolean;
  participants: number;
}

interface RawLeaderboardRow {
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  score: number;
  questions: number;
  rank: string | number;
  leaderboard_visible: boolean;
}

async function rankedScores(
  db: Queryable,
  start: string,
  end: string,
  subject: string,
  limit: number,
  correctWeight: number,
  testWeight: number,
): Promise<RawLeaderboardRow[]> {
  return db.query<RawLeaderboardRow>(
    `with scored as (
       select a.user_id,
         sum(case
           when a.kind in ('question','game') and a.correct then $3::numeric
           when a.kind = 'test' then $4::numeric
           when a.kind = 'topic' then 10
           when a.kind = 'flashcard' then 1
           when a.kind = 'mistake_review' and a.correct then 2
           else 0 end)::int as score,
         count(*) filter (where a.kind in ('question','game'))::int as questions
       from learning_activity a
       where a.activity_date between $1::date and $2::date
         and ($5::text = 'all' or a.subject = $5::text)
       group by a.user_id
     ), ranked as (
       select s.user_id, p.nickname, p.avatar_url, p.leaderboard_visible, s.score, s.questions,
         row_number() over (order by s.score desc, s.questions desc, p.nickname asc, s.user_id) as rank
       from scored s join profiles p on p.id = s.user_id
       where p.status = 'active' and p.leaderboard_visible
     )
     select * from ranked order by rank limit $6`,
    [start, end, correctWeight, testWeight, subject, limit],
  );
}

export async function computeLeaderboard(
  db: Queryable,
  period: LeaderboardPeriod,
  subject: string,
  limit: number,
  userId: string | null,
  today = localDate(),
): Promise<LeaderboardResult> {
  const settings = await getEdtechSettings(db);
  const range = periodRange(period, today);
  const previous = previousRange(period, today);
  const safeSubject = (EDTECH_SUBJECTS as readonly string[]).includes(subject) ? subject : 'all';

  const raw = await rankedScores(
    db,
    range.start,
    range.end,
    safeSubject,
    limit,
    settings.leaderboardWeights.correct,
    settings.leaderboardWeights.test,
  );

  const ids = raw.map((row) => row.user_id);
  let previousScores = new Map<string, number>();
  if (ids.length > 0) {
    const rows = await db.query<{ user_id: string; score: number }>(
      `select a.user_id,
         sum(case
           when a.kind in ('question','game') and a.correct then $3::numeric
           when a.kind = 'test' then $4::numeric
           when a.kind = 'topic' then 10
           when a.kind = 'flashcard' then 1
           when a.kind = 'mistake_review' and a.correct then 2
           else 0 end)::int as score
       from learning_activity a
       where a.activity_date between $1::date and $2::date
         and ($5::text = 'all' or a.subject = $5::text)
         and a.user_id = any($6::uuid[])
       group by a.user_id`,
      [
        previous.start,
        previous.end,
        settings.leaderboardWeights.correct,
        settings.leaderboardWeights.test,
        safeSubject,
        ids,
      ],
    );
    previousScores = new Map(rows.map((row) => [row.user_id, Number(row.score)]));
  }

  const toRow = (row: RawLeaderboardRow): LeaderboardRow => {
    const score = Number(row.score);
    const before = previousScores.get(row.user_id) ?? 0;
    return {
      rank: Number(row.rank),
      userId: row.user_id,
      nickname: row.nickname,
      avatarUrl: row.avatar_url,
      score,
      questions: Number(row.questions),
      growth: score - before,
      isCurrentUser: row.user_id === userId,
    };
  };

  const rows = raw.map(toRow);
  let currentUser: LeaderboardRow | null = rows.find((row) => row.isCurrentUser) ?? null;
  let hidden = false;

  if (userId) {
    const [profile] = await db.query<{
      nickname: string;
      avatar_url: string | null;
      leaderboard_visible: boolean;
    }>('select nickname, avatar_url, leaderboard_visible from profiles where id=$1', [userId]);
    hidden = profile ? !profile.leaderboard_visible : false;

    if (!currentUser) {
      const mine = await db.query<RawLeaderboardRow>(
        `with scored as (
           select a.user_id,
             sum(case
               when a.kind in ('question','game') and a.correct then $3::numeric
               when a.kind = 'test' then $4::numeric
               when a.kind = 'topic' then 10
               when a.kind = 'flashcard' then 1
               when a.kind = 'mistake_review' and a.correct then 2
               else 0 end)::int as score,
             count(*) filter (where a.kind in ('question','game'))::int as questions
           from learning_activity a
           where a.activity_date between $1::date and $2::date
             and ($5::text = 'all' or a.subject = $5::text)
           group by a.user_id
         ), ranked as (
           select s.user_id, p.nickname, p.avatar_url, p.leaderboard_visible, s.score, s.questions,
             row_number() over (order by s.score desc, s.questions desc, p.nickname asc, s.user_id) as rank
           from scored s join profiles p on p.id = s.user_id
           where p.status = 'active' and p.leaderboard_visible
         )
         select * from ranked where user_id = $6`,
        [
          range.start,
          range.end,
          settings.leaderboardWeights.correct,
          settings.leaderboardWeights.test,
          safeSubject,
          userId,
        ],
      );
      if (mine[0]) {
        currentUser = toRow(mine[0]);
      } else {
        const [own] = await db.query<{ score: number; questions: number }>(
          `select
             coalesce(sum(case
               when kind in ('question','game') and correct then $3::numeric
               when kind = 'test' then $4::numeric
               when kind = 'topic' then 10
               when kind = 'flashcard' then 1
               when kind = 'mistake_review' and correct then 2
               else 0 end),0)::int as score,
             count(*) filter (where kind in ('question','game'))::int as questions
           from learning_activity
           where user_id=$6 and activity_date between $1::date and $2::date
             and ($5::text = 'all' or subject = $5::text)`,
          [
            range.start,
            range.end,
            settings.leaderboardWeights.correct,
            settings.leaderboardWeights.test,
            safeSubject,
            userId,
          ],
        );
        if (own) {
          currentUser = {
            rank: null,
            userId,
            nickname: profile?.nickname ?? '',
            avatarUrl: profile?.avatar_url ?? null,
            score: Number(own.score),
            questions: Number(own.questions),
            growth: Number(own.score) - (previousScores.get(userId) ?? 0),
            isCurrentUser: true,
          };
        }
      }
    }

    if (hidden && currentUser) currentUser = { ...currentUser, rank: null };
  }

  return {
    period,
    subject: safeSubject,
    range,
    rows,
    currentUser,
    hidden,
    participants: raw.length,
  };
}

export async function snapshotLeaderboard(
  db: Queryable,
  period: LeaderboardPeriod,
  subject: string,
  range: DateRange,
): Promise<number> {
  const settings = await getEdtechSettings(db);
  const rows = await rankedScores(
    db,
    range.start,
    range.end,
    subject,
    5000,
    settings.leaderboardWeights.correct,
    settings.leaderboardWeights.test,
  );
  let saved = 0;
  for (const row of rows) {
    if (!row.leaderboard_visible) continue;
    await db.query(
      `insert into leaderboard_snapshots
        (period, subject, period_start, period_end, user_id, rank, score, questions)
       values ($1,$2,$3::date,$4::date,$5,$6,$7,$8)
       on conflict (period, subject, period_start, user_id) do update set
         period_end = excluded.period_end, rank = excluded.rank,
         score = excluded.score, questions = excluded.questions`,
      [
        period,
        subject,
        range.start,
        range.end,
        row.user_id,
        Number(row.rank),
        Number(row.score),
        Number(row.questions),
      ],
    );
    saved += 1;
  }
  return saved;
}

// ---------------------------------------------------------------------------
// Flashcards
// ---------------------------------------------------------------------------
export interface FlashcardDeckView {
  id: string;
  subject: string;
  grade: number | null;
  title: string;
  description: string;
  cardCount: number;
  dueCount: number;
  masteredCount: number;
}

export async function listDecks(
  db: Queryable,
  userId: string,
  language: Language,
  filters: { subject?: string; grade?: number } = {},
): Promise<FlashcardDeckView[]> {
  const rows = await db.query<{
    id: string;
    subject: string;
    grade: number | null;
    titles: unknown;
    descriptions: unknown;
    card_count: number;
    due_count: number;
    mastered_count: number;
  }>(
    `select d.id, d.subject, d.grade, d.titles, d.descriptions,
       count(c.id) filter (where c.status='published')::int as card_count,
       count(c.id) filter (where c.status='published' and coalesce(p.due_at, now()) <= now())::int as due_count,
       count(c.id) filter (where c.status='published' and coalesce(p.box,0) >= 3)::int as mastered_count
     from flashcard_decks d
     left join flashcards c on c.deck_id = d.id
     left join user_flashcard_progress p on p.flashcard_id = c.id and p.user_id = $1
     where d.status='published'
       and ($2::text = '' or d.subject = $2::text)
       and ($3::int is null or d.grade = $3::int)
     group by d.id
     order by d.position, d.created_at`,
    [userId, filters.subject ?? '', filters.grade ?? null],
  );
  return rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    grade: row.grade === null ? null : Number(row.grade),
    title: pick(toLocalized(row.titles), language),
    description: pick(toLocalized(row.descriptions), language),
    cardCount: Number(row.card_count),
    dueCount: Number(row.due_count),
    masteredCount: Number(row.mastered_count),
  }));
}

export interface FlashcardView {
  id: string;
  front: string;
  back: string;
  explanation: string;
  example: string;
  difficulty: string;
  position: number;
  favorite: boolean;
  box: number;
  dueAt: string | null;
  reviewCount: number;
  lastRating: string | null;
}

export async function deckCards(
  db: Queryable,
  userId: string,
  language: Language,
  deckId: string,
  filters: { dueOnly?: boolean; favorites?: boolean; search?: string } = {},
): Promise<{ deck: FlashcardDeckView; cards: FlashcardView[] }> {
  const [deckRow] = await db.query<{
    id: string;
    subject: string;
    grade: number | null;
    titles: unknown;
    descriptions: unknown;
    card_count: number;
    due_count: number;
    mastered_count: number;
  }>(
    `select d.id, d.subject, d.grade, d.titles, d.descriptions,
       count(c.id) filter (where c.status='published')::int as card_count,
       count(c.id) filter (where c.status='published' and coalesce(p.due_at, now()) <= now())::int as due_count,
       count(c.id) filter (where c.status='published' and coalesce(p.box,0) >= 3)::int as mastered_count
     from flashcard_decks d
     left join flashcards c on c.deck_id = d.id
     left join user_flashcard_progress p on p.flashcard_id = c.id and p.user_id = $2
     where d.id=$1 and d.status='published'
     group by d.id`,
    [deckId, userId],
  );
  if (!deckRow) throw new ApiError(404, 'DECK_NOT_FOUND', 'Flashcard deck not found');

  const rows = await db.query<{
    id: string;
    front: unknown;
    back: unknown;
    explanation: unknown;
    example: unknown;
    difficulty: string;
    position: number;
    box: number | null;
    due_at: string | Date | null;
    review_count: number | null;
    last_rating: string | null;
    favorite: boolean;
  }>(
    `select c.id, c.front, c.back, c.explanation, c.example, c.difficulty, c.position,
            p.box, p.due_at, p.review_count, p.last_rating,
            (f.flashcard_id is not null) as favorite
       from flashcards c
       left join user_flashcard_progress p on p.flashcard_id = c.id and p.user_id = $2
       left join user_flashcard_favorites f on f.flashcard_id = c.id and f.user_id = $2
      where c.deck_id = $1 and c.status='published'
        and ($3::boolean is not true or coalesce(p.due_at, now()) <= now())
        and ($4::boolean is not true or f.flashcard_id is not null)
        and ($5::text = '' or lower(coalesce(c.front->>'uz','')) like '%'||lower($5)||'%'
             or lower(coalesce(c.back->>'uz','')) like '%'||lower($5)||'%')
      order by c.position`,
    [deckId, userId, filters.dueOnly ?? false, filters.favorites ?? false, filters.search ?? ''],
  );

  return {
    deck: {
      id: deckRow.id,
      subject: deckRow.subject,
      grade: deckRow.grade === null ? null : Number(deckRow.grade),
      title: pick(toLocalized(deckRow.titles), language),
      description: pick(toLocalized(deckRow.descriptions), language),
      cardCount: Number(deckRow.card_count),
      dueCount: Number(deckRow.due_count),
      masteredCount: Number(deckRow.mastered_count),
    },
    cards: rows.map((row) => ({
      id: row.id,
      front: pick(toLocalized(row.front), language),
      back: pick(toLocalized(row.back), language),
      explanation: pick(toLocalized(row.explanation), language),
      example: pick(toLocalized(row.example), language),
      difficulty: row.difficulty,
      position: Number(row.position),
      favorite: Boolean(row.favorite),
      box: Number(row.box ?? 0),
      dueAt: row.due_at ? new Date(row.due_at).toISOString() : null,
      reviewCount: Number(row.review_count ?? 0),
      lastRating: row.last_rating,
    })),
  };
}

export async function reviewFlashcard(
  db: Queryable,
  userId: string,
  flashcardId: string,
  rating: FlashcardRating,
): Promise<{ dueAt: string; box: number; intervalDays: number }> {
  const [card] = await db.query<{ id: string; deck_id: string }>(
    'select id, deck_id from flashcards where id=$1 and status=$2',
    [flashcardId, 'published'],
  );
  if (!card) throw new ApiError(404, 'CARD_NOT_FOUND', 'Flashcard not found');
  const settings = await getEdtechSettings(db);
  const intervalDays = settings.intervals[rating];
  const [existing] = await db.query<{ box: number; review_count: number; lapses: number }>(
    'select box, review_count, lapses from user_flashcard_progress where user_id=$1 and flashcard_id=$2',
    [userId, flashcardId],
  );
  const previousBox = Number(existing?.box ?? 0);
  const box =
    rating === 'again' ? 0 : rating === 'hard' ? Math.max(0, previousBox) : Math.min(6, previousBox + 1);
  const dueAt = new Date(Date.now() + intervalDays * DAY_MS).toISOString();

  await db.query(
    `insert into user_flashcard_progress
      (user_id, flashcard_id, box, due_at, last_rating, last_reviewed_at, review_count, correct_count, lapses)
     values ($1,$2,$3,$4,$5,now(),1, case when $6 then 1 else 0 end, case when $6 then 0 else 1 end)
     on conflict (user_id, flashcard_id) do update set
       box = excluded.box, due_at = excluded.due_at, last_rating = excluded.last_rating,
       last_reviewed_at = now(), review_count = user_flashcard_progress.review_count + 1,
       correct_count = user_flashcard_progress.correct_count + case when $6 then 1 else 0 end,
       lapses = user_flashcard_progress.lapses + case when $6 then 0 else 1 end`,
    [userId, flashcardId, box, dueAt, rating, rating !== 'again'],
  );

  await recordActivity(db, userId, [
    {
      kind: 'flashcard',
      subject: 'flashcards',
      topicKey: card.deck_id,
      correct: rating !== 'again',
      sourceType: 'flashcard',
      sourceId: flashcardId,
    },
  ]);

  return { dueAt, box, intervalDays };
}

export async function toggleFavorite(
  db: Queryable,
  userId: string,
  flashcardId: string,
): Promise<{ favorite: boolean }> {
  const removed = await db.query<{ flashcard_id: string }>(
    'delete from user_flashcard_favorites where user_id=$1 and flashcard_id=$2 returning flashcard_id',
    [userId, flashcardId],
  );
  if (removed.length > 0) return { favorite: false };
  await db.query(
    `insert into user_flashcard_favorites (user_id, flashcard_id) values ($1,$2)
     on conflict do nothing`,
    [userId, flashcardId],
  );
  return { favorite: true };
}

export async function flashcardStats(
  db: Queryable,
  userId: string,
): Promise<{ totalCards: number; dueNow: number; mastered: number; favorites: number; reviewed: number }> {
  const [row] = await db.query<Record<string, number>>(
    `select
       (select count(*)::int from flashcards c join flashcard_decks d on d.id=c.deck_id
         where c.status='published' and d.status='published') as total_cards,
       (select count(*)::int from user_flashcard_progress p join flashcards c on c.id=p.flashcard_id
         where p.user_id=$1 and p.due_at <= now()) as due_now,
       (select count(*)::int from user_flashcard_progress where user_id=$1 and box >= 3) as mastered,
       (select count(*)::int from user_flashcard_favorites where user_id=$1) as favorites,
       (select count(*)::int from user_flashcard_progress where user_id=$1 and review_count > 0) as reviewed`,
    [userId],
  );
  return {
    totalCards: Number(row?.total_cards ?? 0),
    dueNow: Number(row?.due_now ?? 0),
    mastered: Number(row?.mastered ?? 0),
    favorites: Number(row?.favorites ?? 0),
    reviewed: Number(row?.reviewed ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Error notebook
// ---------------------------------------------------------------------------
export interface MistakeQuestionSnapshot {
  text: string;
  options: string[];
  correctIndex: number;
  imageUrl?: string | null;
}

export interface MistakeInput {
  source: 'iq' | 'entrance' | 'learning' | 'games';
  sourceQuestionId: string;
  subject: string;
  topicKey?: string;
  topic?: string;
  question: MistakeQuestionSnapshot;
  selectedAnswer?: string | null;
  correctAnswer?: string | null;
  explanation?: string;
  difficulty?: string;
}

/** Upserts wrong answers; a repeated mistake never creates a duplicate row. */
export async function recordMistakes(
  db: Queryable,
  userId: string,
  items: MistakeInput[],
): Promise<void> {
  for (const item of items) {
    await db.query(
      `insert into user_mistakes
        (user_id, source, source_question_id, subject, topic_key, topic, question,
         selected_answer, correct_answer, explanation, difficulty, times_wrong, resolved, last_seen_at)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,1,false,now())
       on conflict (user_id, source, source_question_id) do update set
         selected_answer = excluded.selected_answer,
         correct_answer = excluded.correct_answer,
         explanation = excluded.explanation,
         question = excluded.question,
         topic = case when excluded.topic <> '' then excluded.topic else user_mistakes.topic end,
         times_wrong = user_mistakes.times_wrong + 1,
         resolved = false,
         last_seen_at = now()`,
      [
        userId,
        item.source,
        item.sourceQuestionId,
        item.subject,
        item.topicKey ?? 'general',
        item.topic ?? '',
        JSON.stringify(item.question),
        item.selectedAnswer ?? null,
        item.correctAnswer ?? null,
        item.explanation ?? '',
        item.difficulty ?? 'medium',
      ],
    );
  }
}

export interface MistakeView {
  id: string;
  source: string;
  subject: string;
  topic: string;
  question: MistakeQuestionSnapshot;
  selectedAnswer: string | null;
  correctAnswer: string | null;
  explanation: string;
  difficulty: string;
  timesWrong: number;
  timesCorrect: number;
  resolved: boolean;
  lastSeenAt: string;
}

export async function listMistakes(
  db: Queryable,
  userId: string,
  filters: {
    subject?: string;
    resolved?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ mistakes: MistakeView[]; total: number; open: number }> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  const rows = await db.query<{
    id: string;
    source: string;
    subject: string;
    topic: string;
    question: MistakeQuestionSnapshot;
    selected_answer: string | null;
    correct_answer: string | null;
    explanation: string;
    difficulty: string;
    times_wrong: number;
    times_correct: number;
    resolved: boolean;
    last_seen_at: string | Date;
    total: string | number;
  }>(
    `select m.id, m.source, m.subject, m.topic, m.question, m.selected_answer, m.correct_answer,
            m.explanation, m.difficulty, m.times_wrong, m.times_correct, m.resolved, m.last_seen_at,
            count(*) over () as total
       from user_mistakes m
      where m.user_id=$1
        and ($2::text = '' or m.subject=$2::text)
        and ($3::boolean is null or m.resolved=$3::boolean)
        and ($4::text = '' or lower(m.topic) like '%'||lower($4)||'%'
             or lower(coalesce(m.question->>'text','')) like '%'||lower($4)||'%')
      order by m.resolved asc, m.times_wrong desc, m.last_seen_at desc
      limit $5 offset $6`,
    [userId, filters.subject ?? '', filters.resolved ?? null, filters.search ?? '', limit, offset],
  );
  const [openRow] = await db.query<{ open: number }>(
    'select count(*)::int as open from user_mistakes where user_id=$1 and resolved=false',
    [userId],
  );
  return {
    mistakes: rows.map((row) => ({
      id: row.id,
      source: row.source,
      subject: row.subject,
      topic: row.topic,
      question: row.question,
      selectedAnswer: row.selected_answer,
      correctAnswer: row.correct_answer,
      explanation: row.explanation,
      difficulty: row.difficulty,
      timesWrong: Number(row.times_wrong),
      timesCorrect: Number(row.times_correct),
      resolved: Boolean(row.resolved),
      lastSeenAt: new Date(row.last_seen_at).toISOString(),
    })),
    total: rows.length > 0 ? Number(rows[0].total) : 0,
    open: Number(openRow?.open ?? 0),
  };
}

export async function reviewMistake(
  db: Queryable,
  userId: string,
  mistakeId: string,
  selectedIndex: number,
): Promise<{
  correct: boolean;
  correctIndex: number;
  explanation: string;
  resolved: boolean;
}> {
  const [row] = await db.query<{
    id: string;
    subject: string;
    topic_key: string;
    topic: string;
    question: MistakeQuestionSnapshot;
    explanation: string;
  }>(
    'select id, subject, topic_key, topic, question, explanation from user_mistakes where id=$1 and user_id=$2',
    [mistakeId, userId],
  );
  if (!row) throw new ApiError(404, 'MISTAKE_NOT_FOUND', 'Mistake not found');
  const correctIndex = Number(row.question.correctIndex);
  const correct = Number(selectedIndex) === correctIndex;

  await db.query(
    `update user_mistakes set
       times_correct = times_correct + case when $3 then 1 else 0 end,
       times_wrong = times_wrong + case when $3 then 0 else 1 end,
       resolved = $3,
       last_seen_at = now()
     where id=$1 and user_id=$2`,
    [mistakeId, userId, correct],
  );
  await db.query(
    `insert into mistake_review_history (mistake_id, user_id, correct) values ($1,$2,$3)`,
    [mistakeId, userId, correct],
  );
  await recordActivity(db, userId, [
    {
      kind: 'mistake_review',
      subject: row.subject,
      topicKey: row.topic_key,
      topic: row.topic,
      correct,
      sourceType: 'mistake',
      sourceId: mistakeId,
    },
  ]);

  return { correct, correctIndex, explanation: row.explanation, resolved: correct };
}

export interface WeaknessAnalysis {
  subjects: Array<{ subject: string; wrong: number; reviewed: number; accuracy: number }>;
  topics: Array<{ subject: string; topic: string; wrong: number; repeated: number }>;
  topQuestions: Array<{ id: string; subject: string; topic: string; text: string; timesWrong: number }>;
  weakestSubject: string | null;
  weakestTopic: string | null;
  advice: { uz: string; ru: string; en: string } | null;
}

export async function mistakeAnalysis(
  db: Queryable,
  userId: string,
): Promise<WeaknessAnalysis> {
  const subjectRows = await db.query<{
    subject: string;
    wrong: number;
    reviewed: number;
    correct: number;
    total: number;
  }>(
    `select m.subject,
       sum(m.times_wrong)::int as wrong,
       sum(m.times_correct)::int as reviewed,
       coalesce(sum(a.correct_count),0)::int as correct,
       coalesce(sum(a.total_count),0)::int as total
     from user_mistakes m
     left join learning_analytics a on a.user_id=m.user_id and a.subject=m.subject
     where m.user_id=$1
     group by m.subject
     order by wrong desc`,
    [userId],
  );
  const topicRows = await db.query<{ subject: string; topic: string; wrong: number; repeated: number }>(
    `select subject, topic, sum(times_wrong)::int as wrong,
            count(*) filter (where times_wrong > 1)::int as repeated
       from user_mistakes where user_id=$1 and topic <> ''
      group by subject, topic order by wrong desc limit 20`,
    [userId],
  );
  const topRows = await db.query<{
    id: string;
    subject: string;
    topic: string;
    question: MistakeQuestionSnapshot;
    times_wrong: number;
  }>(
    `select id, subject, topic, question, times_wrong from user_mistakes
      where user_id=$1 order by times_wrong desc, last_seen_at desc limit 10`,
    [userId],
  );

  const subjects = subjectRows.map((row) => ({
    subject: row.subject,
    wrong: Number(row.wrong),
    reviewed: Number(row.reviewed),
    accuracy:
      Number(row.total) > 0 ? Math.round((Number(row.correct) / Number(row.total)) * 100) : 0,
  }));
  const topics = topicRows.map((row) => ({
    subject: row.subject,
    topic: row.topic,
    wrong: Number(row.wrong),
    repeated: Number(row.repeated),
  }));
  const weakestSubject = subjects[0]?.subject ?? null;
  const weakestTopic = topics[0]?.topic ?? null;
  const weakestCount = topics[0]?.wrong ?? 0;
  const advice =
    weakestTopic && weakestCount > 0
      ? {
          uz: `“${weakestTopic}” mavzusida ${weakestCount} ta xato qayd etilgan. Shu mavzudan qo‘shimcha mashq bajarishni tavsiya qilamiz.`,
          ru: `По теме «${weakestTopic}» зафиксировано ошибок: ${weakestCount}. Рекомендуем выполнить дополнительные задания по этой теме.`,
          en: `You have ${weakestCount} recorded mistakes in “${weakestTopic}”. We recommend extra practice on this topic.`,
        }
      : null;

  return {
    subjects,
    topics,
    topQuestions: topRows.map((row) => ({
      id: row.id,
      subject: row.subject,
      topic: row.topic,
      text: row.question?.text ?? '',
      timesWrong: Number(row.times_wrong),
    })),
    weakestSubject,
    weakestTopic,
    advice,
  };
}

// ---------------------------------------------------------------------------
// Learning map
// ---------------------------------------------------------------------------
export interface LearningMapTopic {
  topicKey: string;
  topic: string;
  status: string;
  attempts: number;
  correct: number;
  total: number;
  accuracy: number;
  lastActivityAt: string;
}

export interface LearningMapSubject {
  subject: string;
  mastered: number;
  needsReview: number;
  inProgress: number;
  accuracy: number;
  topics: LearningMapTopic[];
}

export async function getLearningMap(
  db: Queryable,
  userId: string,
): Promise<{ subjects: LearningMapSubject[] }> {
  const rows = await db.query<{
    subject: string;
    topic_key: string;
    topic: string;
    status: string;
    attempts: number;
    correct_count: number;
    total_count: number;
    last_activity_at: string | Date;
  }>(
    `select subject, topic_key, topic, status, attempts, correct_count, total_count, last_activity_at
       from learning_analytics where user_id=$1 order by subject, topic`,
    [userId],
  );
  const grouped = new Map<string, LearningMapSubject>();
  for (const row of rows) {
    const subject = row.subject;
    const entry = grouped.get(subject) ?? {
      subject,
      mastered: 0,
      needsReview: 0,
      inProgress: 0,
      accuracy: 0,
      topics: [],
    };
    const correct = Number(row.correct_count);
    const total = Number(row.total_count);
    entry.topics.push({
      topicKey: row.topic_key,
      topic: row.topic || row.topic_key,
      status: row.status,
      attempts: Number(row.attempts),
      correct,
      total,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
      lastActivityAt: new Date(row.last_activity_at).toISOString(),
    });
    if (row.status === 'mastered') entry.mastered += 1;
    else if (row.status === 'needs_review') entry.needsReview += 1;
    else entry.inProgress += 1;
    grouped.set(subject, entry);
  }
  const subjects = [...grouped.values()].map((entry) => {
    const correct = entry.topics.reduce((sum, topic) => sum + topic.correct, 0);
    const total = entry.topics.reduce((sum, topic) => sum + topic.total, 0);
    return {
      ...entry,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
    };
  });
  return { subjects };
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------
export interface Recommendation {
  key: string;
  kind: string;
  refId: string;
  title: string;
  reason: string;
  href: string;
  tone: 'primary' | 'gold' | 'danger';
}

export async function getRecommendations(
  db: Queryable,
  userId: string,
  language: Language,
): Promise<Recommendation[]> {
  const recommendations: Recommendation[] = [];
  const analysis = await mistakeAnalysis(db, userId);
  const map = await getLearningMap(db, userId);
  const stats = await flashcardStats(db, userId);
  const missions = await getMissions(db, userId, language);

  for (const topic of analysis.topics.slice(0, 2)) {
    recommendations.push({
      key: `mistake-${topic.subject}-${topic.topic}`,
      kind: 'mistake_topic',
      refId: `${topic.subject}:${topic.topic}`,
      title: pick(
        {
          uz: `“${topic.topic}” mavzusini mustahkamlang`,
          ru: `Закрепите тему «${topic.topic}»`,
          en: `Strengthen “${topic.topic}”`,
        },
        language,
      ),
      reason: pick(
        {
          uz: `Bu mavzuda ${topic.wrong} ta xato qayd etilgan.`,
          ru: `По этой теме зафиксировано ошибок: ${topic.wrong}.`,
          en: `${topic.wrong} mistakes recorded in this topic.`,
        },
        language,
      ),
      href: '/mistakes',
      tone: 'danger',
    });
  }

  const reviewTopic = map.subjects
    .flatMap((subject) => subject.topics.map((topic) => ({ ...topic, subject: subject.subject })))
    .filter((topic) => topic.status === 'needs_review')
    .sort((a, b) => a.accuracy - b.accuracy)[0];
  if (reviewTopic) {
    recommendations.push({
      key: `review-${reviewTopic.subject}-${reviewTopic.topicKey}`,
      kind: 'review_topic',
      refId: `${reviewTopic.subject}:${reviewTopic.topicKey}`,
      title: pick(
        {
          uz: `“${reviewTopic.topic}” mavzusini qayta ko‘rib chiqing`,
          ru: `Повторите тему «${reviewTopic.topic}»`,
          en: `Review “${reviewTopic.topic}”`,
        },
        language,
      ),
      reason: pick(
        {
          uz: `O‘zlashtirish ${reviewTopic.accuracy}% — qayta o‘rganish tavsiya etiladi.`,
          ru: `Освоение ${reviewTopic.accuracy}% — рекомендуется повторить.`,
          en: `Mastery is ${reviewTopic.accuracy}% — review recommended.`,
        },
        language,
      ),
      href: '/progress',
      tone: 'gold',
    });
  }

  if (stats.dueNow > 0) {
    recommendations.push({
      key: 'flashcards-due',
      kind: 'flashcards',
      refId: 'due',
      title: pick(
        {
          uz: `${stats.dueNow} ta kartani takrorlash vaqti keldi`,
          ru: `Пора повторить карточек: ${stats.dueNow}`,
          en: `${stats.dueNow} flashcards are due`,
        },
        language,
      ),
      reason: pick(
        {
          uz: 'Spaced repetition jadvali bo‘yicha takrorlash vaqti keldi.',
          ru: 'По расписанию интервального повторения пора повторить.',
          en: 'The spaced-repetition schedule says these cards are due.',
        },
        language,
      ),
      href: '/flashcards',
      tone: 'primary',
    });
  }

  if (missions.completed < missions.total) {
    recommendations.push({
      key: 'missions-open',
      kind: 'mission',
      refId: missions.date,
      title: pick(
        {
          uz: 'Bugungi vazifalarni yakunlang',
          ru: 'Завершите задания на сегодня',
          en: 'Finish today’s missions',
        },
        language,
      ),
      reason: pick(
        {
          uz: `${missions.total - missions.completed} ta vazifa qoldi.`,
          ru: `Осталось заданий: ${missions.total - missions.completed}.`,
          en: `${missions.total - missions.completed} missions left.`,
        },
        language,
      ),
      href: '/missions',
      tone: 'primary',
    });
  }

  const nextTopic = map.subjects
    .flatMap((subject) => subject.topics.map((topic) => ({ ...topic, subject: subject.subject })))
    .filter((topic) => topic.status === 'in_progress')
    .sort((a, b) => b.accuracy - a.accuracy)[0];
  if (nextTopic) {
    recommendations.push({
      key: `next-${nextTopic.subject}-${nextTopic.topicKey}`,
      kind: 'next_topic',
      refId: `${nextTopic.subject}:${nextTopic.topicKey}`,
      title: pick(
        {
          uz: `Keyingi qadam: “${nextTopic.topic}”`,
          ru: `Следующий шаг: «${nextTopic.topic}»`,
          en: `Next step: “${nextTopic.topic}”`,
        },
        language,
      ),
      reason: pick(
        {
          uz: `Hozirgi o‘zlashtirish ${nextTopic.accuracy}%.`,
          ru: `Текущее освоение ${nextTopic.accuracy}%.`,
          en: `Current mastery ${nextTopic.accuracy}%.`,
        },
        language,
      ),
      href: '/subjects',
      tone: 'primary',
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      key: 'start',
      kind: 'start',
      refId: 'first-test',
      title: pick(
        {
          uz: 'Birinchi testingizni boshlang',
          ru: 'Начните свой первый тест',
          en: 'Start your first test',
        },
        language,
      ),
      reason: pick(
        {
          uz: 'Haqiqiy natijalar asosida tavsiyalar shakllanishi uchun test yeching.',
          ru: 'Пройдите тест, чтобы получить рекомендации по реальным результатам.',
          en: 'Take a test so recommendations can be based on real results.',
        },
        language,
      ),
      href: '/iq',
      tone: 'primary',
    });
  }

  for (const recommendation of recommendations) {
    const [existing] = await db.query<{ id: string }>(
      `select id from recommendation_history
        where user_id=$1 and kind=$2 and coalesce(ref_id,'')=$3 and created_at >= $4::date limit 1`,
      [userId, recommendation.kind, recommendation.refId, localDate()],
    );
    if (!existing) {
      await db.query(
        `insert into recommendation_history (user_id, kind, ref_id, title, reason, href)
         values ($1,$2,$3,$4::jsonb,$5::jsonb,$6)`,
        [
          userId,
          recommendation.kind,
          recommendation.refId,
          JSON.stringify({ [language]: recommendation.title }),
          JSON.stringify({ [language]: recommendation.reason }),
          recommendation.href,
        ],
      );
    }
  }

  return recommendations.slice(0, 6);
}

// ---------------------------------------------------------------------------
// Weekly report
// ---------------------------------------------------------------------------
export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  daysActive: number;
  questions: number;
  correct: number;
  accuracy: number;
  topicsLearned: number;
  mistakes: number;
  mistakesReviewed: number;
  flashcards: number;
  rank: number | null;
  previousRank: number | null;
  rankChange: number | null;
  score: number;
  previousScore: number;
  growth: number;
  subjects: Array<{ subject: string; correct: number; total: number; accuracy: number }>;
  daily: Array<{ date: string; questions: number; correct: number }>;
}

export async function buildWeeklyReport(
  db: Queryable,
  userId: string,
  week?: string,
  language: Language = 'uz',
): Promise<WeeklyReport> {
  const today = localDate();
  const start = weekStart(week ?? today);
  const end = addDays(start, 6);
  const previousStart = addDays(start, -7);
  const previousEnd = addDays(start, -1);

  const [current] = await db.query<Record<string, number>>(
    `select
       count(distinct activity_date)::int as days_active,
       count(*) filter (where kind in ('question','game'))::int as questions,
       count(*) filter (where kind in ('question','game') and correct)::int as correct,
       count(distinct topic_key) filter (where kind='topic')::int as topics_learned,
       count(*) filter (where kind='flashcard')::int as flashcards,
       coalesce(sum(case when kind in ('question','game') and correct then 1 when kind='test' then 5
         when kind='topic' then 10 when kind='flashcard' then 1 when kind='mistake_review' and correct then 2 else 0 end),0)::int as score
     from learning_activity where user_id=$1 and activity_date between $2::date and $3::date`,
    [userId, start, end],
  );
  const [previous] = await db.query<Record<string, number>>(
    `select coalesce(sum(case when kind in ('question','game') and correct then 1 when kind='test' then 5
       when kind='topic' then 10 when kind='flashcard' then 1 when kind='mistake_review' and correct then 2 else 0 end),0)::int as score
     from learning_activity where user_id=$1 and activity_date between $2::date and $3::date`,
    [userId, previousStart, previousEnd],
  );
  const [mistakeCounts] = await db.query<{ created: number; reviewed: number }>(
    `select
       (select count(*)::int from user_mistakes where user_id=$1 and first_seen_at::date between $2::date and $3::date) as created,
       (select count(*)::int from mistake_review_history where user_id=$1 and answered_at::date between $2::date and $3::date) as reviewed`,
    [userId, start, end],
  );
  const subjectRows = await db.query<{ subject: string; correct: number; total: number }>(
    `select subject,
       count(*) filter (where correct)::int as correct,
       count(*) filter (where correct is not null)::int as total
     from learning_activity
     where user_id=$1 and activity_date between $2::date and $3::date and kind in ('question','game')
     group by subject order by total desc`,
    [userId, start, end],
  );
  const dailyRows = await db.query<{ date: string; questions: number; correct: number }>(
    `select activity_date::text as date,
       count(*) filter (where kind in ('question','game'))::int as questions,
       count(*) filter (where kind in ('question','game') and correct)::int as correct
     from learning_activity
     where user_id=$1 and activity_date between $2::date and $3::date
     group by activity_date order by activity_date`,
    [userId, start, end],
  );

  const [visible] = await db.query<{ leaderboard_visible: boolean }>(
    'select leaderboard_visible from profiles where id=$1',
    [userId],
  );
  const currentBoard = await computeLeaderboard(db, 'weekly', 'all', 5000, userId);
  let rank: number | null = null;
  let previousRank: number | null = null;
  if (visible?.leaderboard_visible && currentBoard.currentUser?.rank) {
    rank = currentBoard.currentUser.rank;
  }
  const previousBoard = await computeLeaderboard(db, 'weekly', 'all', 5000, userId, previousEnd);
  if (visible?.leaderboard_visible && previousBoard.currentUser?.rank) {
    previousRank = previousBoard.currentUser.rank;
  }

  const questions = Number(current?.questions ?? 0);
  const correct = Number(current?.correct ?? 0);
  const score = Number(current?.score ?? 0);
  const previousScore = Number(previous?.score ?? 0);
  const report: WeeklyReport = {
    weekStart: start,
    weekEnd: end,
    daysActive: Number(current?.days_active ?? 0),
    questions,
    correct,
    accuracy: questions > 0 ? Math.round((correct / questions) * 100) : 0,
    topicsLearned: Number(current?.topics_learned ?? 0),
    mistakes: Number(mistakeCounts?.created ?? 0),
    mistakesReviewed: Number(mistakeCounts?.reviewed ?? 0),
    flashcards: Number(current?.flashcards ?? 0),
    rank,
    previousRank,
    rankChange: rank !== null && previousRank !== null ? previousRank - rank : null,
    score,
    previousScore,
    growth: previousScore > 0 ? Math.round(((score - previousScore) / previousScore) * 100) : score > 0 ? 100 : 0,
    subjects: subjectRows.map((row) => ({
      subject: row.subject,
      correct: Number(row.correct),
      total: Number(row.total),
      accuracy:
        Number(row.total) > 0 ? Math.round((Number(row.correct) / Number(row.total)) * 100) : 0,
    })),
    daily: dailyRows.map((row) => ({
      date: asDateString(row.date),
      questions: Number(row.questions),
      correct: Number(row.correct),
    })),
  };

  const payload = { ...report, language };
  await db.query(
    `insert into weekly_reports (user_id, week_start, week_end, payload)
     values ($1,$2::date,$3::date,$4::jsonb)
     on conflict (user_id, week_start) do update set payload = excluded.payload, week_end = excluded.week_end`,
    [userId, start, end, JSON.stringify(payload)],
  );
  return report;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export async function getDashboard(
  db: Db,
  userId: string,
  language: Language,
): Promise<{
  streak: StreakInfo;
  missions: { date: string; missions: MissionView[]; completed: number; total: number };
  achievements: { unlocked: number; total: number; recent: AchievementView[] };
  leaderboard: LeaderboardResult;
  flashcards: { totalCards: number; dueNow: number; mastered: number; favorites: number; reviewed: number };
  mistakes: { open: number; total: number; weakestTopic: string | null };
  recommendations: Recommendation[];
  map: { subjects: LearningMapSubject[] };
  weeklyReport: WeeklyReport;
  activityTotals: { questions: number; correct: number; tests: number };
}> {
  const missions = await getMissions(db, userId, language);
  const streak = await getStreak(db, userId);
  const achievements = await getAchievements(db, userId, language);
  const leaderboard = await computeLeaderboard(db, 'weekly', 'all', 20, userId);
  const flashcards = await flashcardStats(db, userId);
  const mistakes = await listMistakes(db, userId, { limit: 1 });
  const analysis = await mistakeAnalysis(db, userId);
  const recommendations = await getRecommendations(db, userId, language);
  const map = await getLearningMap(db, userId);
  const weeklyReport = await buildWeeklyReport(db, userId, undefined, language);
  const [totals] = await db.query<Record<string, number>>(
    `select
       count(*) filter (where kind in ('question','game'))::int as questions,
       count(*) filter (where kind in ('question','game') and correct)::int as correct,
       count(*) filter (where kind='test')::int as tests
     from learning_activity where user_id=$1`,
    [userId],
  );

  return {
    streak,
    missions,
    achievements: {
      unlocked: achievements.unlocked,
      total: achievements.total,
      recent: achievements.achievements
        .filter((achievement) => achievement.unlocked)
        .sort((a, b) => (b.awardedAt ?? '').localeCompare(a.awardedAt ?? ''))
        .slice(0, 4),
    },
    leaderboard,
    flashcards,
    mistakes: {
      open: mistakes.open,
      total: mistakes.total,
      weakestTopic: analysis.weakestTopic,
    },
    recommendations,
    map,
    weeklyReport,
    activityTotals: {
      questions: Number(totals?.questions ?? 0),
      correct: Number(totals?.correct ?? 0),
      tests: Number(totals?.tests ?? 0),
    },
  };
}
