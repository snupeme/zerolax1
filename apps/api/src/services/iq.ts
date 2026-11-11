import type { AppConfig } from '../config';
import {
  awardAchievements,
  creditCoins,
  type Db,
  type Queryable,
  type ProfileRow,
} from '@zerolax/db';
import {
  IQ_QUESTIONS_PER_TEST,
  percentage,
  tashkentDateString,
  tashkentPublishInstant,
  type IqHistoryItem,
  type IqResultResponse,
  type IqTestSummary,
  type IqTodayResponse,
  type QuestionPublic,
  type Language,
} from '@zerolax/shared';
import { ApiError } from '../errors';
import {
  mapPublicQuestions,
  mapResultQuestions,
  toIso,
  type OptionTextRow,
  type QuestionTextRow,
} from '../serializers';
import { localizeText } from '../localize';
import { notifyDailyIq, notifyIqResult } from './notifications';
import { recordIqSubmission } from './edtech-recording';
import { getPlatformSettings } from './admin-control';

interface IqTestRow {
  id: string;
  test_date: string;
  title_uz: string;
  title_ru: string;
  title_en: string;
  status: 'draft' | 'scheduled' | 'published' | 'archived';
  publish_at: string | Date;
  published_at: string | Date | null;
  release_at: string | Date | null;
  question_count: number;
}

interface AttemptRow {
  id: string;
  user_id: string;
  test_id: string;
  status: 'in_progress' | 'submitted' | 'scored';
  started_at: string | Date;
  submitted_at: string | Date | null;
  scored_at: string | Date | null;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;
  total_questions: number;
  coins_earned: number;
  reward_status: 'pending' | 'credited';
  result_notified_at: string | Date | null;
}

const TEST_SELECT = `
  select t.id, t.test_date::text as test_date, t.title_uz, t.title_ru, t.title_en,
         t.status, t.publish_at, t.published_at, t.release_at,
         (select count(*) from iq_questions q where q.test_id = t.id)::int as question_count
    from daily_iq_tests t
`;

const ATTEMPT_COLUMNS = `
  id, user_id, test_id, status, started_at, submitted_at, scored_at,
  correct_count, incorrect_count, unanswered_count, total_questions, coins_earned,
  reward_status, result_notified_at
`;

function mapTest(row: IqTestRow, language: Language): IqTestSummary {
  return {
    id: row.id,
    testDate: row.test_date,
    title: localizeText(row as unknown as Record<string, unknown>, 'title', language),
    status: row.status,
    publishAt: toIso(row.publish_at) ?? new Date().toISOString(),
    publishedAt: toIso(row.published_at),
    releaseAt: toIso(row.release_at),
    questionCount: Number(row.question_count),
  };
}

async function getTest(db: Queryable, testId: string): Promise<IqTestRow | null> {
  const rows = await db.query<IqTestRow>(`${TEST_SELECT} where t.id = $1`, [testId]);
  return rows[0] ?? null;
}

async function getAttemptForTest(
  db: Queryable,
  userId: string,
  testId: string,
): Promise<AttemptRow | null> {
  const rows = await db.query<AttemptRow>(
    `select ${ATTEMPT_COLUMNS} from iq_attempts where user_id = $1 and test_id = $2`,
    [userId, testId],
  );
  return rows[0] ?? null;
}

async function getAttempt(db: Queryable, attemptId: string): Promise<AttemptRow | null> {
  const rows = await db.query<AttemptRow>(
    `select ${ATTEMPT_COLUMNS} from iq_attempts where id = $1`,
    [attemptId],
  );
  return rows[0] ?? null;
}

