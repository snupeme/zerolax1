import { afterEach, describe, expect, it } from 'vitest';
import { tashkentDateString } from '@zerolax/shared';
import {
  authHeader,
  createEntranceTestFixture,
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

describe('Entrance tests', () => {
  it('starts a 20-question timed test and returns immediate results with one-time coins', async () => {
    context = await createTestContext();
    const user = await createTestUser(context.db, { telegramId: '920000001' });
    const login = await loginAs(context.app, user.telegramId);
    const headers = authHeader(login.accessToken);

    const empty = await context.app.inject({
      method: 'GET',
      url: '/api/entrance/tests',
      headers,
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().tests).toHaveLength(0);
    expect(empty.json().todayAttempt).toBeNull();

    const fixture = await createEntranceTestFixture(context.db, {
      questionCount: 20,
      durationSeconds: 1800,
      coins: 3,
    });

    const list = await context.app.inject({
      method: 'GET',
      url: '/api/entrance/tests',
      headers,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().tests).toHaveLength(1);
    expect(list.json().tests[0].id).toBe(fixture.testId);
    expect(list.json().tests[0].questionCount).toBe(20);

    const start = await context.app.inject({
      method: 'POST',
      url: `/api/entrance/tests/${fixture.testId}/start`,
      headers,
    });
    expect(start.statusCode).toBe(200);
    const session = start.json();
    expect(session.questions).toHaveLength(20);
    expect(session.attempt.status).toBe('in_progress');
    expect(session.attempt.remainingSeconds).toBeGreaterThan(1700);
    expect(session.questions[0].correctOptionId).toBeUndefined();
    const attemptId = session.attempt.id;
    expect(session.attempt.expiresAt).toBeTruthy();

    for (let index = 0; index < 5; index++) {
      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/entrance/attempts/${attemptId}/answer`,
        headers,
        payload: {
          questionId: fixture.questions[index].id,
          optionId: fixture.questions[index].correctOptionId,
        },
      });
      expect(response.statusCode).toBe(200);
    }
    for (let index = 5; index < 8; index++) {
      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/entrance/attempts/${attemptId}/answer`,
        headers,
        payload: {
          questionId: fixture.questions[index].id,
          optionId: fixture.questions[index].optionIds[3],
        },
      });
      expect(response.statusCode).toBe(200);
    }

    const reload = await context.app.inject({
      method: 'GET',
      url: `/api/entrance/tests/${fixture.testId}/session`,
      headers,
    });
    expect(reload.statusCode).toBe(200);
    expect(Object.keys(reload.json().attempt.answers)).toHaveLength(8);

    const submit = await context.app.inject({
      method: 'POST',
      url: `/api/entrance/attempts/${attemptId}/submit`,
      headers,
    });
    expect(submit.statusCode).toBe(200);
    const submitted = submit.json();
    expect(submitted.status).toBe('submitted');
    expect(submitted.result.status).toBe('submitted');
    expect(submitted.result.totalCorrect).toBe(5);
    expect(submitted.result.totalIncorrect).toBe(3);
    expect(submitted.result.unanswered).toBe(12);
    expect(submitted.result.totalQuestions).toBe(20);
    expect(submitted.result.percent).toBe(25);
    expect(submitted.result.coinsEarned).toBe(15);
    expect(submitted.result.questions).toHaveLength(20);
    expect(submitted.result.questions[0].correctOptionId).toBe(
      fixture.questions[0].correctOptionId,
    );

    const result = await context.app.inject({
      method: 'GET',
      url: `/api/entrance/attempts/${attemptId}/result`,
      headers,
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().percent).toBe(25);

    expect(await balanceOf(context.db, user.id)).toBe(25);
    const ledger = await context.db.query<{ idempotency_key: string }>(
      'select idempotency_key from coin_transactions where user_id = $1',
      [user.id],
    );
    expect(ledger).toHaveLength(2);
    expect(ledger.map((entry) => entry.idempotency_key)).toContain(`entrance:${attemptId}`);
    expect(ledger.map((entry) => entry.idempotency_key)).toContain(
      `mission:${user.id}:${tashkentDateString()}:daily_test`,
    );

    // Repeated finalization must not credit again.
    const again = await context.app.inject({
      method: 'POST',
      url: `/api/entrance/attempts/${attemptId}/submit`,
      headers,
    });
    expect(again.statusCode).toBe(200);
    expect(await balanceOf(context.db, user.id)).toBe(25);

    const history = await context.app.inject({
      method: 'GET',
      url: '/api/entrance/history',
      headers,
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().history).toHaveLength(1);
    expect(history.json().history[0].percent).toBe(25);

    // One attempt per Tashkent calendar day, even for a different test.
    const secondFixture = await createEntranceTestFixture(context.db, { questionCount: 20 });
    const second = await context.app.inject({
      method: 'POST',
      url: `/api/entrance/tests/${secondFixture.testId}/start`,
      headers,
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('DAILY_LIMIT');
    expect(second.json().error.details.attemptId).toBe(attemptId);

    const duplicate = await context.app.inject({
      method: 'POST',
      url: `/api/entrance/tests/${fixture.testId}/start`,
      headers,
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('DAILY_LIMIT');
  });

  it('pending attempts are resumed instead of duplicated', async () => {
    context = await createTestContext();
    const user = await createTestUser(context.db, { telegramId: '920000002' });
    const login = await loginAs(context.app, user.telegramId);
    const headers = authHeader(login.accessToken);

    const fixture = await createEntranceTestFixture(context.db, { durationSeconds: 1800 });
    const first = await context.app.inject({
      method: 'POST',
      url: `/api/entrance/tests/${fixture.testId}/start`,
      headers,
    });
    expect(first.statusCode).toBe(200);

    const resume = await context.app.inject({
      method: 'POST',
      url: `/api/entrance/tests/${fixture.testId}/start`,
      headers,
    });
    expect(resume.statusCode).toBe(200);
    expect(resume.json().attempt.id).toBe(first.json().attempt.id);

    const other = await createEntranceTestFixture(context.db, {});
    const conflicting = await context.app.inject({
      method: 'POST',
      url: `/api/entrance/tests/${other.testId}/start`,
      headers,
    });
    expect(conflicting.statusCode).toBe(409);
    expect(conflicting.json().error.details.attemptId).toBe(first.json().attempt.id);
    expect(conflicting.json().error.details.testId).toBe(fixture.testId);
  });

  it('enforces the server-side timer and finalizes expired attempts once', async () => {
    context = await createTestContext();
    const user = await createTestUser(context.db, { telegramId: '920000003' });
    const login = await loginAs(context.app, user.telegramId);
    const headers = authHeader(login.accessToken);

    const fixture = await createEntranceTestFixture(context.db, {
      durationSeconds: 60,
      coins: 1,
    });
    const start = await context.app.inject({
      method: 'POST',
      url: `/api/entrance/tests/${fixture.testId}/start`,
      headers,
    });
    expect(start.statusCode).toBe(200);
    const attemptId = start.json().attempt.id;

    // Answer one question while the timer is still valid.
    const answered = await context.app.inject({
      method: 'PUT',
      url: `/api/entrance/attempts/${attemptId}/answer`,
      headers,
      payload: {
        questionId: fixture.questions[0].id,
        optionId: fixture.questions[0].correctOptionId,
      },
    });
    expect(answered.statusCode).toBe(200);

    // Force the server-side expiry, exactly as if the client waited too long.
    await context.db.query(
      `update entrance_attempts set expires_at = now() - interval '1 second' where id = $1`,
      [attemptId],
    );

    const lateAnswer = await context.app.inject({
      method: 'PUT',
      url: `/api/entrance/attempts/${attemptId}/answer`,
      headers,
      payload: {
        questionId: fixture.questions[1].id,
        optionId: fixture.questions[1].correctOptionId,
      },
    });
    expect(lateAnswer.statusCode).toBe(409);
    expect(lateAnswer.json().error.code).toBe('ATTEMPT_EXPIRED');

    const result = await context.app.inject({
      method: 'GET',
      url: `/api/entrance/attempts/${attemptId}/result`,
      headers,
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().status).toBe('expired');
    expect(result.json().totalCorrect).toBe(1);
    expect(result.json().totalIncorrect).toBe(0);
    expect(result.json().unanswered).toBe(19);

    // Expired attempts still consume the daily attempt.
    const restart = await context.app.inject({
      method: 'POST',
      url: `/api/entrance/tests/${fixture.testId}/start`,
      headers,
    });
    expect(restart.statusCode).toBe(409);
    expect(restart.json().error.code).toBe('DAILY_LIMIT');
    expect(restart.json().error.details.status).toBe('expired');

    const list = await context.app.inject({
      method: 'GET',
      url: '/api/entrance/tests',
      headers,
    });
    expect(list.json().todayAttempt.status).toBe('expired');
    expect(list.json().todayAttempt.remainingSeconds).toBe(0);
  });

  it('does not expose another user’s attempts', async () => {
    context = await createTestContext();
    const owner = await createTestUser(context.db, { telegramId: '920000004' });
    const intruder = await createTestUser(context.db, { telegramId: '920000005' });
    const ownerLogin = await loginAs(context.app, owner.telegramId);
    const intruderLogin = await loginAs(context.app, intruder.telegramId);

    const fixture = await createEntranceTestFixture(context.db, {});
    const start = await context.app.inject({
      method: 'POST',
      url: `/api/entrance/tests/${fixture.testId}/start`,
      headers: authHeader(ownerLogin.accessToken),
    });
    const attemptId = start.json().attempt.id;

    const result = await context.app.inject({
      method: 'GET',
      url: `/api/entrance/attempts/${attemptId}/result`,
      headers: authHeader(intruderLogin.accessToken),
    });
    expect(result.statusCode).toBe(404);

    const answer = await context.app.inject({
      method: 'PUT',
      url: `/api/entrance/attempts/${attemptId}/answer`,
      headers: authHeader(intruderLogin.accessToken),
      payload: {
        questionId: fixture.questions[0].id,
        optionId: fixture.questions[0].correctOptionId,
      },
    });
    expect(answer.statusCode).toBe(404);
  });
});
