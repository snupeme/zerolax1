import type { AppConfig } from '../config';
import {
  awardAchievements,
  creditCoins,
  type Db,
  type Queryable,
  type ProfileRow,
} from '@zerolax/db';
import {
  percentage,
  tashkentDateString,
  type EntranceAttemptSummary,
  type EntranceHistoryItem,
  type EntranceResultResponse,
  type EntranceSessionResponse,
  type EntranceTestSummary,
  type QuestionPublic,
  type Difficulty,
} from '@zerolax/shared';
import { ApiError } from '../errors';
import { getPlatformSettings } from './admin-control';
import {
  mapPublicQuestions,
  mapResultQuestions,
  toIso,
  type OptionTextRow,
  type QuestionTextRow,
} from '../serializers';
import { localizeText } from '../localize';
import { recordEntranceSubmission } from './edtech-recording';

interface EntranceTestRow {
  id: string;
  slug: string;
  title_uz: string;
  title_ru: string;
  title_en: string;
  description_uz: string | null;
  description_ru: string | null;
  description_en: string | null;
  subject: string;
  difficulty: Difficulty;
  duration_seconds: number;
  status: 'draft' | 'published' | 'archived';
  published_at: string | Date | null;
  question_count: number;
}

interface EntranceAttemptRow {
  id: string;
  user_id: string;
  test_id: string;
  attempt_date: string;
  status: 'in_progress' | 'submitted' | 'expired';
  started_at: string | Date;
  expires_at: string | Date;
  submitted_at: string | Date | null;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;
  total_questions: number;
  score_percent: number | string;
  coins_earned: number;
  reward_status: 'pending' | 'credited';
}

const TEST_SELECT = `
  select t.id, t.slug, t.title_uz, t.title_ru, t.title_en,
         t.description_uz, t.description_ru, t.description_en,
         t.subject, t.difficulty, t.duration_seconds, t.status, t.published_at,
         (select count(*) from entrance_questions q where q.test_id = t.id)::int as question_count
    from entrance_tests t
`;

const ATTEMPT_COLUMNS = `
  id, user_id, test_id, attempt_date::text as attempt_date, status,
  started_at, expires_at, submitted_at, correct_count, incorrect_count, unanswered_count,
  total_questions, score_percent, coins_earned, reward_status
`;

function mapTest(row: EntranceTestRow): EntranceTestSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title_uz,
    description: row.description_uz,
    subject: row.subject,
    difficulty: row.difficulty,
    durationSeconds: Number(row.duration_seconds),
    questionCount: Number(row.question_count),
    status: row.status,
  };
}

function mapTestLocalized(row: EntranceTestRow, language: ProfileRow['language']): EntranceTestSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: localizeText(row as unknown as Record<string, unknown>, 'title', language),
    description:
      localizeText(row as unknown as Record<string, unknown>, 'description', language) || null,
    subject: row.subject,
    difficulty: row.difficulty,
    durationSeconds: Number(row.duration_seconds),
    questionCount: Number(row.question_count),
    status: row.status,
  };
}

async function getTest(db: Queryable, testId: string): Promise<EntranceTestRow | null> {
  const rows = await db.query<EntranceTestRow>(`${TEST_SELECT} where t.id = $1`, [testId]);
  return rows[0] ?? null;
}

async function getAttemptForDay(
  db: Queryable,
  userId: string,
  attemptDate: string,
): Promise<EntranceAttemptRow | null> {
  const rows = await db.query<EntranceAttemptRow>(
    `select ${ATTEMPT_COLUMNS} from entrance_attempts where user_id = $1 and attempt_date = $2`,
    [userId, attemptDate],
  );
  return rows[0] ?? null;
}

async function getAttemptById(
  db: Queryable,
  attemptId: string,
): Promise<EntranceAttemptRow | null> {
  const rows = await db.query<EntranceAttemptRow>(
    `select ${ATTEMPT_COLUMNS} from entrance_attempts where id = $1`,
    [attemptId],
  );
  return rows[0] ?? null;
}

async function getAnswers(db: Queryable, attemptId: string): Promise<Map<string, string>> {
  const rows = await db.query<{ question_id: string; selected_option_id: string }>(
    'select question_id, selected_option_id from entrance_user_answers where attempt_id = $1',
    [attemptId],
  );
  return new Map(rows.map((row) => [row.question_id, row.selected_option_id]));
}

