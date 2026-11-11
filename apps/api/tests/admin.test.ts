import { afterEach, describe, expect, it } from 'vitest';
import { tashkentDateString } from '@zerolax/shared';
import { processScheduledNotifications } from '../src/services/notifications';
import {
  authHeader,
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

const ADMIN_EMAIL = 'admin@zerolax.test';
const ADMIN_PASSWORD = 'test-admin-password';

async function adminLogin(ctx: TestContext): Promise<string> {
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/admin/auth/login',
    payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (response.statusCode !== 200) {
    throw new Error(`admin login failed: ${response.statusCode} ${response.body}`);
  }
  return response.json().accessToken as string;
}

function questionPayload(index: number) {
  return {
    textUz: `Savol ${index}`,
    textRu: `Вопрос ${index}`,
    textEn: `Question ${index}`,
    explanationUz: `Izoh ${index}`,
    explanationRu: `Объяснение ${index}`,
    explanationEn: `Explanation ${index}`,
    difficulty: 'easy',
    coins: 1,
    correctOptionIndex: 1,
    options: [
      { textUz: 'A', textRu: 'A', textEn: 'A' },
      { textUz: 'B', textRu: 'B', textEn: 'B' },
      { textUz: 'C', textRu: 'C', textEn: 'C' },
      { textUz: 'D', textRu: 'D', textEn: 'D' },
    ],
  };
}

describe('Admin authentication and authorization', () => {
  it('requires a real admin token and rejects user tokens', async () => {
    context = await createTestContext();
    const user = await createTestUser(context.db, { telegramId: '930000001' });
    const userLogin = await loginAs(context.app, user.telegramId);

    const wrong = await context.app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      payload: { email: ADMIN_EMAIL, password: 'wrong-password' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error.code).toBe('INVALID_CREDENTIALS');

    const anonymous = await context.app.inject({
      method: 'GET',
      url: '/api/admin/overview',
    });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json().error.code).toBe('ADMIN_UNAUTHORIZED');

    const asUser = await context.app.inject({
      method: 'GET',
      url: '/api/admin/overview',
      headers: authHeader(userLogin.accessToken),
    });
    expect(asUser.statusCode).toBe(401);
    expect(asUser.json().error.code).toBe('ADMIN_UNAUTHORIZED');

    const token = await adminLogin(context);
    const overview = await context.app.inject({
      method: 'GET',
      url: '/api/admin/overview',
      headers: authHeader(token),
    });
    expect(overview.statusCode).toBe(200);
    const body = overview.json();
    expect(body.totalUsers).toBe(1);
    expect(body.newUsersToday).toBe(1);
    expect(body.series).toHaveLength(14);
  });

  it('revokes admin access when the admin account is disabled', async () => {
    context = await createTestContext();
    const token = await adminLogin(context);

    await context.db.query(`update admin_users set status = 'disabled' where email = $1`, [
      ADMIN_EMAIL,
    ]);

    const response = await context.app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: authHeader(token),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('ADMIN_FORBIDDEN');

    await context.db.query(`update admin_users set status = 'active' where email = $1`, [
      ADMIN_EMAIL,
    ]);
    const relogin = await context.app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(relogin.statusCode).toBe(200);
  });
});