async function getAnswers(db: Queryable, attemptId: string): Promise<Map<string, string>> {
  const rows = await db.query<{ question_id: string; selected_option_id: string }>(
    'select question_id, selected_option_id from iq_user_answers where attempt_id = $1',
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
       from iq_questions where test_id = $1 order by position`,
    [testId],
  );
  const options = await db.query<OptionTextRow>(
    `select o.id, o.question_id, o.position, o.text_uz, o.text_ru, o.text_en
       from iq_question_options o
       join iq_questions q on q.id = o.question_id
      where q.test_id = $1
      order by o.question_id, o.position`,
    [testId],
  );
  return { questions, options };
}

function mapAttempt(
  attempt: AttemptRow,
  answers: Map<string, string>,
): {
  id: string;
  testId: string;
  status: AttemptRow['status'];
  startedAt: string;
  submittedAt: string | null;
  answers: Record<string, string>;
} {
  return {
    id: attempt.id,
    testId: attempt.test_id,
    status: attempt.status,
    startedAt: toIso(attempt.started_at) ?? new Date().toISOString(),
    submittedAt: toIso(attempt.submitted_at),
    answers: Object.fromEntries(answers),
  };
}

export async function getIqToday(
  db: Db,
  profile: ProfileRow,
): Promise<IqTodayResponse> {
  const today = tashkentDateString();
  const tests = await db.query<IqTestRow>(
    `${TEST_SELECT} where t.test_date = $1 and t.status = 'published'`,
    [today],
  );
  const test = tests[0];
  if (!test) {
    return {
      test: null,
      attempt: null,
      serverTime: new Date().toISOString(),
      resultAvailable: false,
      releaseAt: null,
    };
  }

  const attempt = await getAttemptForTest(db, profile.id, test.id);
  const answers = attempt ? await getAnswers(db, attempt.id) : new Map<string, string>();
  const releaseAt = toIso(test.release_at);
  const resultAvailable = Boolean(
    attempt &&
      attempt.status !== 'in_progress' &&
      test.release_at &&
      new Date(test.release_at).getTime() <= Date.now(),
  );

  return {
    test: mapTest(test, profile.language),
    attempt: attempt ? mapAttempt(attempt, answers) : null,
    serverTime: new Date().toISOString(),
    resultAvailable,
    releaseAt,
  };
}

export async function startIqTest(
  db: Db,
  profile: ProfileRow,
  testId: string,
): Promise<{
  test: IqTestSummary;
  attempt: ReturnType<typeof mapAttempt>;
  questions: QuestionPublic[];
  serverTime: string;
}> {
  const test = await getTest(db, testId);
  const today = tashkentDateString();
  if (!test || test.status !== 'published' || test.test_date !== today) {
    throw new ApiError(409, 'TEST_NOT_AVAILABLE', 'This test is not available');
  }

  let attempt = await getAttemptForTest(db, profile.id, testId);
  if (!attempt) {
    await db.query(
      `insert into iq_attempts (user_id, test_id, total_questions)
       values ($1, $2, $3)
       on conflict (user_id, test_id) do nothing`,
      [profile.id, testId, Number(test.question_count)],
    );
    attempt = await getAttemptForTest(db, profile.id, testId);
  }
  if (!attempt) throw new ApiError(500, 'ATTEMPT_CREATE_FAILED', 'Could not start the attempt');

  const { questions, options } = await getQuestions(db, testId);
  const answers = await getAnswers(db, attempt.id);

  return {
    test: mapTest(test, profile.language),
    attempt: mapAttempt(attempt, answers),
    questions: mapPublicQuestions(questions, options, profile.language),
    serverTime: new Date().toISOString(),
  };
}

export async function saveIqAnswer(
  db: Db,
  profile: ProfileRow,
  attemptId: string,
  questionId: string,
  optionId: string,
): Promise<{ saved: boolean; answeredCount: number }> {
  return db.transaction(async (tx) => {
    const attempts = await tx.query<AttemptRow>(
      `select ${ATTEMPT_COLUMNS} from iq_attempts where id = $1 and user_id = $2 for update`,
      [attemptId, profile.id],
    );
    const attempt = attempts[0];
    if (!attempt) throw new ApiError(404, 'ATTEMPT_NOT_FOUND', 'Attempt not found');
    if (attempt.status !== 'in_progress') {
      throw new ApiError(409, 'ALREADY_SUBMITTED', 'This test has already been submitted');
    }

    const valid = await tx.query<{ id: string }>(
      `select o.id
         from iq_questions q
         join iq_question_options o on o.question_id = q.id
        where q.id = $1 and q.test_id = $2 and o.id = $3`,
      [questionId, attempt.test_id, optionId],
    );
    if (valid.length === 0) {
      throw new ApiError(400, 'INVALID_ANSWER', 'The selected answer is not valid for this question');
    }

    await tx.query(
      `insert into iq_user_answers (attempt_id, question_id, selected_option_id)
       values ($1, $2, $3)
       on conflict (attempt_id, question_id) do update
         set selected_option_id = excluded.selected_option_id, answered_at = now()`,
      [attemptId, questionId, optionId],
    );

    const [count] = await tx.query<{ count: number }>(
      'select count(*)::int as count from iq_user_answers where attempt_id = $1',
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
  attempt: AttemptRow,
): Promise<{ correct: number; incorrect: number; unanswered: number; coins: number; total: number }> {
  const rows = await tx.query<ScoreRow>(
    `select q.id, q.coins,q.difficulty,
            correct_option.id as correct_option_id,
            a.selected_option_id
       from iq_questions q
       join iq_question_options correct_option
         on correct_option.question_id = q.id and correct_option.position = q.correct_option_index
       left join iq_user_answers a
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

  await tx.query(
    `update iq_attempts
        set correct_count = $1, incorrect_count = $2, unanswered_count = $3,
            coins_earned = $4, total_questions = $5
      where id = $6`,
    [correct, incorrect, unanswered, coins, rows.length, attempt.id],
  );

  return { correct, incorrect, unanswered, coins, total: rows.length };
}

export async function submitIqAttempt(
  db: Db,
  profile: ProfileRow,
  attemptId: string,
): Promise<{ submitted: true; submittedAt: string; releaseAt: string | null }> {
  return db.transaction(async (tx) => {
    const attempts = await tx.query<AttemptRow>(
      `select ${ATTEMPT_COLUMNS} from iq_attempts where id = $1 and user_id = $2 for update`,
      [attemptId, profile.id],
    );
    const attempt = attempts[0];
    if (!attempt) throw new ApiError(404, 'ATTEMPT_NOT_FOUND', 'Attempt not found');
    if (attempt.status !== 'in_progress') {
      throw new ApiError(409, 'ALREADY_SUBMITTED', 'This test has already been submitted');
    }

    const tests = await tx.query<{ release_at: string | Date | null }>(
      'select release_at from daily_iq_tests where id = $1',
      [attempt.test_id],
    );

    await scoreAttempt(tx, attempt);
    const submittedAt = new Date();
    await tx.query(
      `update iq_attempts set status = 'submitted', submitted_at = $1 where id = $2`,
      [submittedAt.toISOString(), attempt.id],
    );
    await recordIqSubmission(tx, profile.id, attempt.id, attempt.test_id);

    return {
      submitted: true,
      submittedAt: submittedAt.toISOString(),
      releaseAt: toIso(tests[0]?.release_at ?? null),
    };
  });
}

/** Scores, credits coins and notifies for one attempt once the release time passed. */
async function releaseAttempt(
  db: Db,
  config: AppConfig,
  attemptId: string,
  now: Date,
): Promise<{ released: boolean; userId: string | null }> {
  const result = await db.transaction(async (tx) => {
    const attempts = await tx.query<AttemptRow>(
      `select ${ATTEMPT_COLUMNS} from iq_attempts where id = $1 for update`,
      [attemptId],
    );
    const attempt = attempts[0];
    if (!attempt) return { released: false, userId: null };
    if (attempt.status === 'in_progress') return { released: false, userId: null };

    const tests = await tx.query<{ release_at: string | Date | null }>(
      'select release_at from daily_iq_tests where id = $1',
      [attempt.test_id],
    );
    const releaseAt = tests[0]?.release_at;
    if (!releaseAt || new Date(releaseAt).getTime() > now.getTime()) {
      return { released: false, userId: null };
    }

    if (attempt.status === 'submitted') {
      await scoreAttempt(tx, attempt);
    }

    const earned = await tx.query<{ coins_earned: number }>(
      'select coins_earned from iq_attempts where id = $1',
      [attempt.id],
    );
    const coins = Number(earned[0]?.coins_earned ?? attempt.coins_earned ?? 0);

    if (attempt.reward_status === 'pending') {
      await creditCoins(tx, {
        userId: attempt.user_id,
        amount: coins,
        type: 'iq_reward',
        sourceType: 'iq_attempt',
        sourceId: attempt.id,
        idempotencyKey: `iq:${attempt.id}`,
        description: 'Daily IQ test reward',
      });
    }

    await tx.query(
      `update iq_attempts
          set status = 'scored', scored_at = coalesce(scored_at, now()), reward_status = 'credited'
        where id = $1`,
      [attempt.id],
    );

    await awardAchievements(tx, attempt.user_id);

    return { released: true, userId: attempt.user_id };
  });

  if (result.released) {
    await notifyIqResult(db, config, attemptId);
  }
  return result;
}

export async function releaseSingleIqAttempt(
  db: Db,
  config: AppConfig,
  attemptId: string,
): Promise<boolean> {
  const result = await releaseAttempt(db, config, attemptId, new Date());
  return result.released;
}

export async function getIqResult(
  db: Db,
  config: AppConfig,
  profile: ProfileRow,
  testId: string,
): Promise<IqResultResponse> {
  const test = await getTest(db, testId);
  if (!test) throw new ApiError(404, 'TEST_NOT_FOUND', 'Test not found');

  const attempt = await getAttemptForTest(db, profile.id, testId);
  const releaseAt = toIso(test.release_at);
  const now = Date.now();
  const releaseReached = Boolean(test.release_at && new Date(test.release_at).getTime() <= now);

  const lockedResponse: IqResultResponse = {
    locked: true,
    releaseAt,
    test: mapTest(test, profile.language),
    attemptId: attempt?.id ?? null,
    totalCorrect: 0,
    totalIncorrect: 0,
    unanswered: 0,
    totalQuestions: attempt ? Number(attempt.total_questions) : 0,
    percent: 0,
    coinsEarned: 0,
    questions: [],
  };

  if (!attempt) return lockedResponse;

  if (!releaseReached || attempt.status === 'in_progress') {
    return {
      ...lockedResponse,
      totalQuestions: Number(attempt.total_questions),
    };
  }

  await releaseAttempt(db, config, attempt.id, new Date());
  const fresh = await getAttempt(db, attempt.id);
  if (!fresh) return lockedResponse;

  const { questions, options } = await getQuestions(db, testId);
  const answers = await getAnswers(db, attempt.id);
  const resultQuestions = mapResultQuestions(questions, options, answers, profile.language);
  const total = Number(fresh.total_questions);

  return {
    locked: false,
    releaseAt,
    test: mapTest(test, profile.language),
    attemptId: fresh.id,
    totalCorrect: Number(fresh.correct_count),
    totalIncorrect: Number(fresh.incorrect_count),
    unanswered: Number(fresh.unanswered_count),
    totalQuestions: total,
    percent: percentage(Number(fresh.correct_count), total),
    coinsEarned: Number(fresh.coins_earned),
    questions: resultQuestions,
  };
}

export async function getIqHistory(
  db: Db,
  profile: ProfileRow,
): Promise<IqHistoryItem[]> {
  const rows = await db.query<{
    attempt_id: string;
    test_id: string;
    test_date: string;
    title_uz: string;
    title_ru: string;
    title_en: string;
    status: AttemptRow['status'];
    release_at: string | Date | null;
    total_correct: number | null;
    total_questions: number;
    coins_earned: number | null;
  }>(
    `select a.id as attempt_id, t.id as test_id, t.test_date::text as test_date,
            t.title_uz, t.title_ru, t.title_en, a.status, t.release_at,
            case when t.release_at is not null and t.release_at <= now()
                 then a.correct_count else null end as total_correct,
            a.total_questions,
            case when t.release_at is not null and t.release_at <= now()
                 then a.coins_earned else null end as coins_earned
       from iq_attempts a
       join daily_iq_tests t on t.id = a.test_id
      where a.user_id = $1
      order by t.test_date desc
      limit 100`,
    [profile.id],
  );

  return rows.map((row) => {
    const available = Boolean(
      row.release_at && new Date(row.release_at).getTime() <= Date.now(),
    );
    return {
      attemptId: row.attempt_id,
      testId: row.test_id,
      testDate: row.test_date,
      title: localizeText(row as unknown as Record<string, unknown>, 'title', profile.language),
      status: row.status,
      resultAvailable: available,
      releaseAt: toIso(row.release_at),
      totalCorrect: available && row.total_correct !== null ? Number(row.total_correct) : null,
      totalQuestions: Number(row.total_questions),
      coinsEarned: available && row.coins_earned !== null ? Number(row.coins_earned) : null,
    };
  });
}

/** Publishes a test (admin action or scheduled worker) and sends the announcement. */
export async function publishIqTest(
  db: Db,
  config: AppConfig,
  testId: string,
): Promise<IqTestRow> {
  const test = await getTest(db, testId);
  if (!test) throw new ApiError(404, 'TEST_NOT_FOUND', 'Test not found');
  if (Number(test.question_count) !== IQ_QUESTIONS_PER_TEST) {
    throw new ApiError(
      409,
      'INVALID_TEST',
      `An IQ test must contain exactly ${IQ_QUESTIONS_PER_TEST} questions`,
    );
  }
  if (test.status === 'published') return test;

  const rows = await db.query<{ id: string; test_date: string }>(
    `update daily_iq_tests
        set status = 'published',
            published_at = now(),
            release_at = now() + interval '24 hours',
            updated_at = now()
      where id = $1 and status in ('draft', 'scheduled')
      returning id, test_date::text as test_date`,
    [testId],
  );

  if (rows.length > 0) {
    await notifyDailyIq(db, config, rows[0]);
  }

  const fresh = await getTest(db, testId);
  if (!fresh) throw new ApiError(500, 'TEST_PUBLISH_FAILED', 'Could not publish the test');
  return fresh;
}

/**
 * Keeps the daily cadence alive even if an administrator forgets to create a
 * test. When no test exists for the requested date, the most recent complete
 * 10-question test is cloned into a scheduled test for that date. Administrators
 * can still edit the cloned content before publication.
 */
export async function ensureIqTestForDate(db: Db, dateString: string): Promise<string | null> {
  const existing = await db.query<{ id: string }>(
    'select id from daily_iq_tests where test_date = $1',
    [dateString],
  );
  if (existing[0]) return existing[0].id;

  const sources = await db.query<{
    id: string;
    title_uz: string;
    title_ru: string;
    title_en: string;
    question_count: number;
  }>(
    `select t.id, t.title_uz, t.title_ru, t.title_en,
            (select count(*) from iq_questions q where q.test_id = t.id)::int as question_count
       from daily_iq_tests t
      order by t.test_date desc
      limit 5`,
  );
  const source = sources.find((row) => Number(row.question_count) === IQ_QUESTIONS_PER_TEST);
  if (!source) return null;

  const publishAt = tashkentPublishInstant(dateString).toISOString();

  try {
    return await db.transaction(async (tx) => {
      const inserted = await tx.query<{ id: string }>(
        `insert into daily_iq_tests (test_date, title_uz, title_ru, title_en, status, publish_at)
         values ($1, $2, $3, $4, 'scheduled', $5)
         on conflict (test_date) do nothing
         returning id`,
        [dateString, source.title_uz, source.title_ru, source.title_en, publishAt],
      );
      const newId = inserted[0]?.id;
      if (!newId) {
        const raced = await tx.query<{ id: string }>(
          'select id from daily_iq_tests where test_date = $1',
          [dateString],
        );
        return raced[0]?.id ?? null;
      }

      await tx.query(
        `insert into iq_questions
           (test_id, position, text_uz, text_ru, text_en,
            explanation_uz, explanation_ru, explanation_en,
            difficulty, coins, image_url, correct_option_index)
         select $1, q.position, q.text_uz, q.text_ru, q.text_en,
                q.explanation_uz, q.explanation_ru, q.explanation_en,
                q.difficulty, q.coins, q.image_url, q.correct_option_index
           from iq_questions q
          where q.test_id = $2`,
        [newId, source.id],
      );

      await tx.query(
        `insert into iq_question_options (question_id, position, text_uz, text_ru, text_en)
         select fresh.id, o.position, o.text_uz, o.text_ru, o.text_en
           from iq_question_options o
           join iq_questions origin on origin.id = o.question_id and origin.test_id = $2
           join iq_questions fresh on fresh.test_id = $1 and fresh.position = origin.position`,
        [newId, source.id],
      );

      return newId;
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      const raced = await db.query<{ id: string }>(
        'select id from daily_iq_tests where test_date = $1',
        [dateString],
      );
      return raced[0]?.id ?? null;
    }
    throw error;
  }
}

/** Publishes all scheduled tests whose 09:00 Tashkent publication time has arrived. */
export async function publishDueIqTests(
  db: Db,
  config: AppConfig,
  now: Date = new Date(),
): Promise<number> {
  const today = tashkentDateString(now);
  const due = await db.query<{ id: string }>(
    `select id from daily_iq_tests
      where status in ('draft', 'scheduled')
        and test_date = $1
        and publish_at <= $2
      order by publish_at asc
      limit 5`,
    [today, now.toISOString()],
  );

  let published = 0;
  for (const row of due) {
    try {
      await publishIqTest(db, config, row.id);
      published++;
    } catch (error) {
      console.warn(`[worker] could not publish IQ test ${row.id}:`, error);
    }
  }
  return published;
}

/** Releases all IQ results whose 24h release time has passed. */
export async function releaseDueIqResults(
  db: Db,
  config: AppConfig,
  now: Date = new Date(),
): Promise<number> {
  const tests = await db.query<{ id: string }>(
    `select id from daily_iq_tests
      where status = 'published' and release_at is not null and release_at <= $1
      order by release_at asc
      limit 20`,
    [now.toISOString()],
  );

  let released = 0;
  for (const test of tests) {
    const attempts = await db.query<{ id: string }>(
      `select id from iq_attempts where test_id = $1 and status in ('submitted', 'scored')`,
      [test.id],
    );
    for (const attempt of attempts) {
      try {
        const ok = await releaseAttempt(db, config, attempt.id, now);
        if (ok.released) released++;
      } catch (error) {
        console.warn(`[worker] could not release IQ attempt ${attempt.id}:`, error);
      }
    }
  }
  return released;
}
