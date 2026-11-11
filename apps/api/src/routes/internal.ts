import type { FastifyPluginAsync } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  clearBotState,
  createProfile,
  findProfileByTelegramId,
  getBotState,
  getProfileStats,
  isNicknameTaken,
  setBotState,
  setProfileLanguage,
  type Db,
} from '@zerolax/db';
import {
  languageSchema,
  nicknameSchema,
  type Language,
} from '@zerolax/shared';
import type { AppConfig } from '../config';
import { ApiError } from '../errors';

interface Options {
  config: AppConfig;
  db: Db;
}

const telegramIdSchema = z.string().regex(/^\d{5,20}$/);

const stateSchema = z.object({
  step: z.enum(['language', 'nickname', 'phone']),
  language: languageSchema.optional().nullable(),
  nickname: z.string().trim().max(64).optional().nullable(),
});

const registerSchema = z.object({
  nickname: nicknameSchema,
  language: languageSchema,
  phone: z.string().trim().regex(/^\+?[0-9]{7,15}$/),
  username: z.string().trim().max(64).optional().nullable(),
  firstName: z.string().trim().max(128).optional().nullable(),
  lastName: z.string().trim().max(128).optional().nullable(),
});

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface BotProfileView {
  id: string;
  telegramId: string;
  nickname: string;
  language: Language;
  coinsBalance: number;
  status: 'active' | 'blocked';
  iqCompleted: number;
  entranceCompleted: number;
}

async function profileView(db: Db, profile: NonNullable<Awaited<ReturnType<typeof findProfileByTelegramId>>>): Promise<BotProfileView> {
  const stats = await getProfileStats(db, profile.id);
  return {
    id: profile.id,
    telegramId: String(profile.telegram_id),
    nickname: profile.nickname,
    language: profile.language,
    coinsBalance: Number(profile.coins_balance),
    status: profile.status,
    iqCompleted: Number(stats.iq_completed),
    entranceCompleted: Number(stats.entrance_completed),
  };
}

/**
 * Server-to-server endpoints used by the Telegram bot for registration and
 * profile commands. They are authenticated with the bot token, which never
 * reaches the browser or the Mini App bundle.
 */
export const internalBotRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  const { db, config } = options;

  app.addHook('preHandler', async (request) => {
    if (!config.botToken) {
      throw new ApiError(503, 'BOT_NOT_CONFIGURED', 'Telegram bot token is not configured');
    }
    const header = request.headers['x-bot-secret'];
    const secret = Array.isArray(header) ? header[0] : header;
    if (!secret || !safeEqual(secret, config.botToken)) {
      throw new ApiError(401, 'BOT_UNAUTHORIZED', 'Invalid bot secret');
    }
  });

  app.get('/users/:telegramId', async (request) => {
    const telegramId = telegramIdSchema.parse((request.params as { telegramId: string }).telegramId);
    const profile = await findProfileByTelegramId(db, telegramId);
    if (!profile) {
      const state = await getBotState(db, telegramId);
      return {
        registered: false,
        profile: null,
        state: state
          ? {
              step: state.step,
              language: state.language ?? null,
              nickname: state.nickname ?? null,
            }
          : null,
      };
    }
    return { registered: true, profile: await profileView(db, profile), state: null };
  });

  app.get('/users/:telegramId/nickname', async (request) => {
    const telegramId = telegramIdSchema.parse((request.params as { telegramId: string }).telegramId);
    const query = request.query as { nickname?: string };
    const nickname = nicknameSchema.parse(query.nickname ?? '');
    const profile = await findProfileByTelegramId(db, telegramId);
    const taken = await isNicknameTaken(db, nickname, profile?.id);
    return { available: !taken, nickname };
  });

  app.put('/users/:telegramId/state', async (request) => {
    const telegramId = telegramIdSchema.parse((request.params as { telegramId: string }).telegramId);
    const body = stateSchema.parse(request.body);
    await setBotState(db, telegramId, body);
    return { ok: true };
  });

  app.delete('/users/:telegramId/state', async (request) => {
    const telegramId = telegramIdSchema.parse((request.params as { telegramId: string }).telegramId);
    await clearBotState(db, telegramId);
    return { ok: true };
  });

  app.post('/users/:telegramId/register', async (request, reply) => {
    const telegramId = telegramIdSchema.parse((request.params as { telegramId: string }).telegramId);
    const body = registerSchema.parse(request.body);

    const existing = await findProfileByTelegramId(db, telegramId);
    if (existing) {
      throw new ApiError(409, 'ALREADY_REGISTERED', 'This Telegram account is already registered');
    }
    if (await isNicknameTaken(db, body.nickname)) {
      throw new ApiError(409, 'NICKNAME_TAKEN', 'This nickname is already taken');
    }

    let profile;
    try {
      profile = await createProfile(db, {
        telegramId,
        nickname: body.nickname,
        language: body.language,
        phone: body.phone,
        username: body.username ?? null,
        firstName: body.firstName ?? null,
        lastName: body.lastName ?? null,
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        const raced = await findProfileByTelegramId(db, telegramId);
        if (raced) {
          throw new ApiError(409, 'ALREADY_REGISTERED', 'This Telegram account is already registered');
        }
        throw new ApiError(409, 'NICKNAME_TAKEN', 'This nickname is already taken');
      }
      throw error;
    }

    await clearBotState(db, telegramId);
    reply.status(201);
    return { profile: await profileView(db, profile) };
  });

  app.patch('/users/:telegramId/language', async (request) => {
    const telegramId = telegramIdSchema.parse((request.params as { telegramId: string }).telegramId);
    const body = z.object({ language: languageSchema }).parse(request.body);

    const profile = await findProfileByTelegramId(db, telegramId);
    if (!profile) {
      throw new ApiError(404, 'USER_NOT_FOUND', 'Registration required');
    }
    await setProfileLanguage(db, profile.id, body.language);
    const fresh = await findProfileByTelegramId(db, telegramId);
    if (!fresh) throw new ApiError(404, 'USER_NOT_FOUND', 'Registration required');
    return { profile: await profileView(db, fresh) };
  });
};