describe('Admin user management', () => {
  it('lists and searches users with their activity counters', async () => {
    context = await createTestContext();
    const token = await adminLogin(context);
    await createTestUser(context.db, { telegramId: '930000010', nickname: 'alice' });
    await createTestUser(context.db, { telegramId: '930000011', nickname: 'bob' });

    const list = await context.app.inject({
      method: 'GET',
      url: '/api/admin/users?page=1&limit=10',
      headers: authHeader(token),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().total).toBe(2);
    expect(list.json().users).toHaveLength(2);

    const search = await context.app.inject({
      method: 'GET',
      url: '/api/admin/users?search=ali',
      headers: authHeader(token),
    });
    expect(search.statusCode).toBe(200);
    expect(search.json().total).toBe(1);
    expect(search.json().users[0].nickname).toBe('alice');

    const byTelegram = await context.app.inject({
      method: 'GET',
      url: '/api/admin/users?search=930000011',
      headers: authHeader(token),
    });
    expect(byTelegram.json().users[0].nickname).toBe('bob');

    const detail = await context.app.inject({
      method: 'GET',
      url: `/api/admin/users/${search.json().users[0].id}`,
      headers: authHeader(token),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().profile.nickname).toBe('alice');
    expect(detail.json().stats).toBeTruthy();
    expect(Array.isArray(detail.json().coinTransactions)).toBe(true);
  });

  it('adjusts coins with an audit trail and blocks accounts', async () => {
    context = await createTestContext();
    const token = await adminLogin(context);
    const user = await createTestUser(context.db, { telegramId: '930000020', nickname: 'carol' });
    const userLogin = await loginAs(context.app, user.telegramId);

    const credit = await context.app.inject({
      method: 'POST',
      url: `/api/admin/users/${user.id}/coins`,
      headers: authHeader(token),
      payload: { amount: 50, reason: 'Support bonus' },
    });
    expect(credit.statusCode).toBe(200);
    expect(credit.json().balance).toBe(50);

    const debit = await context.app.inject({
      method: 'POST',
      url: `/api/admin/users/${user.id}/coins`,
      headers: authHeader(token),
      payload: { amount: -20, reason: 'Correction' },
    });
    expect(debit.statusCode).toBe(200);
    expect(debit.json().balance).toBe(30);

    const overdraft = await context.app.inject({
      method: 'POST',
      url: `/api/admin/users/${user.id}/coins`,
      headers: authHeader(token),
      payload: { amount: -100, reason: 'Too much' },
    });
    expect(overdraft.statusCode).toBe(400);
    expect(overdraft.json().error.code).toBe('INSUFFICIENT_BALANCE');

    const zero = await context.app.inject({
      method: 'POST',
      url: `/api/admin/users/${user.id}/coins`,
      headers: authHeader(token),
      payload: { amount: 0, reason: 'Nothing' },
    });
    expect(zero.statusCode).toBe(400);
    expect(zero.json().error.code).toBe('VALIDATION_ERROR');

    const missing = await context.app.inject({
      method: 'POST',
      url: '/api/admin/users/00000000-0000-4000-8000-000000000000/coins',
      headers: authHeader(token),
      payload: { amount: 5, reason: 'Ghost' },
    });
    expect(missing.statusCode).toBe(404);

    const userView = await context.app.inject({
      method: 'GET',
      url: '/api/user/me',
      headers: authHeader(userLogin.accessToken),
    });
    expect(userView.statusCode).toBe(200);
    expect(userView.json().profile.coinsBalance).toBe(30);

    const ledger = await context.app.inject({
      method: 'GET',
      url: '/api/user/me/coins',
      headers: authHeader(userLogin.accessToken),
    });
    expect(ledger.statusCode).toBe(200);
    expect(ledger.json().transactions).toHaveLength(2);
    expect(ledger.json().transactions[0].amount).toBe(-20);
    expect(ledger.json().transactions[0].type).toBe('admin_adjustment');
    expect(ledger.json().transactions[0].balanceAfter).toBe(30);

    const block = await context.app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${user.id}`,
      headers: authHeader(token),
      payload: { status: 'blocked' },
    });
    expect(block.statusCode).toBe(200);

    const blockedAccess = await context.app.inject({
      method: 'GET',
      url: '/api/user/me',
      headers: authHeader(userLogin.accessToken),
    });
    expect(blockedAccess.statusCode).toBe(403);
    expect(blockedAccess.json().error.code).toBe('ACCOUNT_BLOCKED');

    const blockedLogin = await context.app.inject({
      method: 'POST',
      url: '/api/auth/dev',
      payload: { telegramId: user.telegramId },
    });
    expect(blockedLogin.statusCode).toBe(403);

    const blockedRefresh = await context.app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: userLogin.refreshToken },
    });
    expect(blockedRefresh.statusCode).toBe(403);
    expect(blockedRefresh.json().error.code).toBe('ACCOUNT_BLOCKED');

    const unblock = await context.app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${user.id}`,
      headers: authHeader(token),
      payload: { status: 'active' },
    });
    expect(unblock.statusCode).toBe(200);

    const restored = await context.app.inject({
      method: 'POST',
      url: '/api/auth/dev',
      payload: { telegramId: user.telegramId },
    });
    expect(restored.statusCode).toBe(200);

    const audit = await context.app.inject({
      method: 'GET',
      url: '/api/admin/audit',
      headers: authHeader(token),
    });
    expect(audit.statusCode).toBe(200);
    const actions = audit.json().logs.map((log: { action: string }) => log.action);
    expect(actions).toContain('admin.login');
    expect(actions).toContain('coins.adjust');
    expect(actions).toContain('user.block');
    expect(actions).toContain('user.unblock');
  });
});

