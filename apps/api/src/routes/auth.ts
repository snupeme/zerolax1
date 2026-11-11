import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createProfile,
  findProfileByNickname,
  findProfileByTelegramId,
  isNicknameTaken,
  type Db,
  type ProfileRow,
} from '@zerolax/db';
import type { AppConfig } from '../config';
import { ApiError } from '../errors';
import { verifyTelegramInitData } from '../auth/telegram';
import {
  hashToken,
  newRefreshToken,
  signUserAccessToken,
} from '../auth/tokens';
import { mapProfile } from '../serializers';
import { devLoginSchema } from '@zerolax/shared';

interface Options {
  config: AppConfig;
  db: Db;
}

const telegramSchema = z.object({
  initData: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(20).optional(),
});

interface SessionProfileRow extends ProfileRow {
  session_id: string;
  session_expires_at: string | Date;
  session_revoked_at: string | Date | null;
  profile_status: 'active' | 'blocked';
}

async function issueSession(
  db: Db,
  config: AppConfig,
  profile: ProfileRow,
  userAgent?: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const refresh = newRefreshToken();
  const expiresAt = new Date(
    Date.now() + config.refreshTtlDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  await db.query(
    `insert into user_sessions (user_id, refresh_token_hash, user_agent, expires_at)
     values ($1, $2, $3, $4)`,
    [profile.id, refresh.hash, userAgent ?? null, expiresAt],
  );

  const accessToken = await signUserAccessToken(config, profile);
  return { accessToken, refreshToken: refresh.token, expiresIn: config.accessTtlSeconds };
}

export const authRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  const { db, config } = options;

  app.post('/telegram', async (request) => {
    const body = telegramSchema.parse(request.body);
    if (!config.botToken) {
      throw new ApiError(503, 'BOT_NOT_CONFIGURED', 'Telegram bot token is not configured');
    }

    let verified:ReturnType<typeof verifyTelegramInitData>;
    try{
      verified=verifyTelegramInitData(body.initData, config.botToken, {maxAgeSeconds:config.telegramAuthMaxAgeSeconds});
    }catch(error){
      request.log.warn({code:error instanceof ApiError?error.code:'AUTH_ERROR',hasSignature:new URLSearchParams(body.initData).has('signature')},'Telegram authentication rejected');
      throw error;
    }
    const {user}=verified;

    const profile = await findProfileByTelegramId(db, user.id);
    if (!profile) {
      throw new ApiError(
        409,
        'REGISTRATION_REQUIRED',
        'Please complete registration in the Telegram bot first',
        { botUsername: config.botUsername },
      );
    }
    if (profile.status === 'blocked') {
      throw new ApiError(403, 'ACCOUNT_BLOCKED', 'Your account is blocked');
    }

    await db.query(
      `update profiles
          set telegram_username = $1, first_name = $2, last_name = $3,
              avatar_url = coalesce($4, avatar_url), updated_at = now()
        where id = $5`,
      [
        user.username ?? null,
        user.first_name ?? null,
        user.last_name ?? null,
        user.photo_url ?? null,
        profile.id,
      ],
    );

    const tokens = await issueSession(db, config, profile, request.headers['user-agent']);

    return {
      ...tokens,
      profile: mapProfile(profile),
    };
  });

  app.post('/dev', async (request) => {
    if (!config.devAuthEnabled) {
      throw new ApiError(403, 'DEV_AUTH_DISABLED', 'Development authentication is disabled');
    }

    const body = devLoginSchema.parse(request.body ?? {});
    const telegramId = body.telegramId ?? '900000001';
    let profile = await findProfileByTelegramId(db, telegramId);

    if (!profile) {
      let nickname = body.nickname?.trim() || 'Demo User';
      if (await isNicknameTaken(db, nickname)) {
        nickname = `${nickname.slice(0, 15)}${Math.floor(1000 + Math.random() * 9000)}`;
      }
      if (await isNicknameTaken(db, nickname)) {
        throw new ApiError(409, 'NICKNAME_TAKEN', 'Nickname is taken');
      }
      profile = await createProfile(db, {
        telegramId,
        nickname,
        language: body.language ?? 'uz',
        firstName: 'Demo',
        lastName: 'User',
        isDev: true,
      });
    } else {
      if (profile.status === 'blocked') {
        throw new ApiError(403, 'ACCOUNT_BLOCKED', 'This account is blocked');
      }
      const existingByNickname = body.nickname
        ? await findProfileByNickname(db, body.nickname)
        : null;
      if (existingByNickname && existingByNickname.id !== profile.id) {
        throw new ApiError(409, 'NICKNAME_TAKEN', 'Nickname is taken');
      }
      await db.query(
        `update profiles
            set nickname = coalesce($1, nickname),
                language = coalesce($2, language),
                updated_at = now()
          where id = $3`,
        [body.nickname?.trim() ?? null, body.language ?? null, profile.id],
      );
      profile = await findProfileByTelegramId(db, telegramId);
      if (!profile) throw new ApiError(500, 'PROFILE_ERROR', 'Could not load the profile');
    }

    const tokens = await issueSession(db, config, profile, request.headers['user-agent']);
    return { ...tokens, profile: mapProfile(profile) };
  });

  app.post('/refresh', async (request) => {
    const body = refreshSchema.parse(request.body);
    const hash = hashToken(body.refreshToken);

    const rows = await db.query<SessionProfileRow>(
      `select s.id as session_id, s.expires_at as session_expires_at,
              s.revoked_at as session_revoked_at, p.status as profile_status,
              p.*
         from user_sessions s
         join profiles p on p.id = s.user_id
        where s.refresh_token_hash = $1`,
      [hash],
    );
    const row = rows[0];
    if (!row || row.session_revoked_at) {
      throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token');
    }
    if (new Date(row.session_expires_at).getTime() <= Date.now()) {
      throw new ApiError(401, 'REFRESH_TOKEN_EXPIRED', 'Refresh token has expired');
    }
    if (row.profile_status === 'blocked') {
      throw new ApiError(403, 'ACCOUNT_BLOCKED', 'Your account is blocked');
    }

    await db.query('update user_sessions set revoked_at = now() where id = $1', [row.session_id]);
    const profile = row as unknown as ProfileRow;
    const tokens = await issueSession(db, config, profile, request.headers['user-agent']);
    return { ...tokens, profile: mapProfile(profile) };
  });

  app.post('/logout', async (request) => {
    const body = logoutSchema.parse(request.body ?? {});
    if (body.refreshToken) {
      await db.query(
        'update user_sessions set revoked_at = now() where refresh_token_hash = $1 and revoked_at is null',
        [hashToken(body.refreshToken)],
      );
    }
    return { ok: true };
  });
};
