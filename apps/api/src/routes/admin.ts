import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  awardAchievements,
  creditCoins,
  getProfileStats,
  type Db,
} from '@zerolax/db';
import {
  addDaysToDateString,
  coinAdjustmentSchema,
  entranceTestInputSchema,
  iqTestInputSchema,
  notificationInputSchema,
  percentage,
  questionInputSchema,
  tashkentDateString,
  tashkentDayStartUtc,
  tashkentPublishInstant,
  type AdminAuditLog,
  type AdminEntranceTest,
  type AdminIqTest,
  type AdminNotificationRow,
  type AdminOverview,
  type AdminTestQuestion,
  type AdminUserRow,
  type DeliveryLog,
  type Language,
} from '@zerolax/shared';
import type { AppConfig } from '../config';
import { ApiError } from '../errors';
import {
  adminLoginSchema,
} from '@zerolax/shared';
import {
  bootstrapAdmin,
  recordAudit,
  verifyPassword,
} from '../services/admin';
import { hashPassword } from '../services/admin';
import { signAdminAccessToken } from '../auth/tokens';
import { mapCoinTransaction, mapProfile, mapStats, toIso } from '../serializers';
import { localizeText } from '../localize';
import { getIqHistory } from '../services/iq';
import { getEntranceHistory } from '../services/entrance';
import { publishIqTest } from '../services/iq';
import { sendAnnouncement } from '../services/notifications';
import { canAdmin, requirePermission } from '../services/admin-control';

interface Options {
  config: AppConfig;
  db: Db;
  adminGuard: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

const statusSchema = z.object({ status: z.enum(['active', 'blocked']) });
const idSchema = z.string().uuid();

interface AdminTestRow {
  id: string;
  test_date: string;
  title_uz: string;
  title_ru: string;
  title_en: string;
  status: AdminIqTest['status'];
  publish_at: string | Date;
  published_at: string | Date | null;
  release_at: string | Date | null;
  question_count: number;
}

interface EntranceRow {
  id: string;
  slug: string;
  title_uz: string;
  title_ru: string;
  title_en: string;
  description_uz: string | null;
  description_ru: string | null;
  description_en: string | null;
  subject: string;
  difficulty: AdminEntranceTest['difficulty'];
  duration_seconds: number;
  status: AdminEntranceTest['status'];
  published_at: string | Date | null;
  question_count: number;
}

function mapIqTest(row: AdminTestRow): AdminIqTest {
  return {
    id: row.id,
    testDate: row.test_date,
    titleUz: row.title_uz,
    titleRu: row.title_ru,
    titleEn: row.title_en,
    status: row.status,
    publishAt: toIso(row.publish_at) ?? new Date().toISOString(),
    publishedAt: toIso(row.published_at),
    releaseAt: toIso(row.release_at),
    questionCount: Number(row.question_count),
  };
}

function mapEntranceTest(row: EntranceRow): AdminEntranceTest {
  return {
    id: row.id,
    slug: row.slug,
    titleUz: row.title_uz,
    titleRu: row.title_ru,
    titleEn: row.title_en,
    descriptionUz: row.description_uz,
    descriptionRu: row.description_ru,
    descriptionEn: row.description_en,
    subject: row.subject,
    difficulty: row.difficulty,
    durationSeconds: Number(row.duration_seconds),
    status: row.status,
    questionCount: Number(row.question_count),
    publishedAt: toIso(row.published_at),
  };
}

const IQ_TEST_SELECT = `
  select t.id, t.test_date::text as test_date, t.title_uz, t.title_ru, t.title_en,
         t.status, t.publish_at, t.published_at, t.release_at,
         (select count(*) from iq_questions q where q.test_id = t.id)::int as question_count
    from daily_iq_tests t
`;

const ENTRANCE_SELECT = `
  select t.id, t.slug, t.title_uz, t.title_ru, t.title_en,
         t.description_uz, t.description_ru, t.description_en,
         t.subject, t.difficulty, t.duration_seconds, t.status, t.published_at,
         (select count(*) from entrance_questions q where q.test_id = t.id)::int as question_count
    from entrance_tests t
`;

interface AdminQuestionRow {
  id: string;
  test_id: string;
  position: number;
  text_uz: string;
  text_ru: string;
  text_en: string;
  explanation_uz: string | null;
  explanation_ru: string | null;
  explanation_en: string | null;
  difficulty: AdminTestQuestion['difficulty'];
  coins: number;
  image_url: string | null;
  correct_option_index: number;
}

interface AdminOptionRow {
  id: string;
  question_id: string;
  position: number;
  text_uz: string;
  text_ru: string;
  text_en: string;
}

function mapAdminQuestions(
  questions: AdminQuestionRow[],
  options: AdminOptionRow[],
): AdminTestQuestion[] {
  const grouped = new Map<string, AdminOptionRow[]>();
  for (const option of options) {
    const list = grouped.get(option.question_id) ?? [];
    list.push(option);
    grouped.set(option.question_id, list);
  }

  return questions.map((question) => ({
    id: question.id,
    testId: question.test_id,
    position: Number(question.position),
    textUz: question.text_uz,
    textRu: question.text_ru,
    textEn: question.text_en,
    explanationUz: question.explanation_uz,
    explanationRu: question.explanation_ru,
    explanationEn: question.explanation_en,
    difficulty: question.difficulty,
    coins: Number(question.coins),
    imageUrl: question.image_url,
    correctOptionIndex: Number(question.correct_option_index),
    options: (grouped.get(question.id) ?? [])
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((option) => ({
        id: option.id,
        position: Number(option.position),
        textUz: option.text_uz,
        textRu: option.text_ru,
        textEn: option.text_en,
      })),
  }));
}

async function loadQuestions(
  db: Db,
  kind: 'iq' | 'entrance',
  testId: string,
): Promise<AdminTestQuestion[]> {
  const questionTable = kind === 'iq' ? 'iq_questions' : 'entrance_questions';
  const optionTable = kind === 'iq' ? 'iq_question_options' : 'entrance_question_options';

  const questions = await db.query<AdminQuestionRow>(
    `select * from ${questionTable} where test_id = $1 order by position`,
    [testId],
  );
  const options = await db.query<AdminOptionRow>(
    `select o.* from ${optionTable} o
       join ${questionTable} q on q.id = o.question_id
      where q.test_id = $1 order by o.question_id, o.position`,
    [testId],
  );
  return mapAdminQuestions(questions, options);
}

export const adminRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  const { db, config } = options;
  const secure = { preHandler: options.adminGuard };