describe('Admin notifications and content management', () => {
  it('delivers targeted inbox notifications and processes scheduled ones', async () => {
    context = await createTestContext();
    const token = await adminLogin(context);
    const user = await createTestUser(context.db, { telegramId: '930000030', nickname: 'dave' });
    const userLogin = await loginAs(context.app, user.telegramId);

    const payload = {
      titleUz: 'Yangilik',
      titleRu: 'Новость',
      titleEn: 'News',
      bodyUz: 'Yangi imkoniyat',
      bodyRu: 'Новая возможность',
      bodyEn: 'A new opportunity',
      target: 'user',
      targetUserId: user.id,
    };

    const immediate = await context.app.inject({
      method: 'POST',
      url: '/api/admin/notifications',
      headers: authHeader(token),
      payload,
    });
    expect(immediate.statusCode).toBe(201);
    expect(immediate.json().delivery).toEqual({ sent: 0, failed: 1 });

    const inbox = await context.app.inject({
      method: 'GET',
      url: '/api/user/notifications',
      headers: authHeader(userLogin.accessToken),
    });
    expect(inbox.statusCode).toBe(200);
    expect(inbox.json().notifications).toHaveLength(1);
    expect(inbox.json().unread).toBe(1);
    expect(inbox.json().notifications[0].title).toBe('Yangilik');

    const read = await context.app.inject({
      method: 'POST',
      url: `/api/user/notifications/${inbox.json().notifications[0].id}/read`,
      headers: authHeader(userLogin.accessToken),
    });
    expect(read.statusCode).toBe(200);
    const afterRead = await context.app.inject({
      method: 'GET',
      url: '/api/user/notifications',
      headers: authHeader(userLogin.accessToken),
    });
    expect(afterRead.json().unread).toBe(0);

    const past = new Date(Date.now() - 60_000).toISOString();
    const invalidSchedule = await context.app.inject({
      method: 'POST',
      url: '/api/admin/notifications',
      headers: authHeader(token),
      payload: { ...payload, scheduledAt: past },
    });
    expect(invalidSchedule.statusCode).toBe(400);
    expect(invalidSchedule.json().error.code).toBe('INVALID_SCHEDULE');

    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const scheduled = await context.app.inject({
      method: 'POST',
      url: '/api/admin/notifications',
      headers: authHeader(token),
      payload: { ...payload, scheduledAt: future },
    });
    expect(scheduled.statusCode).toBe(201);
    expect(scheduled.json().delivery).toBeNull();

    await context.db.query(
      `update notifications set scheduled_at = now() - interval '1 second' where id = $1`,
      [scheduled.json().id],
    );
    const processed = await processScheduledNotifications(context.db, context.config);
    expect(processed).toBe(1);

    const notifications = await context.app.inject({
      method: 'GET',
      url: '/api/admin/notifications',
      headers: authHeader(token),
    });
    expect(notifications.statusCode).toBe(200);
    const scheduledRow = notifications
      .json()
      .notifications.find((row: { id: string }) => row.id === scheduled.json().id);
    expect(scheduledRow.status).toBe('sent');
    expect(scheduledRow.failedCount).toBe(1);

    const logs = await context.app.inject({
      method: 'GET',
      url: '/api/admin/logs',
      headers: authHeader(token),
    });
    expect(logs.statusCode).toBe(200);
    expect(logs.json().logs.length).toBeGreaterThanOrEqual(2);
    expect(logs.json().logs[0].error).toBe('BOT_NOT_CONFIGURED');

    const missingTarget = await context.app.inject({
      method: 'POST',
      url: '/api/admin/notifications',
      headers: authHeader(token),
      payload: { ...payload, targetUserId: null },
    });
    expect(missingTarget.statusCode).toBe(400);
    expect(missingTarget.json().error.code).toBe('TARGET_REQUIRED');
  });

  it('creates, fills and publishes a daily IQ test through the admin API', async () => {
    context = await createTestContext();
    const token = await adminLogin(context);
    const authorHeaders = authHeader(token);
    const today = tashkentDateString();

    const created = await context.app.inject({
      method: 'POST',
      url: '/api/admin/iq/tests',
      headers: authorHeaders,
      payload: {
        testDate: today,
        titleUz: 'Kunlik IQ',
        titleRu: 'Ежедневный IQ',
        titleEn: 'Daily IQ',
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().test.status).toBe('draft');
    const testId = created.json().test.id;

    const premature = await context.app.inject({
      method: 'POST',
      url: `/api/admin/iq/tests/${testId}/publish`,
      headers: authorHeaders,
    });
    expect(premature.statusCode).toBe(409);
    expect(premature.json().error.code).toBe('INVALID_TEST');

    for (let index = 1; index <= 10; index++) {
      const question = await context.app.inject({
        method: 'POST',
        url: `/api/admin/iq/tests/${testId}/questions`,
        headers: authorHeaders,
        payload: questionPayload(index),
      });
      expect(question.statusCode).toBe(201);
      expect(question.json().question.options).toHaveLength(4);
    }

    const extra = await context.app.inject({
      method: 'POST',
      url: `/api/admin/iq/tests/${testId}/questions`,
      headers: authorHeaders,
      payload: questionPayload(11),
    });
    expect(extra.statusCode).toBe(409);
    expect(extra.json().error.code).toBe('TOO_MANY_QUESTIONS');

    const published = await context.app.inject({
      method: 'POST',
      url: `/api/admin/iq/tests/${testId}/publish`,
      headers: authorHeaders,
    });
    expect(published.statusCode).toBe(200);
    expect(published.json().test.status).toBe('published');
    expect(published.json().test.questionCount).toBe(10);
    expect(published.json().test.releaseAt).toBeTruthy();

    const user = await createTestUser(context.db, { telegramId: '930000040' });
    const userLogin = await loginAs(context.app, user.telegramId);
    const visible = await context.app.inject({
      method: 'GET',
      url: '/api/iq/today',
      headers: authHeader(userLogin.accessToken),
    });
    expect(visible.statusCode).toBe(200);
    expect(visible.json().test.id).toBe(testId);

    const started = await context.app.inject({
      method: 'POST',
      url: `/api/iq/${testId}/attempt`,
      headers: authHeader(userLogin.accessToken),
    });
    expect(started.statusCode).toBe(200);
    expect(started.json().questions).toHaveLength(10);

    const blockedDelete = await context.app.inject({
      method: 'DELETE',
      url: `/api/admin/iq/tests/${testId}`,
      headers: authorHeaders,
    });
    expect(blockedDelete.statusCode).toBe(409);
    expect(blockedDelete.json().error.code).toBe('TEST_HAS_ATTEMPTS');

    const questions = await context.app.inject({
      method: 'GET',
      url: `/api/admin/iq/tests/${testId}`,
      headers: authorHeaders,
    });
    expect(questions.statusCode).toBe(200);
    expect(questions.json().questions).toHaveLength(10);
    expect(questions.json().questions[0].correctOptionIndex).toBe(1);
  });

  it('enforces the 20-question rule for entrance tests', async () => {
    context = await createTestContext();
    const token = await adminLogin(context);
    const headers = authHeader(token);

    const created = await context.app.inject({
      method: 'POST',
      url: '/api/admin/entrance/tests',
      headers,
      payload: {
        slug: 'math-admission',
        titleUz: 'Matematika',
        titleRu: 'Математика',
        titleEn: 'Mathematics',
        subject: 'Mathematics',
        difficulty: 'medium',
        durationSeconds: 1800,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().test.status).toBe('draft');
    const testId = created.json().test.id;

    const premature = await context.app.inject({
      method: 'POST',
      url: `/api/admin/entrance/tests/${testId}/publish`,
      headers,
    });
    expect(premature.statusCode).toBe(409);
    expect(premature.json().error.code).toBe('INVALID_TEST');

    for (let index = 1; index <= 20; index++) {
      const question = await context.app.inject({
        method: 'POST',
        url: `/api/admin/entrance/tests/${testId}/questions`,
        headers,
        payload: questionPayload(index),
      });
      expect(question.statusCode).toBe(201);
    }

    const extra = await context.app.inject({
      method: 'POST',
      url: `/api/admin/entrance/tests/${testId}/questions`,
      headers,
      payload: questionPayload(21),
    });
    expect(extra.statusCode).toBe(409);
    expect(extra.json().error.code).toBe('TOO_MANY_QUESTIONS');

    const published = await context.app.inject({
      method: 'POST',
      url: `/api/admin/entrance/tests/${testId}/publish`,
      headers,
    });
    expect(published.statusCode).toBe(200);
    expect(published.json().test.status).toBe('published');
    expect(published.json().test.questionCount).toBe(20);

    const duplicateSlug = await context.app.inject({
      method: 'POST',
      url: '/api/admin/entrance/tests',
      headers,
      payload: {
        slug: 'math-admission',
        titleUz: 'Matematika',
        titleRu: 'Математика',
        titleEn: 'Mathematics',
        subject: 'Mathematics',
        difficulty: 'medium',
        durationSeconds: 1800,
      },
    });
    expect(duplicateSlug.statusCode).toBe(409);
    expect(duplicateSlug.json().error.code).toBe('SLUG_TAKEN');
  });
});
