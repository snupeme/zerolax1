import { afterEach, describe, expect, it } from 'vitest';
import {createHmac} from 'node:crypto';
import { verifyTelegramInitData } from '../src/auth/telegram';
import {
  authHeader,
  createTestContext,
  createTestUser,
  loginAs,
  signTelegramInitData,
  type TestContext,
} from './helpers';

const BOT_TOKEN = '123456:TEST-BOT-TOKEN';
const USER = {
  id: 700100200,
  first_name: 'Aziz',
  last_name: 'Karimov',
  username: 'aziz_test',
  language_code: 'uz',
};

let context: TestContext | null = null;

afterEach(async () => {
  if (context) {
    await context.close();
    context = null;
  }
});

describe('Telegram initData verification', () => {
  it('accepts modern initData with signature and rejects signature tampering',()=>{
    const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),query_id:'real-format-query',user:JSON.stringify(USER),signature:'telegram-ed25519-signature-field'});
    const check=[...params.entries()].sort(([a],[b])=>a.localeCompare(b,'en')).map(([key,value])=>key+'='+value).join('\n');
    const key=createHmac('sha256','WebAppData').update(BOT_TOKEN).digest();
    params.set('hash',createHmac('sha256',key).update(check).digest('hex'));
    expect(verifyTelegramInitData(params.toString(),BOT_TOKEN).user.id).toBe(USER.id);
    params.set('signature','changed-by-attacker');
    expect(()=>verifyTelegramInitData(params.toString(),BOT_TOKEN)).toThrow(/signature is invalid/);
  });
  it('accepts a correctly signed payload', () => {
    const authDate = Math.floor(Date.now() / 1000);
    const initData = signTelegramInitData(BOT_TOKEN, USER, authDate);
    const verified = verifyTelegramInitData(initData, BOT_TOKEN);
    expect(verified.user.id).toBe(USER.id);
    expect(verified.user.username).toBe('aziz_test');
    expect(verified.authDate).toBe(authDate);
  });

  it('rejects a tampered payload', () => {
    const authDate = Math.floor(Date.now() / 1000);
    const initData = signTelegramInitData(BOT_TOKEN, USER, authDate).replace(
      'aziz_test',
      'attacker',
    );
    expect(() => verifyTelegramInitData(initData, BOT_TOKEN)).toThrowError(
      /signature is invalid/,
    );
  });

  it('rejects stale authentication data', () => {
    const authDate = Math.floor(Date.now() / 1000) - 3600;
    const initData = signTelegramInitData(BOT_TOKEN, USER, authDate);
    expect(() =>
      verifyTelegramInitData(initData, BOT_TOKEN, { maxAgeSeconds: 300 }),
    ).toThrowError(/expired/);
  });

  it('rejects authentication data from the future', () => {
    const authDate = Math.floor(Date.now() / 1000) + 3600;
    const initData = signTelegramInitData(BOT_TOKEN, USER, authDate);
    expect(() => verifyTelegramInitData(initData, BOT_TOKEN)).toThrowError(/future/);
  });

  it('requires a configured bot token', () => {
    const initData = signTelegramInitData(BOT_TOKEN, USER, Math.floor(Date.now() / 1000));
    expect(() => verifyTelegramInitData(initData, '')).toThrowError(/not configured/);
  });
});

describe('Telegram Mini App authentication', () => {
  it('authenticates a registered Telegram user end to end', async () => {
    context = await createTestContext({ TELEGRAM_BOT_TOKEN: BOT_TOKEN });
    const profile = await createTestUser(context.db, {
      telegramId: String(USER.id),
      nickname: 'aziz',
    });

    const initData = signTelegramInitData(BOT_TOKEN, USER, Math.floor(Date.now() / 1000));
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      payload: { initData },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.profile.id).toBe(profile.id);
    expect(body.profile).not.toHaveProperty('telegramId');

    const me = await context.app.inject({
      method: 'GET',
      url: '/api/user/me',
      headers: authHeader(body.accessToken),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().profile.nickname).toBe('aziz');
  });

  it('rejects signed initData for an unregistered Telegram user', async () => {
    context = await createTestContext({ TELEGRAM_BOT_TOKEN: BOT_TOKEN });
    const initData = signTelegramInitData(
      BOT_TOKEN,
      { ...USER, id: 700999888 },
      Math.floor(Date.now() / 1000),
    );
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      payload: { initData },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('REGISTRATION_REQUIRED');
  });

  it('rejects unsigned initData', async () => {
    context = await createTestContext({ TELEGRAM_BOT_TOKEN: BOT_TOKEN });
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      payload: { initData: 'auth_date=1&user=%7B%22id%22%3A1%7D&hash=deadbeef' },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('Development sessions', () => {
  it('creates a dev session, rotates refresh tokens and logs out', async () => {
    context = await createTestContext();
    const user = await createTestUser(context.db, { telegramId: '900000123' });
    const login = await loginAs(context.app, user.telegramId);

    const me = await context.app.inject({
      method: 'GET',
      url: '/api/user/me',
      headers: authHeader(login.accessToken),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().profile.id).toBe(user.id);

    const refreshed = await context.app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: login.refreshToken },
    });
    expect(refreshed.statusCode).toBe(200);
    const rotated = refreshed.json();
    expect(rotated.refreshToken).not.toBe(login.refreshToken);

    const reused = await context.app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: login.refreshToken },
    });
    expect(reused.statusCode).toBe(401);

    const logout = await context.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      payload: { refreshToken: rotated.refreshToken },
    });
    expect(logout.statusCode).toBe(200);

    const afterLogout = await context.app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: rotated.refreshToken },
    });
    expect(afterLogout.statusCode).toBe(401);
  });

  it('disables development authentication when configured off', async () => {
    context = await createTestContext({ DEV_AUTH_ENABLED: 'false' });
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/auth/dev',
      payload: {},
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('DEV_AUTH_DISABLED');
  });

  it('never exposes the stored phone number to the user API', async () => {
    context = await createTestContext();
    const user = await createTestUser(context.db, { telegramId: '900000456' });
    await context.db.query('update profiles set phone = $1 where id = $2', [
      '+998901112233',
      user.id,
    ]);
    const login = await loginAs(context.app, user.telegramId);
    const me = await context.app.inject({
      method: 'GET',
      url: '/api/user/me',
      headers: authHeader(login.accessToken),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().profile.phone).toBeNull();
  });

  it('rejects requests without a valid access token', async () => {
    context = await createTestContext();
    const noToken = await context.app.inject({ method: 'GET', url: '/api/user/me' });
    expect(noToken.statusCode).toBe(401);

    const badToken = await context.app.inject({
      method: 'GET',
      url: '/api/user/me',
      headers: authHeader('not-a-real-token'),
    });
    expect(badToken.statusCode).toBe(401);
  });
});
