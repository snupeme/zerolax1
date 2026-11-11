import { afterEach, describe, expect, it } from 'vitest';
import { addDaysToDateString, tashkentDateString } from '@zerolax/shared';
import { releaseDueIqResults } from '../src/services/iq';
import {
  authHeader,
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

async function balanceOf(db: TestContext['db'], userId: string): Promise<number> {
  const rows = await db.query<{ coins_balance: number }>(
    'select coins_balance from profiles where id = $1',
    [userId],
  );
  return Number(rows[0]?.coins_balance ?? 0);
}

describe('Daily IQ test', () => {
  it('runs the full lifecycle and keeps results hidden until release', async () => {
    context = await createTestContext();
    const user = await createTestUser(context.db, { telegramId: '910000001' });
    const login = await loginAs(context.app, user.telegramId);
    const headers = authHeader(login.accessToken);

    const before = await context.app.inject({ method: 'GET', url: '/api/iq/today', headers });
    expect(before.statusCode).toBe(200);
    expect(before.json().test).toBeNull();

    const fixture = await createIqTestFixture(context.db, {
      releaseAt: new Date(Date.now() + 60 * 60 * 1000),
      coins: 2,
    });

    const today = await context.app.inject({ method: 'GET', url: '/api/iq/today', headers });
    expect(today.statusCode).toBe(200);
    expect(today.json().test.id).toBe(fixture.testId);
    expect(today.json().test.questionCount).toBe(10);
    expect(today.json().attempt).toBeNull();
    expect(today.json().resultAvailable).toBe(false);

    const start = await context.app.inject({
      method: 'POST',
      url: `/api/iq/${fixture.testId}/attempt`,
      headers,
    });
    expect(start.statusCode).toBe(200);
    const session = start.json();
    expect(session.questions).toHaveLength(10);
    expect(session.attempt.status).toBe('in_progress');
    // Correct answers are never exposed before submission.
    expect(session.questions[0].correctOptionId).toBeUndefined();
    const attemptId = session.attempt.id;

    // Starting a second time returns the same attempt instead of creating a new one.
    const restart = await context.app.inject({
      method: 'POST',
      url: `/api/iq/${fixture.testId}/attempt`,
      headers,
    });
    expect(restart.statusCode).toBe(200);
    expect(restart.json().attempt.id).toBe(attemptId);

    for (let index = 0; index < 6; index++) {
      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/iq/attempts/${attemptId}/answer`,
        headers,
        payload: {
          questionId: fixture.questions[index].id,
          optionId: fixture.questions[index].correctOptionId,
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().saved).toBe(true);
    }

    // Two deliberately incorrect answers.
    for (let index = 6; index < 8; index++) {
      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/iq/attempts/${attemptId}/answer`,
        headers,
        payload: {
          questionId: fixture.questions[index].id,
          optionId: fixture.questions[index].optionIds[2],
        },
      });
      expect(response.statusCode).toBe(200);
    }

    // Foreign option ids are rejected.
    const invalid = await context.app.inject({
      method: 'PUT',
      url: `/api/iq/attempts/${attemptId}/answer`,
      headers,
      payload: {
        questionId: fixture.questions[0].id,
        optionId: fixture.questions[1].optionIds[1],
      },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('INVALID_ANSWER');

    const submit = await context.app.inject({
      method: 'POST',
      url: `/api/iq/attempts/${attemptId}/submit`,
      headers,
    });
    expect(submit.statusCode).toBe(200);
    expect(submit.json().submitted).toBe(true);

    const again = await context.app.inject({
      method: 'POST',
      url: `/api/iq/attempts/${attemptId}/submit`,
      headers,
    });
    expect(again.statusCode).toBe(409);

    // Before release: locked, no answers or explanations leak.
    const locked = await context.app.inject({
      method: 'GET',
      url: `/api/iq/${fixture.testId}/result`,
      headers,
    });
    expect(locked.statusCode).toBe(200);
    expect(locked.json().locked).toBe(true);
    expect(locked.json().totalCorrect).toBe(0);
    expect(locked.json().questions).toHaveLength(0);
    expect(await balanceOf(context.db, user.id)).toBe(10);

    const hiddenHistory = await context.app.inject({
      method: 'GET',
      url: '/api/iq/history',
      headers,
    });
    expect(hiddenHistory.statusCode).toBe(200);
    expect(hiddenHistory.json().history[0].resultAvailable).toBe(false);
    expect(hiddenHistory.json().history[0].totalCorrect).toBeNull();

    // Let the release time pass and run the worker.
    await context.db.query(
      `update daily_iq_tests set release_at = now() - interval '1 minute' where id = $1`,
      [fixture.testId],
    );
    const released = await releaseDueIqResults(context.db, context.config);
    expect(released).toBe(1);

    const result = await context.app.inject({
      method: 'GET',
      url: `/api/iq/${fixture.testId}/result`,
      headers,
    });
    expect(result.statusCode).toBe(200);
    const body = result.json();
    expect(body.locked).toBe(false);
    expect(body.totalCorrect).toBe(6);
    expect(body.totalIncorrect).toBe(2);
    expect(body.unanswered).toBe(2);
    expect(body.totalQuestions).toBe(10);
    expect(body.percent).toBe(60);
    expect(body.coinsEarned).toBe(12);
    expect(body.questions).toHaveLength(10);
    expect(body.questions[0].correctOptionId).toBe(fixture.questions[0].correctOptionId);
    expect(body.questions[0].isCorrect).toBe(true);
    expect(body.questions[6].isCorrect).toBe(false);
    expect(body.questions[8].selectedOptionId).toBeNull();
    expect(body.questions[8].explanation).toBe('Izoh 9');

    // Coins are credited exactly once, using the attempt ledger key.
    // The daily-test mission is also credited from real activity.
    expect(await balanceOf(context.db, user.id)).toBe(22);
    const ledger = await context.db.query<{ idempotency_key: string }>(
      'select idempotency_key from coin_transactions where user_id = $1',
      [user.id],
    );
    expect(ledger).toHaveLength(2);
    expect(ledger.map((entry) => entry.idempotency_key)).toContain(`iq:${attemptId}`);
    expect(ledger.map((entry) => entry.idempotency_key)).toContain(
      `mission:${user.id}:${tashkentDateString()}:daily_test`,
    );

    // Repeated reads and worker runs never credit twice.
    await context.app.inject({ method: 'GET', url: `/api/iq/${fixture.testId}/result`, headers });
    await releaseDueIqResults(context.db, context.config);
    expect(await balanceOf(context.db, user.id)).toBe(22);

    const visibleHistory = await context.app.inject({
      method: 'GET',
      url: '/api/iq/history',
      headers,
    });
    const historyItem = visibleHistory.json().history[0];
    expect(historyItem.resultAvailable).toBe(true);
    expect(historyItem.totalCorrect).toBe(6);
    expect(historyItem.status).toBe('scored');
    expect(historyItem.coinsEarned).toBe(12);
  });

  it('only exposes the test published for the current Tashkent date', async () => {
    context = await createTestContext();
    const user = await createTestUser(context.db, { telegramId: '910000002' });
    const login = await loginAs(context.app, user.telegramId);
    const headers = authHeader(login.accessToken);

    const yesterday = addDaysToDateString(tashkentDateString(), -1);
    const oldTest = await createIqTestFixture(context.db, {
      date: yesterday,
      releaseAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const today = await context.app.inject({ method: 'GET', url: '/api/iq/today', headers });
    expect(today.json().test).toBeNull();

    const attempt = await context.app.inject({
      method: 'POST',
      url: `/api/iq/${oldTest.testId}/attempt`,
      headers,
    });
    expect(attempt.statusCode).toBe(409);
    expect(attempt.json().error.code).toBe('TEST_NOT_AVAILABLE');
  });

  it('rejects attempts for draft tests and drafts results for users without an attempt', async () => {
    context = await createTestContext();
    const user = await createTestUser(context.db, { telegramId: '910000003' });
    const login = await loginAs(context.app, user.telegramId);
    const headers = authHeader(login.accessToken);

    const draft = await createIqTestFixture(context.db, {
      status: 'draft',
      releaseAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const attempt = await context.app.inject({
      method: 'POST',
      url: `/api/iq/${draft.testId}/attempt`,
      headers,
    });
    expect(attempt.statusCode).toBe(409);
    expect(attempt.json().error.code).toBe('TEST_NOT_AVAILABLE');

    const result = await context.app.inject({
      method: 'GET',
      url: `/api/iq/${draft.testId}/result`,
      headers,
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().locked).toBe(true);
    expect(result.json().attemptId).toBeNull();
  });
});