async function getQuestions(
  db: Queryable,
  testId: string,
): Promise<{ questions: QuestionTextRow[]; options: OptionTextRow[] }> {
  const questions = await db.query<QuestionTextRow>(
    `select id, position, text_uz, text_ru, text_en, image_url,
            explanation_uz, explanation_ru, explanation_en, coins, correct_option_index
       from entrance_questions where test_id = $1 order by position`,
    [testId],
  );
  const options = await db.query<OptionTextRow>(
    `select o.id, o.question_id, o.position, o.text_uz, o.text_ru, o.text_en
       from entrance_question_options o
       join entrance_questions q on q.id = o.question_id
      where q.test_id = $1
      order by o.question_id, o.position`,
    [testId],
  );
  return { questions, options };
}

function remainingSeconds(attempt: EntranceAttemptRow, now = new Date()): number {
  return Math.max(0, Math.floor((new Date(attempt.expires_at).getTime() - now.getTime()) / 1000));
}

function mapAttemptSummary(
  attempt: EntranceAttemptRow,
  answers: Map<string, string>,
  language: ProfileRow['language'],
): EntranceAttemptSummary {
  const done = attempt.status !== 'in_progress';
  return {
    id: attempt.id,
    testId: attempt.test_id,
    status: attempt.status,
    attemptDate: attempt.attempt_date,
    startedAt: toIso(attempt.started_at) ?? new Date().toISOString(),
    expiresAt: toIso(attempt.expires_at) ?? new Date().toISOString(),
    submittedAt: toIso(attempt.submitted_at),
    remainingSeconds: remainingSeconds(attempt),
    answers: Object.fromEntries(answers),
    totalQuestions: Number(attempt.total_questions),
    correctCount: done ? Number(attempt.correct_count) : null,
    scorePercent: done ? Number(attempt.score_percent) : null,
    coinsEarned: done ? Number(attempt.coins_earned) : null,
  };
}

export async function listEntranceTests(
  db: Db,
  profile: ProfileRow,
): Promise<{
  tests: EntranceTestSummary[];
  todayAttempt: {
    attemptId: string;
    testId: string;
    status: EntranceAttemptRow['status'];
    remainingSeconds: number;
  } | null;
  serverTime: string;
}> {
  const tests = await db.query<EntranceTestRow>(
    `${TEST_SELECT} where t.status = 'published' order by t.published_at desc nulls last, t.created_at desc`,
  );

  const today = tashkentDateString();
  let todayAttempt = await getAttemptForDay(db, profile.id, today);
  if (todayAttempt && todayAttempt.status === 'in_progress' && remainingSeconds(todayAttempt) <= 0) {
    await finalizeAttempt(db, profile.id, todayAttempt.id);
    todayAttempt = await getAttemptForDay(db, profile.id, today);
  }

  return {
    tests: tests.map((test) => mapTestLocalized(test, profile.language)),
    todayAttempt: todayAttempt
      ? {
          attemptId: todayAttempt.id,
          testId: todayAttempt.test_id,
          status: todayAttempt.status,
          remainingSeconds: remainingSeconds(todayAttempt),
        }
      : null,
    serverTime: new Date().toISOString(),
  };
}

async function buildSession(
  db: Queryable,
  profile: ProfileRow,
  test: EntranceTestRow,
  attempt: EntranceAttemptRow,
): Promise<EntranceSessionResponse> {
  const { questions, options } = await getQuestions(db, test.id);
  const answers = await getAnswers(db, attempt.id);
  return {
    test: mapTestLocalized(test, profile.language),
    attempt: mapAttemptSummary(attempt, answers, profile.language),
    questions: mapPublicQuestions(questions, options, profile.language),
    serverTime: new Date().toISOString(),
  };
}