  await bootstrapAdmin(db, config);

  app.post('/auth/login', {config:{rateLimit:{max:10,timeWindow:'1 minute'}}}, async (request) => {
    const body = adminLoginSchema.parse(request.body);
    const rows = await db.query<{
      id: string;
      email: string;
      name: string;
      role: string;
      status: string;
      password_hash: string;
    }>(
      `select id, email, name, role, status, password_hash
         from admin_users where lower(email) = lower($1)`,
      [body.email],
    );
    const admin = rows[0];
    if (!admin || admin.status !== 'active' || !verifyPassword(body.password, admin.password_hash)) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    await db.query('update admin_users set last_login_at = now() where id = $1', [admin.id]);
    await recordAudit(db, {
      adminId: admin.id,
      action: 'admin.login',
      entityType: 'admin_user',
      entityId: admin.id,
    });

    const accessToken = await signAdminAccessToken(config, admin);
    return {
      accessToken,
      expiresIn: config.accessTtlSeconds,
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    };
  });

  app.get('/overview', secure, async (): Promise<AdminOverview> => {
    const today = tashkentDateString();
    const todayStart = tashkentDayStartUtc(today).toISOString();
    const seriesStart = addDaysToDateString(today, -13);
    const seriesStartUtc = tashkentDayStartUtc(seriesStart).toISOString();

    const [users] = await db.query<{ total: number; new_today: number }>(
      `select count(*)::int as total,
              count(*) filter (where registered_at >= $1)::int as new_today
         from profiles`,
      [todayStart],
    );
    const [active] = await db.query<{ count: number }>(
      'select count(*)::int as count from user_activity where activity_date = $1',
      [today],
    );
    const [iq] = await db.query<{ count: number }>(
      'select count(*)::int as count from iq_attempts where started_at >= $1',
      [todayStart],
    );
    const [entrance] = await db.query<{ count: number }>(
      'select count(*)::int as count from entrance_attempts where attempt_date = $1',
      [today],
    );
    const [coins] = await db.query<{ total: number }>(
      'select coalesce(sum(amount), 0)::int as total from coin_transactions where amount > 0',
    );
    const [sent] = await db.query<{ count: number }>(
      "select count(*)::int as count from telegram_notification_logs where status = 'sent'",
    );

    const iqSeries = await db.query<{ date: string; count: number }>(
      `select (started_at at time zone 'Asia/Tashkent')::date::text as date, count(*)::int as count
         from iq_attempts where started_at >= $1 group by 1`,
      [seriesStartUtc],
    );
    const entranceSeries = await db.query<{ date: string; count: number }>(
      `select attempt_date::text as date, count(*)::int as count
         from entrance_attempts where attempt_date >= $1 group by 1`,
      [seriesStart],
    );
    const userSeries = await db.query<{ date: string; count: number }>(
      `select activity_date::text as date, count(*)::int as count
         from user_activity where activity_date >= $1 group by 1`,
      [seriesStart],
    );

    const series = Array.from({ length: 14 }, (_value, index) => {
      const date = addDaysToDateString(seriesStart, index);
      return {
        date,
        iq: Number(iqSeries.find((row) => row.date === date)?.count ?? 0),
        entrance: Number(entranceSeries.find((row) => row.date === date)?.count ?? 0),
        users: Number(userSeries.find((row) => row.date === date)?.count ?? 0),
      };
    });

    return {
      totalUsers: Number(users?.total ?? 0),
      newUsersToday: Number(users?.new_today ?? 0),
      activeToday: Number(active?.count ?? 0),
      iqToday: Number(iq?.count ?? 0),
      entranceToday: Number(entrance?.count ?? 0),
      coinsDistributed: Number(coins?.total ?? 0),
      notificationsSent: Number(sent?.count ?? 0),
      series,
    };
  });

