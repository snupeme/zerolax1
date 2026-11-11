import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import {
  findProfileById,
  getProfileStats,
  isNicknameTaken,
  type Db,
} from '@zerolax/db';
import {
  supportRequestSchema,
  updateProfileSchema,
  type Gift,
  type InboxNotification,
  type SupportRequest,
} from '@zerolax/shared';
import type { AppConfig } from '../config';
import { ApiError } from '../errors';
import {
  mapCoinTransaction,
  mapProfile,
  mapStats,
  toIso,
} from '../serializers';
import { getIqHistory } from '../services/iq';
import { getEntranceHistory } from '../services/entrance';
import { localizeText } from '../localize';

interface Options {
  config: AppConfig;
  db: Db;
  userGuard: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

interface GiftRow {
  id: string;
  title_uz: string;
  title_ru: string;
  title_en: string;
  description_uz: string | null;
  description_ru: string | null;
  description_en: string | null;
  price: number;
  image_url: string | null;
  status: 'active' | 'inactive';
}

interface SupportRow {
  id: string;
  subject: string;
  message: string;
  status: SupportRequest['status'];
  admin_reply: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export const userRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  const { db } = options;
  app.addHook('preHandler', options.userGuard);

  app.get('/me', async (request) => {
    const profile = request.profile!;
    const stats = await getProfileStats(db, profile.id);
    const [unread] = await db.query<{ count: number }>(
      'select count(*)::int as count from user_notifications where user_id = $1 and read_at is null',
      [profile.id],
    );

    const iqHistory = await getIqHistory(db, profile);
    const entranceHistory = await getEntranceHistory(db, profile);

    return {
      profile: mapProfile(profile),
      stats: mapStats(stats, profile.language),
      unreadNotifications: Number(unread?.count ?? 0),
      recentIq: iqHistory.slice(0, 5),
      recentEntrance: entranceHistory.slice(0, 5),
    };
  });

  app.patch('/me', async (request) => {
    const profile = request.profile!;
    const body = updateProfileSchema.parse(request.body);

    if (body.nickname && body.nickname !== profile.nickname) {
      if (await isNicknameTaken(db, body.nickname, profile.id)) {
        throw new ApiError(409, 'NICKNAME_TAKEN', 'This nickname is already taken');
      }
    }

    await db.query(
      `update profiles
          set nickname = coalesce($1, nickname),
              language = coalesce($2, language),
              notification_prefs = coalesce($3::jsonb, notification_prefs),
              updated_at = now()
        where id = $4`,
      [
        body.nickname ?? null,
        body.language ?? null,
        body.notificationPrefs ? JSON.stringify(body.notificationPrefs) : null,
        profile.id,
      ],
    );

    const fresh = await findProfileById(db, profile.id);
    if (!fresh) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Profile not found');
    return { profile: mapProfile(fresh) };
  });

  app.get('/me/coins', async (request) => {
    const profile = request.profile!;
    const rows = await db.query<{
      id: string;
      amount: number;
      type: string;
      description: string | null;
      balance_after: number | null;
      created_at: string | Date;
    }>(
      `select id, amount, type, description, balance_after, created_at
         from coin_transactions
        where user_id = $1
        order by created_at desc
        limit 100`,
      [profile.id],
    );
    return { transactions: rows.map(mapCoinTransaction) };
  });

  app.get('/me/history', async (request) => {
    const profile = request.profile!;
    return {
      iq: await getIqHistory(db, profile),
      entrance: await getEntranceHistory(db, profile),
    };
  });

  app.get('/notifications', async (request) => {
    const profile = request.profile!;
    const rows = await db.query<{
      id: string;
      title: string;
      body: string;
      read_at: string | Date | null;
      created_at: string | Date;
    }>(
      `select id, title, body, read_at, created_at
         from user_notifications
        where user_id = $1
        order by created_at desc
        limit 50`,
      [profile.id],
    );

    const notifications: InboxNotification[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      readAt: toIso(row.read_at),
      createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    }));

    return {
      notifications,
      unread: notifications.filter((notification) => !notification.readAt).length,
    };
  });

  app.post('/notifications/:id/read', async (request) => {
    const profile = request.profile!;
    const { id } = request.params as { id: string };
    await db.query(
      `update user_notifications set read_at = now()
        where id = $1 and user_id = $2 and read_at is null`,
      [id, profile.id],
    );
    return { ok: true };
  });

  app.post('/notifications/read-all', async (request) => {
    const profile = request.profile!;
    await db.query(
      'update user_notifications set read_at = now() where user_id = $1 and read_at is null',
      [profile.id],
    );
    return { ok: true };
  });

  app.get('/gifts', async (request) => {
    const profile = request.profile!;
    const rows = await db.query<GiftRow>(
      `select id, title_uz, title_ru, title_en, description_uz, description_ru, description_en,
              price, image_url, status
         from gifts where status = 'active'
        order by price asc`,
    );

    const gifts: Gift[] = rows.map((row) => ({
      id: row.id,
      title: localizeText(row as unknown as Record<string, unknown>, 'title', profile.language),
      description:
        localizeText(row as unknown as Record<string, unknown>, 'description', profile.language) ||
        null,
      price: Number(row.price),
      imageUrl: row.image_url,
      status: row.status,
    }));

    return { gifts };
  });

  app.get('/support', async (request) => {
    const profile = request.profile!;
    const rows = await db.query<SupportRow>(
      `select id, subject, message, status, admin_reply, created_at, updated_at
         from support_requests where user_id = $1
        order by created_at desc limit 50`,
      [profile.id],
    );

    const requests: SupportRequest[] = rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      message: row.message,
      status: row.status,
      adminReply: row.admin_reply,
      createdAt: toIso(row.created_at) ?? new Date().toISOString(),
      updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
    }));

    return { requests };
  });

  app.post('/support', async (request, reply) => {
    const profile = request.profile!;
    const body = supportRequestSchema.parse(request.body);
    const rows = await db.query<SupportRow>(
      `insert into support_requests (user_id, subject, message)
       values ($1, $2, $3)
       returning id, subject, message, status, admin_reply, created_at, updated_at`,
      [profile.id, body.subject, body.message],
    );
    reply.status(201);
    return {
      request: {
        id: rows[0].id,
        subject: rows[0].subject,
        message: rows[0].message,
        status: rows[0].status,
        adminReply: rows[0].admin_reply,
        createdAt: toIso(rows[0].created_at),
        updatedAt: toIso(rows[0].updated_at),
      },
    };
  });
};