export async function startEntranceTest(
  db: Db,
  config: AppConfig,
  profile: ProfileRow,
  testId: string,
): Promise<EntranceSessionResponse> {
  const test = await getTest(db, testId);
  if (!test || test.status !== 'published') {
    throw new ApiError(409, 'TEST_NOT_AVAILABLE', 'This test is not available');
  }

  const today = tashkentDateString();
  const existing = await getAttemptForDay(db, profile.id, today);
  if (existing) {
    if (existing.status === 'in_progress' && remainingSeconds(existing) > 0) {
      if (existing.test_id !== testId) {
        throw new ApiError(409, 'DAILY_LIMIT', 'You already have an active attempt today', {
          attemptId: existing.id,
          testId: existing.test_id,
        });
      }
      return buildSession(db, profile, test, existing);
    }

    if (existing.status === 'in_progress') {
      await finalizeAttempt(db, profile.id, existing.id);
      throw new ApiError(409, 'DAILY_LIMIT', 'Your attempt has expired', {
        attemptId: existing.id,
        status: 'expired',
      });
    }

    throw new ApiError(409, 'DAILY_LIMIT', 'You have already completed a test today', {
      attemptId: existing.id,
      status: existing.status,
    });
  }

  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + Number(test.duration_seconds) * 1000);

  try {
    await db.query(
      `insert into entrance_attempts
        (user_id, test_id, attempt_date, started_at, expires_at, total_questions)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        profile.id,
        test.id,
        today,
        startedAt.toISOString(),
        expiresAt.toISOString(),
        Number(test.question_count),
      ],
    );
  } catch (error) {
    // Unique (user_id, attempt_date) — a concurrent request already created today's attempt.
    if (isUniqueViolation(error)) {
      const raced = await getAttemptForDay(db, profile.id, today);
      if (raced && raced.status === 'in_progress' && remainingSeconds(raced) > 0) {
        return buildSession(db, profile, test, raced);
      }
      if (raced) {
        throw new ApiError(409, 'DAILY_LIMIT', 'You have already started a test today', {
          attemptId: raced.id,
          status: raced.status,
        });
      }
    }
    throw error;
  }

  const attempt = await getAttemptForDay(db, profile.id, today);
  if (!attempt) throw new ApiError(500, 'ATTEMPT_CREATE_FAILED', 'Could not start the attempt');
  void config;
  return buildSession(db, profile, test, attempt);
}

export async function getEntranceSession(
  db: Db,
  profile: ProfileRow,
  testId: string,
): Promise<EntranceSessionResponse> {
  const test = await getTest(db, testId);
  if (!test || test.status !== 'published') {
    throw new ApiError(409, 'TEST_NOT_AVAILABLE', 'This test is not available');
  }

  const today = tashkentDateString();
  const attempt = await getAttemptForDay(db, profile.id, today);
  if (!attempt || attempt.test_id !== testId) {
    throw new ApiError(404, 'ATTEMPT_NOT_FOUND', 'No active attempt for this test');
  }
  if (attempt.status !== 'in_progress') {
    throw new ApiError(409, 'ALREADY_SUBMITTED', 'This attempt is already completed', {
      attemptId: attempt.id,
    });
  }
  if (remainingSeconds(attempt) <= 0) {
    await finalizeAttempt(db, profile.id, attempt.id);
    throw new ApiError(409, 'ATTEMPT_EXPIRED', 'The test time has expired', {
      attemptId: attempt.id,
    });
  }

  return buildSession(db, profile, test, attempt);
}

export async function saveEntranceAnswer(
  db: Db,
  profile: ProfileRow,
  attemptId: string,
  questionId: string,
  optionId: string,
): Promise<{ saved: boolean; answeredCount: number }> {
  const attempt = await getAttemptById(db, attemptId);
  if (!attempt || attempt.user_id !== profile.id) {
    throw new ApiError(404, 'ATTEMPT_NOT_FOUND', 'Attempt not found');
  }
  if (attempt.status !== 'in_progress') {
    throw new ApiError(409, 'ALREADY_SUBMITTED', 'This attempt is already completed', {
      attemptId: attempt.id,
    });
  }
  if (remainingSeconds(attempt) <= 0) {
    await finalizeAttempt(db, profile.id, attempt.id);
    throw new ApiError(409, 'ATTEMPT_EXPIRED', 'The test time has expired', {
      attemptId: attempt.id,
    });
  }

  return db.transaction(async (tx) => {
    const valid = await tx.query<{ id: string }>(
      `select o.id
         from entrance_questions q
         join entrance_question_options o on o.question_id = q.id
        where q.id = $1 and q.test_id = $2 and o.id = $3`,
      [questionId, attempt.test_id, optionId],
    );
    if (valid.length === 0) {
      throw new ApiError(400, 'INVALID_ANSWER', 'The selected answer is not valid for this question');
    }

    await tx.query(
      `insert into entrance_user_answers (attempt_id, question_id, selected_option_id)
       values ($1, $2, $3)
       on conflict (attempt_id, question_id) do update
         set selected_option_id = excluded.selected_option_id, answered_at = now()`,
      [attemptId, questionId, optionId],
    );

    const [count] = await tx.query<{ count: number }>(
      'select count(*)::int as count from entrance_user_answers where attempt_id = $1',
      [attemptId],
    );
    return { saved: true, answeredCount: Number(count?.count ?? 0) };
  });
}

interface ScoreRow {
  id: string;
  difficulty: 'easy'|'medium'|'hard';
  coins: number;
  correct_option_id: string;
  selected_option_id: string | null;
}

async function scoreAttempt(
  tx: Queryable,
  attempt: EntranceAttemptRow,
): Promise<{ correct: number; incorrect: number; unanswered: number; coins: number; total: number }> {
  const rows = await tx.query<ScoreRow>(
    `select q.id, q.coins,q.difficulty,
            correct_option.id as correct_option_id,
            a.selected_option_id
       from entrance_questions q
       join entrance_question_options correct_option
         on correct_option.question_id = q.id and correct_option.position = q.correct_option_index
       left join entrance_user_answers a
         on a.attempt_id = $1 and a.question_id = q.id
      where q.test_id = $2
      order by q.position`,
    [attempt.id, attempt.test_id],
  );

  let correct = 0;
  let incorrect = 0;
  let unanswered = 0;
  let coins = 0;
  const rewardSettings=await getPlatformSettings(tx);

  for (const row of rows) {
    if (!row.selected_option_id) {
      unanswered++;
    } else if (row.selected_option_id === row.correct_option_id) {
      correct++;
      coins += !rewardSettings.rewards.enabled?0:rewardSettings.applyDifficultyRewards?rewardSettings.rewards[row.difficulty]:Number(row.coins);
    } else {
      incorrect++;
    }
  }

  const percent = percentage(correct, rows.length);
  await tx.query(
    `update entrance_attempts
        set correct_count = $1, incorrect_count = $2, unanswered_count = $3,
            coins_earned = $4, total_questions = $5, score_percent = $6
      where id = $7`,
    [correct, incorrect, unanswered, coins, rows.length, percent, attempt.id],
  );

  return { correct, incorrect, unanswered, coins, total: rows.length };
}

/**
 * Finalizes an attempt exactly once. Called by submission, expiry checks and the
 * background worker. Coins are credited atomically and idempotently.
 */
export async function finalizeAttempt(
  db: Db,
  userId: string,
  attemptId: string,
): Promise<{ status: 'submitted' | 'expired'; credited: boolean }> {
  const result = await db.transaction(
    async (tx): Promise<{ status: 'submitted' | 'expired'; credited: boolean }> => {
    const attempts = await tx.query<EntranceAttemptRow>(
      `select ${ATTEMPT_COLUMNS} from entrance_attempts
        where id = $1 and user_id = $2 for update`,
      [attemptId, userId],
    );
    const attempt = attempts[0];
    if (!attempt) throw new ApiError(404, 'ATTEMPT_NOT_FOUND', 'Attempt not found');

    if (attempt.status !== 'in_progress') {
      return {
        status: attempt.status as 'submitted' | 'expired',
        credited: attempt.reward_status === 'credited',
      };
    }

    const expired = new Date(attempt.expires_at).getTime() <= Date.now();
    await scoreAttempt(tx, attempt);
    const newStatus: 'submitted' | 'expired' = expired ? 'expired' : 'submitted';

    await tx.query(
      `update entrance_attempts
          set status = $1, submitted_at = now()
        where id = $2`,
      [newStatus, attempt.id],
    );

    const [scored] = await tx.query<{ coins_earned: number }>(
      'select coins_earned from entrance_attempts where id = $1',
      [attempt.id],
    );

    const credit = await creditCoins(tx, {
      userId,
      amount: Number(scored?.coins_earned ?? 0),
      type: 'entrance_reward',
      sourceType: 'entrance_attempt',
      sourceId: attempt.id,
      idempotencyKey: `entrance:${attempt.id}`,
      description: 'University entrance test reward',
    });

    await tx.query(
      `update entrance_attempts set reward_status = 'credited' where id = $1`,
      [attempt.id],
    );

    await awardAchievements(tx, userId);
    await recordEntranceSubmission(tx, userId, attempt.id, attempt.test_id);

    return { status: newStatus, credited: credit.credited };
  });

  return result;
}

export async function submitEntranceAttempt(
  db: Db,
  profile: ProfileRow,
  attemptId: string,
): Promise<{ status: 'submitted' | 'expired'; result: EntranceResultResponse }> {
  await finalizeAttempt(db, profile.id, attemptId);
  return { status: 'submitted', result: await buildResult(db, profile, attemptId) };
}

async function buildResult(
  db: Queryable,
  profile: ProfileRow,
  attemptId: string,
): Promise<EntranceResultResponse> {
  const attempt = await getAttemptById(db, attemptId);
  if (!attempt || attempt.user_id !== profile.id) {
    throw new ApiError(404, 'ATTEMPT_NOT_FOUND', 'Attempt not found');
  }
  if (attempt.status === 'in_progress') {
    throw new ApiError(409, 'ATTEMPT_IN_PROGRESS', 'The attempt is still in progress', {
      attemptId: attempt.id,
      remainingSeconds: remainingSeconds(attempt),
    });
  }

  const test = await getTest(db, attempt.test_id);
  if (!test) throw new ApiError(404, 'TEST_NOT_FOUND', 'Test not found');

  const { questions, options } = await getQuestions(db, test.id);
  const answers = await getAnswers(db, attempt.id);
  const submittedAt = toIso(attempt.submitted_at) ?? new Date().toISOString();
  const timeSpentSeconds = Math.max(
    0,
    Math.min(
      Number(test.duration_seconds),
      Math.floor(
        (new Date(submittedAt).getTime() - new Date(attempt.started_at).getTime()) / 1000,
      ),
    ),
  );

  return {
    attemptId: attempt.id,
    test: mapTestLocalized(test, profile.language),
    status: attempt.status,
    attemptDate: attempt.attempt_date,
    startedAt: toIso(attempt.started_at) ?? new Date().toISOString(),
    submittedAt,
    timeSpentSeconds,
    totalCorrect: Number(attempt.correct_count),
    totalIncorrect: Number(attempt.incorrect_count),
    unanswered: Number(attempt.unanswered_count),
    totalQuestions: Number(attempt.total_questions),
    percent: Number(attempt.score_percent),
    coinsEarned: Number(attempt.coins_earned),
    questions: mapResultQuestions(questions, options, answers, profile.language),
  };
}

export async function getEntranceResult(
  db: Db,
  profile: ProfileRow,
  attemptId: string,
): Promise<EntranceResultResponse> {
  const attempt = await getAttemptById(db, attemptId);
  if (!attempt || attempt.user_id !== profile.id) {
    throw new ApiError(404, 'ATTEMPT_NOT_FOUND', 'Attempt not found');
  }
  if (attempt.status === 'in_progress') {
    if (remainingSeconds(attempt) > 0) {
      throw new ApiError(409, 'ATTEMPT_IN_PROGRESS', 'The attempt is still in progress', {
        attemptId: attempt.id,
        remainingSeconds: remainingSeconds(attempt),
      });
    }
    await finalizeAttempt(db, profile.id, attempt.id);
  }
  return buildResult(db, profile, attemptId);
}

export async function getEntranceHistory(
  db: Db,
  profile: ProfileRow,
): Promise<EntranceHistoryItem[]> {
  const rows = await db.query<{
    attempt_id: string;
    test_title: string;
    attempt_date: string;
    status: EntranceAttemptRow['status'];
    correct_count: number;
    total_questions: number;
    score_percent: number | string;
    coins_earned: number;
  }>(
    `select a.id as attempt_id,
            case $2::text
              when 'ru' then t.title_ru
              when 'en' then t.title_en
              else t.title_uz
            end as test_title,
            a.attempt_date::text as attempt_date, a.status,
            a.correct_count, a.total_questions, a.score_percent, a.coins_earned
       from entrance_attempts a
       join entrance_tests t on t.id = a.test_id
      where a.user_id = $1
      order by a.attempt_date desc
      limit 100`,
    [profile.id, profile.language],
  );

  return rows.map((row) => ({
    attemptId: row.attempt_id,
    testTitle: row.test_title,
    attemptDate: row.attempt_date,
    status: row.status,
    totalCorrect: row.status === 'in_progress' ? null : Number(row.correct_count),
    totalQuestions: Number(row.total_questions),
    percent: row.status === 'in_progress' ? null : Number(row.score_percent),
    coinsEarned: row.status === 'in_progress' ? null : Number(row.coins_earned),
  }));
}

/** Worker: finalizes attempts whose server-side timer has expired. */
export async function finalizeExpiredEntranceAttempts(
  db: Db,
  now: Date = new Date(),
): Promise<number> {
  const rows = await db.query<{ id: string; user_id: string }>(
    `select id, user_id from entrance_attempts
      where status = 'in_progress' and expires_at <= $1
      order by expires_at asc
      limit 100`,
    [now.toISOString()],
  );

  let count = 0;
  for (const row of rows) {
    try {
      await finalizeAttempt(db, row.user_id, row.id);
      count++;
    } catch (error) {
      console.warn(`[worker] could not finalize entrance attempt ${row.id}:`, error);
    }
  }
  return count;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  return code === '23505';
}