  app.get('/users', secure, async (request) => {
    const query = request.query as { search?: string; page?: string; limit?: string };
    const search = (query.search ?? '').trim();
    const privateAccess = await canAdmin(db,request.admin!,'users.private');
    const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit ?? '20', 10) || 20));
    const offset = (page - 1) * limit;

    const rows = await db.query<{
      id: string;
      telegram_id: string;
      nickname: string;
      language: Language;
      coins_balance: number;
      status: 'active' | 'blocked';
      registered_at: string | Date;
      iq_completed: number;
      entrance_completed: number;
    }>(
      `select p.id, p.telegram_id::text as telegram_id, p.nickname, p.language,
              p.coins_balance, p.status, p.registered_at,
              (select count(*) from iq_attempts a where a.user_id = p.id and a.status in ('submitted', 'scored'))::int as iq_completed,
              (select count(*) from entrance_attempts a where a.user_id = p.id and a.status in ('submitted', 'expired'))::int as entrance_completed
         from profiles p
        where ($1 = '' or lower(p.nickname) like '%' || lower($1) || '%' or ($4::boolean and p.telegram_id::text = $1))
        order by p.registered_at desc
        limit $2 offset $3`,
      [search, limit, offset, privateAccess],
    );

    const [count] = await db.query<{ total: number }>(
      `select count(*)::int as total from profiles p
        where ($1 = '' or lower(p.nickname) like '%' || lower($1) || '%' or ($2::boolean and p.telegram_id::text = $1))`,
      [search, privateAccess],
    );

    const users: AdminUserRow[] = rows.map((row) => ({
      id: row.id,
      telegramId: row.telegram_id,
      nickname: row.nickname,
      language: row.language,
      coinsBalance: Number(row.coins_balance),
      status: row.status,
      registeredAt: toIso(row.registered_at) ?? new Date().toISOString(),
      iqCompleted: Number(row.iq_completed),
      entranceCompleted: Number(row.entrance_completed),
    }));

    return { users, total: Number(count?.total ?? 0), page, limit };
  });

  app.get('/users/:id/telegram', secure, async (request) => {
    await requirePermission(db, request.admin!, 'users.read');
    await requirePermission(db, request.admin!, 'users.private');
    const userId = idSchema.parse((request.params as {id:string}).id);
    const [row] = await db.query<{telegram_id:string;telegram_username:string|null;first_name:string|null;last_name:string|null;is_dev:boolean}>(
      'select telegram_id::text,telegram_username,first_name,last_name,is_dev from profiles where id=$1',[userId]);
    if (!row) throw new ApiError(404,'USER_NOT_FOUND','User not found');
    return {telegramId:row.telegram_id,username:row.telegram_username,firstName:row.first_name,lastName:row.last_name,linked:!row.is_dev};
  });

  app.get('/users/:id', secure, async (request) => {
    const id = idSchema.parse((request.params as { id: string }).id);
    const rows = await db.query<{
      phone: string | null;
      avatar_url: string | null;
      is_dev: boolean;
    }>('select phone, avatar_url, is_dev from profiles where id = $1', [id]);
    if (rows.length === 0) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');

    const profileRows = await db.query<
      Parameters<typeof mapProfile>[0]
    >('select * from profiles where id = $1', [id]);
    const profile = profileRows[0];
    const stats = await getProfileStats(db, id);
    const coins = await db.query<{
      id: string;
      amount: number;
      type: string;
      description: string | null;
      balance_after: number | null;
      created_at: string | Date;
    }>(
      `select id, amount, type, description, balance_after, created_at
         from coin_transactions where user_id = $1 order by created_at desc limit 100`,
      [id],
    );

    return {
      profile: mapProfile(profile),
      phone: await canAdmin(db,request.admin!,'users.private') ? rows[0].phone : null,
      stats: mapStats(stats, profile.language),
      coinTransactions: coins.map(mapCoinTransaction),
      iqHistory: await getIqHistory(db, profile),
      entranceHistory: await getEntranceHistory(db, profile),
    };
  });

  app.patch('/users/:id', secure, async (request) => {
    const id = idSchema.parse((request.params as { id: string }).id);
    const body = statusSchema.parse(request.body);
    const rows = await db.query('update profiles set status = $1, updated_at = now() where id = $2 returning id', [
      body.status,
      id,
    ]);
    if (rows.length === 0) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');

    await recordAudit(db, {
      adminId: request.admin!.id,
      action: body.status === 'blocked' ? 'user.block' : 'user.unblock',
      entityType: 'profile',
      entityId: id,
    });
    return { ok: true, status: body.status };
  });

  app.post('/users/:id/coins', secure, async (request) => {
    const id = idSchema.parse((request.params as { id: string }).id);
    const body = coinAdjustmentSchema.parse(request.body);

    try {
      const result = await db.transaction(async (tx) => {
        const profile = await tx.query<{ id: string }>('select id from profiles where id = $1 for update', [id]);
        if (profile.length === 0) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');

        const credited = await creditCoins(tx, {
          userId: id,
          amount: body.amount,
          type: 'admin_adjustment',
          sourceType: 'admin',
          sourceId: request.admin!.id,
          idempotencyKey: `admin:${request.admin!.id}:${randomUUID()}`,
          description: body.reason,
          createdBy: request.admin!.id,
        });
        await awardAchievements(tx, id);
        return credited;
      });

      await recordAudit(db, {
        adminId: request.admin!.id,
        action: 'coins.adjust',
        entityType: 'profile',
        entityId: id,
        details: { amount: body.amount, reason: body.reason, balance: result.balance },
      });

      return { balance: result.balance };
    } catch (error) {
      if ((error as { code?: string }).code === '23514') {
        throw new ApiError(400, 'INSUFFICIENT_BALANCE', 'The balance cannot become negative');
      }
      throw error;
    }
  });

  // -------------------------------------------------------------------------
  // IQ tests
  // -------------------------------------------------------------------------

  app.get('/iq/tests', secure, async () => {
    const rows = await db.query<AdminTestRow>(`${IQ_TEST_SELECT} order by t.test_date desc`);
    return { tests: rows.map(mapIqTest) };
  });

  app.post('/iq/tests', secure, async (request, reply) => {
    const body = iqTestInputSchema.parse(request.body);
    const today = tashkentDateString();
    const status = body.testDate > today ? 'scheduled' : 'draft';
    const publishAt = tashkentPublishInstant(body.testDate).toISOString();

    let rows: AdminTestRow[];
    try {
      rows = await db.query<AdminTestRow>(
        `insert into daily_iq_tests (test_date, title_uz, title_ru, title_en, status, publish_at)
         values ($1, $2, $3, $4, $5, $6)
         returning id, test_date::text as test_date, title_uz, title_ru, title_en,
                   status, publish_at, published_at, release_at, 0::int as question_count`,
        [body.testDate, body.titleUz, body.titleRu, body.titleEn, status, publishAt],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(409, 'TEST_DATE_TAKEN', 'A test already exists for this date');
      }
      throw error;
    }

    await recordAudit(db, {
      adminId: request.admin!.id,
      action: 'iq.test.create',
      entityType: 'daily_iq_test',
      entityId: rows[0].id,
      details: { testDate: body.testDate },
    });
    reply.status(201);
    return { test: mapIqTest(rows[0]) };
  });

  app.get('/iq/tests/:id', secure, async (request) => {
    const id = idSchema.parse((request.params as { id: string }).id);
    const rows = await db.query<AdminTestRow>(`${IQ_TEST_SELECT} where t.id = $1`, [id]);
    if (rows.length === 0) throw new ApiError(404, 'TEST_NOT_FOUND', 'Test not found');
    return { test: mapIqTest(rows[0]), questions: await loadQuestions(db, 'iq', id) };
  });

  app.patch('/iq/tests/:id', secure, async (request) => {
    const id = idSchema.parse((request.params as { id: string }).id);
    const body = iqTestInputSchema.partial().parse(request.body);
    const current = await db.query<{ test_date: string }>(
      'select test_date::text as test_date from daily_iq_tests where id = $1',
      [id],
    );
    if (current.length === 0) throw new ApiError(404, 'TEST_NOT_FOUND', 'Test not found');

    const date = body.testDate ?? current[0].test_date;
    try {
      await db.query(
        `update daily_iq_tests
            set test_date = $1,
                title_uz = coalesce($2, title_uz),
                title_ru = coalesce($3, title_ru),
                title_en = coalesce($4, title_en),
                publish_at = $5,
                updated_at = now()
          where id = $6`,
        [
          date,
          body.titleUz ?? null,
          body.titleRu ?? null,
          body.titleEn ?? null,
          tashkentPublishInstant(date).toISOString(),
          id,
        ],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(409, 'TEST_DATE_TAKEN', 'A test already exists for this date');
      }
      throw error;
    }

    const rows = await db.query<AdminTestRow>(`${IQ_TEST_SELECT} where t.id = $1`, [id]);
    return { test: mapIqTest(rows[0]) };
  });

  app.delete('/iq/tests/:id', secure, async (request) => {
    const id = idSchema.parse((request.params as { id: string }).id);
    const attempts = await db.query('select 1 from iq_attempts where test_id = $1 limit 1', [id]);
    if (attempts.length > 0) {
      throw new ApiError(409, 'TEST_HAS_ATTEMPTS', 'Cannot delete a test that users already started');
    }
    await db.query('delete from daily_iq_tests where id = $1', [id]);
    await recordAudit(db, {
      adminId: request.admin!.id,
      action: 'iq.test.delete',
      entityType: 'daily_iq_test',
      entityId: id,
    });
    return { ok: true };
  });

  app.post('/iq/tests/:id/questions', secure, async (request, reply) => {
    const testId = idSchema.parse((request.params as { id: string }).id);
    const body = questionInputSchema.parse(request.body);

    const question = await db.transaction(async (tx) => {
      const test = await tx.query<{ id: string }>('select id from daily_iq_tests where id = $1', [testId]);
      if (test.length === 0) throw new ApiError(404, 'TEST_NOT_FOUND', 'Test not found');

      const [count] = await tx.query<{ count: number }>(
        'select count(*)::int as count from iq_questions where test_id = $1',
        [testId],
      );
      if (Number(count?.count ?? 0) >= 10) {
        throw new ApiError(409, 'TOO_MANY_QUESTIONS', 'An IQ test can contain at most 10 questions');
      }
      const [max] = await tx.query<{ position: number }>(
        'select coalesce(max(position), 0)::int as position from iq_questions where test_id = $1',
        [testId],
      );

      const inserted = await tx.query<AdminQuestionRow>(
        `insert into iq_questions
          (test_id, position, text_uz, text_ru, text_en,
           explanation_uz, explanation_ru, explanation_en,
           difficulty, coins, image_url, correct_option_index)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         returning *`,
        [
          testId,
          Number(max?.position ?? 0) + 1,
          body.textUz,
          body.textRu,
          body.textEn,
          body.explanationUz ?? null,
          body.explanationRu ?? null,
          body.explanationEn ?? null,
          body.difficulty,
          body.coins,
          body.imageUrl ?? null,
          body.correctOptionIndex,
        ],
      );

      for (let index = 0; index < body.options.length; index++) {
        const option = body.options[index];
        await tx.query(
          `insert into iq_question_options (question_id, position, text_uz, text_ru, text_en)
           values ($1, $2, $3, $4, $5)`,
          [inserted[0].id, index, option.textUz, option.textRu, option.textEn],
        );
      }
      return inserted[0];
    });

    await recordAudit(db, {
      adminId: request.admin!.id,
      action: 'iq.question.create',
      entityType: 'iq_question',
      entityId: question.id,
    });
    reply.status(201);
    return { question: (await loadQuestions(db, 'iq', testId)).find((q) => q.id === question.id) };
  });

  app.patch('/iq/questions/:id', secure, async (request) => {
    const id = idSchema.parse((request.params as { id: string }).id);
    const body = questionInputSchema.parse(request.body);

    const testId = await db.transaction(async (tx) => {
      const existing = await tx.query<{ test_id: string }>(
        'select test_id from iq_questions where id = $1',
        [id],
      );
      if (existing.length === 0) throw new ApiError(404, 'QUESTION_NOT_FOUND', 'Question not found');

      await tx.query(
        `update iq_questions
            set text_uz = $1, text_ru = $2, text_en = $3,
                explanation_uz = $4, explanation_ru = $5, explanation_en = $6,
                difficulty = $7, coins = $8, image_url = $9, correct_option_index = $10
          where id = $11`,
        [
          body.textUz,
          body.textRu,
          body.textEn,
          body.explanationUz ?? null,
          body.explanationRu ?? null,
          body.explanationEn ?? null,
          body.difficulty,
          body.coins,
          body.imageUrl ?? null,
          body.correctOptionIndex,
          id,
        ],
      );

      for (let index = 0; index < body.options.length; index++) {
        const option = body.options[index];
        await tx.query(
          `insert into iq_question_options (question_id, position, text_uz, text_ru, text_en)
           values ($1, $2, $3, $4, $5)
           on conflict (question_id, position) do update
             set text_uz = excluded.text_uz, text_ru = excluded.text_ru, text_en = excluded.text_en`,
          [id, index, option.textUz, option.textRu, option.textEn],
        );
      }
      return existing[0].test_id;
    });

    return { question: (await loadQuestions(db, 'iq', testId)).find((q) => q.id === id) };
  });

  app.delete('/iq/questions/:id', secure, async (request) => {
    const id = idSchema.parse((request.params as { id: string }).id);
    const rows = await db.query<{ test_id: string }>('select test_id from iq_questions where id = $1', [
      id,
    ]);
    if (rows.length === 0) throw new ApiError(404, 'QUESTION_NOT_FOUND', 'Question not found');
    const attempts = await db.query('select 1 from iq_attempts where test_id = $1 limit 1', [
      rows[0].test_id,
    ]);
    if (attempts.length > 0) {
      throw new ApiError(409, 'TEST_HAS_ATTEMPTS', 'Cannot edit questions after users started the test');
    }
    await db.query('delete from iq_questions where id = $1', [id]);
    await recordAudit(db, {
      adminId: request.admin!.id,
      action: 'iq.question.delete',
      entityType: 'iq_question',
      entityId: id,
    });
    return { ok: true };
  });

  app.post('/iq/tests/:id/publish', secure, async (request) => {
    const id = idSchema.parse((request.params as { id: string }).id);
    await publishIqTest(db, config, id);
    await recordAudit(db, {
      adminId: request.admin!.id,
      action: 'iq.test.publish',
      entityType: 'daily_iq_test',
      entityId: id,
    });
    const rows = await db.query<AdminTestRow>(`${IQ_TEST_SELECT} where t.id = $1`, [id]);
    return { test: mapIqTest(rows[0]) };
  });

  // -------------------------------------------------------------------------
  // Entrance tests
  // -------------------------------------------------------------------------

  app.get('/entrance/tests', secure, async () => {
    const rows = await db.query<EntranceRow>(`${ENTRANCE_SELECT} order by t.created_at desc`);
    return { tests: rows.map(mapEntranceTest) };
  });

  app.post('/entrance/tests', secure, async (request, reply) => {
    const body = entranceTestInputSchema.parse(request.body);
    let rows: EntranceRow[];
    try {
      rows = await db.query<EntranceRow>(
        `insert into entrance_tests
          (slug, title_uz, title_ru, title_en, description_uz, description_ru, description_en,
           subject, difficulty, duration_seconds, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft')
         returning id, slug, title_uz, title_ru, title_en, description_uz, description_ru, description_en,
                   subject, difficulty, duration_seconds, status, published_at, 0::int as question_count`,
        [
          body.slug,
          body.titleUz,
          body.titleRu,
          body.titleEn,
          body.descriptionUz ?? null,
          body.descriptionRu ?? null,
          body.descriptionEn ?? null,
          body.subject,
          body.difficulty,
          body.durationSeconds,
        ],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(409, 'SLUG_TAKEN', 'A test with this slug already exists');
      }
      throw error;
    }

    await recordAudit(db, {
      adminId: request.admin!.id,
      action: 'entrance.test.create',
      entityType: 'entrance_test',
      entityId: rows[0].id,
    });
    reply.status(201);
    return { test: mapEntranceTest(rows[0]) };
  });

  app.get('/entrance/tests/:id', secure, async (request) => {
    const id = idSchema.parse((request.params as { id: string }).id);
    const rows = await db.query<EntranceRow>(`${ENTRANCE_SELECT} where t.id = $1`, [id]);
    if (rows.length === 0) throw new ApiError(404, 'TEST_NOT_FOUND', 'Test not found');
    return { test: mapEntranceTest(rows[0]), questions: await loadQuestions(db, 'entrance', id) };
  });

  app.patch('/entrance/tests/:id', secure, async (request) => {
    const id = idSchema.parse((request.params as { id: string }).id);
    const body = entranceTestInputSchema.partial().parse(request.body);

    await db.query(
      `update entrance_tests
          set title_uz = coalesce($1, title_uz),
              title_ru = coalesce($2, title_ru),
              title_en = coalesce($3, title_en),
              description_uz = coalesce($4, description_uz),
              description_ru = coalesce($5, description_ru),
              description_en = coalesce($6, description_en),
              subject = coalesce($7, subject),
              difficulty = coalesce($8, difficulty),
              duration_seconds = coalesce($9, duration_seconds),
              updated_at = now()
        where id = $10`,
      [
        body.titleUz ?? null,
        body.titleRu ?? null,
        body.titleEn ?? null,
        body.descriptionUz ?? null,
        body.descriptionRu ?? null,
        body.descriptionEn ?? null,
        body.subject ?? null,
        body.difficulty ?? null,
        body.durationSeconds ?? null,
        id,
      ],
    );

    const rows = await db.query<EntranceRow>(`${ENTRANCE_SELECT} where t.id = $1`, [id]);
    if (rows.length === 0) throw new ApiError(404, 'TEST_NOT_FOUND', 'Test not found');
    return { test: mapEntranceTest(rows[0]) };
  });

  app.delete('/entrance/tests/:id', secure, async (request) => {
    const id = idSchema.parse((request.params as { id: string }).id);
    const attempts = await db.query('select 1 from entrance_attempts where test_id = $1 limit 1', [id]);
    if (attempts.length > 0) {
      throw new ApiError(409, 'TEST_HAS_ATTEMPTS', 'Cannot delete a test that users already started');
    }
    await db.query('delete from entrance_tests where id = $1', [id]);
    await recordAudit(db, {
      adminId: request.admin!.id,
      action: 'entrance.test.delete',
      entityType: 'entrance_test',
      entityId: id,
    });
    return { ok: true };
  });

  app.post('/entrance/tests/:id/questions', secure, async (request, reply) => {
    const testId = idSchema.parse((request.params as { id: string }).id);
    const body = questionInputSchema.parse(request.body);

    const question = await db.transaction(async (tx) => {
      const test = await tx.query<{ id: string }>('select id from entrance_tests where id = $1', [testId]);
      if (test.length === 0) throw new ApiError(404, 'TEST_NOT_FOUND', 'Test not found');

      const [count] = await tx.query<{ count: number }>(
        'select count(*)::int as count from entrance_questions where test_id = $1',
        [testId],
      );
      if (Number(count?.count ?? 0) >= 20) {
        throw new ApiError(409, 'TOO_MANY_QUESTIONS', 'An entrance test can contain at most 20 questions');
      }
      const [max] = await tx.query<{ position: number }>(
        'select coalesce(max(position), 0)::int as position from entrance_questions where test_id = $1',
        [testId],
      );

      const inserted = await tx.query<AdminQuestionRow>(
        `insert into entrance_questions
          (test_id, position, text_uz, text_ru, text_en,
           explanation_uz, explanation_ru, explanation_en,
           difficulty, coins, image_url, correct_option_index)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         returning *`,
        [
          testId,
          Number(max?.position ?? 0) + 1,
          body.textUz,
          body.textRu,
          body.textEn,
          body.explanationUz ?? null,
          body.explanationRu ?? null,
          body.explanationEn ?? null,
          body.difficulty,
          body.coins,
          body.imageUrl ?? null,
          body.correctOptionIndex,
        ],
      );

      for (let index = 0; index < body.options.length; index++) {
        const option = body.options[index];
        await tx.query(
          `insert into entrance_question_options (question_id, position, text_uz, text_ru, text_en)
           values ($1, $2, $3, $4, $5)`,
          [inserted[0].id, index, option.textUz, option.textRu, option.textEn],
        );
      }
      return inserted[0];
    });

    await recordAudit(db, {
      adminId: request.admin!.id,
      action: 'entrance.question.create',
      entityType: 'entrance_question',
      entityId: question.id,
    });
    reply.status(201);
    return {
      question: (await loadQuestions(db, 'entrance', testId)).find((q) => q.id === question.id),
    };
  });

  app.patch('/entrance/questions/:id', secure, async (request) => {
    const id = idSchema.parse((request.params as { id: string }).id);
    const body = questionInputSchema.parse(request.body);

    const testId = await db.transaction(async (tx) => {
      const existing = await tx.query<{ test_id: string }>(
        'select test_id from entrance_questions where id = $1',
        [id],
      );
      if (existing.length === 0) throw new ApiError(404, 'QUESTION_NOT_FOUND', 'Question not found');

      await tx.query(
        `update entrance_questions
            set text_uz = $1, text_ru = $2, text_en = $3,
                explanation_uz = $4, explanation_ru = $5, explanation_en = $6,
                difficulty = $7, coins = $8, image_url = $9, correct_option_index = $10
          where id = $11`,
        [
          body.textUz,
          body.textRu,
          body.textEn,
          body.explanationUz ?? null,
          body.explanationRu ?? null,
          body.explanationEn ?? null,
          body.difficulty,
          body.coins,
          body.imageUrl ?? null,
          body.correctOptionIndex,
          id,
        ],
      );

      for (let index = 0; index < body.options.length; index++) {
        const option = body.options[index];
        await tx.query(
          `insert into entrance_question_options (question_id, position, text_uz, text_ru, text_en)
           values ($1, $2, $3, $4, $5)
           on conflict (question_id, position) do update
             set text_uz = excluded.text_uz, text_ru = excluded.text_ru, text_en = excluded.text_en`,
          [id, index, option.textUz, option.textRu, option.textEn],
        );
      }
      return existing[0].test_id;
    });

    return {
      question: (await loadQuestions(db, 'entrance', testId)).find((q) => q.id === id),
    };
  });

  app.delete('/entrance/questions/:id', secure, async (request) => {
    const id = idSchema.parse((request.params as { id: string }).id);
    const rows = await db.query<{ test_id: string }>(
      'select test_id from entrance_questions where id = $1',
      [id],
    );
    if (rows.length === 0) throw new ApiError(404, 'QUESTION_NOT_FOUND', 'Question not found');
    const attempts = await db.query('select 1 from entrance_attempts where test_id = $1 limit 1', [
      rows[0].test_id,
    ]);
    if (attempts.length > 0) {
      throw new ApiError(409, 'TEST_HAS_ATTEMPTS', 'Cannot edit questions after users started the test');
    }
    await db.query('delete from entrance_questions where id = $1', [id]);
    await recordAudit(db, {
      adminId: request.admin!.id,
      action: 'entrance.question.delete',
      entityType: 'entrance_question',
      entityId: id,
    });
    return { ok: true };
  });

  app.post('/entrance/tests/:id/publish', secure, async (request) => {
    const id = idSchema.parse((request.params as { id: string }).id);
    const rows = await db.query<{ question_count: number }>(
      `select (select count(*) from entrance_questions where test_id = t.id)::int as question_count
         from entrance_tests t where t.id = $1`,
      [id],
    );
    if (rows.length === 0) throw new ApiError(404, 'TEST_NOT_FOUND', 'Test not found');
    if (Number(rows[0].question_count) !== 20) {
      throw new ApiError(409, 'INVALID_TEST', 'An entrance test must contain exactly 20 questions');
    }

    await db.query(
      `update entrance_tests
          set status = 'published', published_at = coalesce(published_at, now()), updated_at = now()
        where id = $1`,
      [id],
    );
    await recordAudit(db, {
      adminId: request.admin!.id,
      action: 'entrance.test.publish',
      entityType: 'entrance_test',
      entityId: id,
    });
    const tests = await db.query<EntranceRow>(`${ENTRANCE_SELECT} where t.id = $1`, [id]);
    return { test: mapEntranceTest(tests[0]) };
  });

  app.post('/entrance/tests/:id/unpublish', secure, async (request) => {
    const id = idSchema.parse((request.params as { id: string }).id);
    await db.query(`update entrance_tests set status = 'draft', updated_at = now() where id = $1`, [id]);
    const tests = await db.query<EntranceRow>(`${ENTRANCE_SELECT} where t.id = $1`, [id]);
    if (tests.length === 0) throw new ApiError(404, 'TEST_NOT_FOUND', 'Test not found');
    return { test: mapEntranceTest(tests[0]) };
  });

  // -------------------------------------------------------------------------
  // Notifications, logs, audit
  // -------------------------------------------------------------------------

  app.get('/notifications', secure, async () => {
    const rows = await db.query<{
      id: string;
      title_uz: string;
      body_uz: string;
      target: string;
      status: string;
      scheduled_at: string | Date | null;
      sent_at: string | Date | null;
      created_at: string | Date;
      sent_count: number;
      failed_count: number;
    }>(
      `select n.id, n.title_uz, n.body_uz, n.target, n.status, n.scheduled_at, n.sent_at, n.created_at,
              (select count(*) from telegram_notification_logs l where l.notification_id = n.id and l.status = 'sent')::int as sent_count,
              (select count(*) from telegram_notification_logs l where l.notification_id = n.id and l.status = 'failed')::int as failed_count
         from notifications n order by n.created_at desc limit 100`,
    );

    const notifications: AdminNotificationRow[] = rows.map((row) => ({
      id: row.id,
      title: row.title_uz,
      body: row.body_uz,
      target: row.target,
      status: row.status,
      scheduledAt: toIso(row.scheduled_at),
      sentAt: toIso(row.sent_at),
      createdAt: toIso(row.created_at) ?? new Date().toISOString(),
      sentCount: Number(row.sent_count),
      failedCount: Number(row.failed_count),
    }));

    return { notifications };
  });

  app.post('/notifications', secure, async (request, reply) => {
    const body = notificationInputSchema.parse(request.body);
    if (body.target === 'user' && !body.targetUserId) {
      throw new ApiError(400, 'TARGET_REQUIRED', 'targetUserId is required for a single user target');
    }
    if (body.targetUserId) {
      const target = await db.query('select 1 from profiles where id = $1', [body.targetUserId]);
      if (target.length === 0) throw new ApiError(404, 'USER_NOT_FOUND', 'Target user not found');
    }

    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    if (scheduledAt && scheduledAt.getTime() <= Date.now()) {
      throw new ApiError(400, 'INVALID_SCHEDULE', 'Scheduled time must be in the future');
    }

    const rows = await db.query<{
      id: string;
      status: string;
      scheduled_at: string | Date | null;
      created_at: string | Date;
    }>(
      `insert into notifications
        (title_uz, title_ru, title_en, body_uz, body_ru, body_en, target, target_user_id,
         status, scheduled_at, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning id, status, scheduled_at, created_at`,
      [
        body.titleUz,
        body.titleRu,
        body.titleEn,
        body.bodyUz,
        body.bodyRu,
        body.bodyEn,
        body.target,
        body.targetUserId ?? null,
        scheduledAt ? 'scheduled' : 'draft',
        scheduledAt ? scheduledAt.toISOString() : null,
        request.admin!.id,
      ],
    );
    const notificationId = rows[0].id;

    let delivery: { sent: number; failed: number } | null = null;
    if (!scheduledAt) {
      delivery = await sendAnnouncement(db, config, notificationId);
    }

    await recordAudit(db, {
      adminId: request.admin!.id,
      action: 'notification.create',
      entityType: 'notification',
      entityId: notificationId,
      details: { target: body.target, scheduled: Boolean(scheduledAt) },
    });

    reply.status(201);
    return { id: notificationId, delivery };
  });

  app.get('/logs', secure, async (request) => {
    const privateAccess = await canAdmin(db,request.admin!,'users.private');
    const rows = await db.query<{
      id: string;
      telegram_id: string;
      nickname: string | null;
      kind: string;
      status: string;
      error: string | null;
      created_at: string | Date;
    }>(
      `select l.id, l.telegram_id::text as telegram_id, p.nickname, l.kind, l.status, l.error, l.created_at
         from telegram_notification_logs l
         left join profiles p on p.id = l.user_id
        order by l.created_at desc
        limit 200`,
    );

    const logs: DeliveryLog[] = rows.map((row) => ({
      id: row.id,
      telegramId: row.telegram_id,
      nickname: row.nickname,
      kind: row.kind,
      status: row.status,
      error: privateAccess ? row.error : null,
      createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    }));
    return { logs };
  });

  app.get('/audit', secure, async () => {
    const rows = await db.query<{
      id: string;
      admin_email: string | null;
      action: string;
      entity_type: string | null;
      entity_id: string | null;
      details: unknown;
      created_at: string | Date;
    }>(
      `select a.id, u.email as admin_email, a.action, a.entity_type, a.entity_id, a.details, a.created_at
         from admin_audit_logs a
         left join admin_users u on u.id = a.admin_id
        order by a.created_at desc
        limit 200`,
    );

    const logs: AdminAuditLog[] = rows.map((row) => ({
      id: row.id,
      adminEmail: row.admin_email,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      details: row.details,
      createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    }));
    return { logs };
  });

  // Silence unused imports that are kept for future admin features.
  void percentage;
  void localizeText;
  void hashPassword;
};

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { code?: string }).code === '23505';
}
