import { afterEach, describe, expect, it } from 'vitest';
import { createTestContext, createTestUser, type TestContext } from './helpers';

const BOT_TOKEN = '123456:TEST-BOT-TOKEN';

let context: TestContext | null = null;

afterEach(async () => {
  if (context) {
    await context.close();
    context = null;
  }
});

function secret(token = BOT_TOKEN): Record<string, string> {
  return { 'x-bot-secret': token };
}

describe('Internal bot API', () => {
  it('rejects requests without the bot secret', async () => {
    context = await createTestContext({ TELEGRAM_BOT_TOKEN: BOT_TOKEN });

    const anonymous = await context.app.inject({
      method: 'GET',
      url: '/api/internal/bot/users/700100200',
    });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json().error.code).toBe('BOT_UNAUTHORIZED');

    const wrong = await context.app.inject({
      method: 'GET',
      url: '/api/internal/bot/users/700100200',
      headers: secret('wrong-token'),
    });
    expect(wrong.statusCode).toBe(401);
  });

  it('reports 503 when the bot token is not configured', async () => {
    context = await createTestContext();
    const response = await context.app.inject({
      method: 'GET',
      url: '/api/internal/bot/users/700100200',
      headers: secret(),
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('BOT_NOT_CONFIGURED');
  });

  it('runs the registration flow with state, nickname checks and language updates', async () => {
    context = await createTestContext({ TELEGRAM_BOT_TOKEN: BOT_TOKEN });
    const headers = secret();
    const telegramId = '700100201';

    const initial = await context.app.inject({
      method: 'GET',
      url: `/api/internal/bot/users/${telegramId}`,
      headers,
    });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toEqual({ registered: false, profile: null, state: null });

    const state = await context.app.inject({
      method: 'PUT',
      url: `/api/internal/bot/users/${telegramId}/state`,
      headers,
      payload: { step: 'nickname', language: 'uz', nickname: null },
    });
    expect(state.statusCode).toBe(200);

    const withState = await context.app.inject({
      method: 'GET',
      url: `/api/internal/bot/users/${telegramId}`,
      headers,
    });
    expect(withState.json().state).toEqual({ step: 'nickname', language: 'uz', nickname: null });

    await createTestUser(context.db, { telegramId: '700100202', nickname: 'taken_name' });

    const taken = await context.app.inject({
      method: 'GET',
      url: `/api/internal/bot/users/${telegramId}/nickname?nickname=taken_name`,
      headers,
    });
    expect(taken.statusCode).toBe(200);
    expect(taken.json().available).toBe(false);

    const free = await context.app.inject({
      method: 'GET',
      url: `/api/internal/bot/users/${telegramId}/nickname?nickname=fresh_name`,
      headers,
    });
    expect(free.json().available).toBe(true);

    const register = await context.app.inject({
      method: 'POST',
      url: `/api/internal/bot/users/${telegramId}/register`,
      headers,
      payload: {
        nickname: 'fresh_name',
        language: 'uz',
        phone: '+998901234567',
        username: 'fresh',
        firstName: 'Fresh',
        lastName: 'User',
      },
    });
    expect(register.statusCode).toBe(201);
    const profile = register.json().profile;
    expect(profile.nickname).toBe('fresh_name');
    expect(profile.language).toBe('uz');
    expect(profile.coinsBalance).toBe(0);
    expect(profile.iqCompleted).toBe(0);
    expect(profile.entranceCompleted).toBe(0);
    expect(profile.phone).toBeUndefined();

    const stored = await context.db.query<{ phone: string; is_dev: boolean }>(
      'select phone, is_dev from profiles where telegram_id = $1',
      [telegramId],
    );
    expect(stored[0].phone).toBe('+998901234567');
    expect(stored[0].is_dev).toBe(false);

    const afterRegister = await context.app.inject({
      method: 'GET',
      url: `/api/internal/bot/users/${telegramId}`,
      headers,
    });
    expect(afterRegister.json().registered).toBe(true);
    expect(afterRegister.json().state).toBeNull();
    expect(afterRegister.json().profile.nickname).toBe('fresh_name');

    const duplicate = await context.app.inject({
      method: 'POST',
      url: `/api/internal/bot/users/${telegramId}/register`,
      headers,
      payload: { nickname: 'another_name', language: 'uz', phone: '+998901234567' },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('ALREADY_REGISTERED');

    const otherWithTakenNickname = await context.app.inject({
      method: 'POST',
      url: '/api/internal/bot/users/700100203/register',
      headers,
      payload: { nickname: 'taken_name', language: 'ru', phone: '+998907654321' },
    });
    expect(otherWithTakenNickname.statusCode).toBe(409);
    expect(otherWithTakenNickname.json().error.code).toBe('NICKNAME_TAKEN');

    const language = await context.app.inject({
      method: 'PATCH',
      url: `/api/internal/bot/users/${telegramId}/language`,
      headers,
      payload: { language: 'ru' },
    });
    expect(language.statusCode).toBe(200);
    expect(language.json().profile.language).toBe('ru');

    const invalidPhone = await context.app.inject({
      method: 'POST',
      url: '/api/internal/bot/users/700100204/register',
      headers,
      payload: { nickname: 'phone_test', language: 'en', phone: 'abc' },
    });
    expect(invalidPhone.statusCode).toBe(400);
    expect(invalidPhone.json().error.code).toBe('VALIDATION_ERROR');

    const clear = await context.app.inject({
      method: 'DELETE',
      url: `/api/internal/bot/users/${telegramId}/state`,
      headers,
    });
    expect(clear.statusCode).toBe(200);
  });
});
