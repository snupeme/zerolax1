import { afterEach, describe, expect, it } from 'vitest';
import { creditCoins } from '@zerolax/db';
import { addDaysToDateString, tashkentDateString } from '@zerolax/shared';
import { ensureIqTestForDate, publishDueIqTests } from '../src/services/iq';
import { finalizeExpiredEntranceAttempts } from '../src/services/entrance';
import {
  authHeader,
  createEntranceTestFixture,
  createIqTestFixture,
  createTestContext,
  createTestUser,
  loginAs,
  type TestContext,
} from './helpers';

let context: TestContext | null = null;

afterEach(async () => {
  if (context) {
    await context.close();
    context = null;
  }
});

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  return (error as { code?: string }).code;
}

describe('Database constraints and idempotency', () => {
  it('applies a coin ledger entry only once per idempotency key', async () => {
    context = await createTestContext();
    const user = await createTestUser(context.db, { telegramId: '940000001' });

    const first = await context.db.transaction((tx) =>
      creditCoins(tx, {
        userId: user.id,
        amount: 25,
        type: 'admin_adjustment',
        idempotencyKey: 'constraint:once',
        description: 'First',
      }),
    );
    expect(first).toEqual({ credited: true, balance: 25 });

    const second = await context.db.transaction((tx) =>
      creditCoins(tx, {
        userId: user.id,
        amount: 25,
        type: 'admin_adjustment',
        idempotencyKey: 'constraint:once',
        description: 'Duplicate',
      }),
    );
    expect(second).toEqual({ credited: false, balance: 25 });

    const rows = await context.db.query<{ count: number; balance_after: number }>(
      `select count(*)::int as count, max(balance_after)::int as balance_after
         from coin_transactions where user_id = $1`,
      [user.id],
    );
    expect(Number(rows[0].count)).toBe(1);
    expect(Number(rows[0].balance_after)).toBe(25);
  });

  it('refuses to let a coin balance become negative', async () => {
    context = await createTestContext();
    const user = await createTestUser(context.db, { telegramId: '940000002' });

    let caught: unknown;
    try {
      await context.db.transaction((tx) =>
        creditCoins(tx, {
          userId: user.id,
          amount: -10,
          type: 'admin_adjustment',
          idempotencyKey: 'constraint:negative',
        }),
      );
    } catch (error) {
      caught = error;
    }
    expect(errorCode(caught)).toBe('23514');

    const [profile] = await context.db.query<{ coins_balance: number }>(
      'select coins_balance from profiles where id = $1',
      [user.id],
    );
    expect(Number(profile.coins_balance)).toBe(0);
    const [ledger] = await context.db.query<{ count: number }>(
      'select count(*)::int as count from coin_transactions where user_id = $1',
      [user.id],
    );
    expect(Number(ledger.count)).toBe(0);
  });

  it('keeps nicknames unique regardless of letter case', async () => {
    context = await createTestContext();
    await createTestUser(context.db, { telegramId: '940000003', nickname: 'MixedCase' });

    let caught: unknown;
    try {
      await createTestUser(context.db, { telegramId: '940000004', nickname: 'mixedcase' });
    } catch (error) {
      caught = error;
    }
    expect(errorCode(caught)).toBe('23505');
  });

  it('keeps one IQ test per date and one attempt per user and test', async () => {
    context = await createTestContext();
    const user = await createTestUser(context.db, { telegramId: '940000005' });
    const date = tashkentDateString();
    const fixture = await createIqTestFixture(context.db, {
      date,
      releaseAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    let dateError: unknown;
    try {
      await createIqTestFixture(context.db, {
        date,
        releaseAt: new Date(Date.now() + 60 * 60 * 1000),
      });
    } catch (error) {
      dateError = error;
    }
    expect(errorCode(dateError)).toBe('23505');

    await context.db.query(
      `insert into iq_attempts (user_id, test_id, total_questions) values ($1, $2, 10)`,
      [user.id, fixture.testId],
    );
    let attemptError: unknown;
    try {
      await context.db.query(
        `insert into iq_attempts (user_id, test_id, total_questions) values ($1, $2, 10)`,
        [user.id, fixture.testId],
      );
    } catch (error) {
      attemptError = error;
    }
    expect(errorCode(attemptError)).toBe('23505');
  });

  it('keeps one entrance attempt per user and Tashkent day', async () => {
    context = await createTestContext();
    const user = await createTestUser(context.db, { telegramId: '940000006' });
    const test = await createEntranceTestFixture(context.db, {});
    const date = tashkentDateString();

    await context.db.query(
      `insert into entrance_attempts
        (user_id, test_id, attempt_date, expires_at, total_questions)
       values ($1, $2, $3, now() + interval '30 minutes', 20)`,
      [user.id, test.testId, date],
    );

    let caught: unknown;
    try {
      await context.db.query(
        `insert into entrance_attempts
          (user_id, test_id, attempt_date, expires_at, total_questions)
         values ($1, $2, $3, now() + interval '30 minutes', 20)`,
        [user.id, test.testId, date],
      );
    } catch (error) {
      caught = error;
    }
    expect(errorCode(caught)).toBe('23505');
  });
});

describe('Scheduler helpers', () => {
  it('publishes due scheduled IQ tests exactly once', async () => {
    context = await createTestContext();
    const fixture = await createIqTestFixture(context.db, {
      status: 'scheduled',
      releaseAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await context.db.query(
      `update daily_iq_tests set publish_at = now() - interval '1 minute' where id = $1`,
      [fixture.testId],
    );

    const published = await publishDueIqTests(context.db, context.config);
    expect(published).toBe(1);

    const [row] = await context.db.query<{
      status: string;
      release_at: string;
      published_at: string;
    }>('select status, release_at, published_at from daily_iq_tests where id = $1', [
      fixture.testId,
    ]);
    expect(row.status).toBe('published');
    expect(row.published_at).toBeTruthy();
    expect(row.release_at).toBeTruthy();

    const again = await publishDueIqTests(context.db, context.config);
    expect(again).toBe(0);
  });

  it('auto-clones the latest complete IQ test for a missing date', async () => {
    context = await createTestContext();
    const today = tashkentDateString();
    const tomorrow = addDaysToDateString(today, 1);
    await createIqTestFixture(context.db, {
      date: today,
      releaseAt: new Date(Date.now() + 60 * 60 * 1000),
      coins: 2,
    });

    const first = await ensureIqTestForDate(context.db, tomorrow);
    expect(first).toBeTruthy();

    const [row] = await context.db.query<{ status: string; test_date: string }>(
      'select status, test_date::text as test_date from daily_iq_tests where id = $1',
      [first],
    );
    expect(row.status).toBe('scheduled');
    expect(row.test_date).toBe(tomorrow);

    const [counts] = await context.db.query<{ questions: number; options: number }>(
      `select
         (select count(*) from iq_questions where test_id = $1)::int as questions,
         (select count(*) from iq_question_options o
            join iq_questions q on q.id = o.question_id
           where q.test_id = $1)::int as options`,
      [first],
    );
    expect(Number(counts.questions)).toBe(10);
    expect(Number(counts.options)).toBe(40);

    const second = await ensureIqTestForDate(context.db, tomorrow);
    expect(second).toBe(first);
  });

  it('finalizes expired entrance attempts in the background', async () => {
    context = await createTestContext();
    const user = await createTestUser(context.db, { telegramId: '940000007' });
    const login = await loginAs(context.app, user.telegramId);
    const fixture = await createEntranceTestFixture(context.db, {
      durationSeconds: 60,
      coins: 4,
    });

    const start = await context.app.inject({
      method: 'POST',
      url: `/api/entrance/tests/${fixture.testId}/start`,
      headers: authHeader(login.accessToken),
    });
    const attemptId = start.json().attempt.id;
    await context.app.inject({
      method: 'PUT',
      url: `/api/entrance/attempts/${attemptId}/answer`,
      headers: authHeader(login.accessToken),
      payload: {
        questionId: fixture.questions[0].id,
        optionId: fixture.questions[0].correctOptionId,
      },
    });

    await context.db.query(
      `update entrance_attempts set expires_at = now() - interval '1 second' where id = $1`,
      [attemptId],
    );

    const finalized = await finalizeExpiredEntranceAttempts(context.db);
    expect(finalized).toBe(1);

    const [attempt] = await context.db.query<{
      status: string;
      correct_count: number;
      coins_earned: number;
      reward_status: string;
    }>(
      'select status, correct_count, coins_earned, reward_status from entrance_attempts where id = $1',
      [attemptId],
    );
    expect(attempt.status).toBe('expired');
    expect(Number(attempt.correct_count)).toBe(1);
    expect(Number(attempt.coins_earned)).toBe(4);
    expect(attempt.reward_status).toBe('credited');

    const [profile] = await context.db.query<{ coins_balance: number }>(
      'select coins_balance from profiles where id = $1',
      [user.id],
    );
    expect(Number(profile.coins_balance)).toBe(14);

    const rerun = await finalizeExpiredEntranceAttempts(context.db);
    expect(rerun).toBe(0);
    const [ledger] = await context.db.query<{ count: number }>(
      'select count(*)::int as count from coin_transactions where user_id = $1',
      [user.id],
    );
    expect(Number(ledger.count)).toBe(2);
  });
});
