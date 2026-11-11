import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { Db, Queryable } from '@zerolax/db';
import { z } from 'zod';
import type { Language } from '@zerolax/shared';
import { ApiError } from '../errors';
import { csvOutput, requirePermission } from '../services/admin-control';
import { recordAudit } from '../services/admin';
import {
  EDTECH_SUBJECTS,
  buildWeeklyReport,
  computeLeaderboard,
  deckCards,
  evaluateAchievements,
  flashcardStats,
  getAchievements,
  getDashboard,
  getEdtechSettings,
  getLearningMap,
  getMissions,
  getRecommendations,
  getStreak,
  listDecks,
  listMistakes,
  mistakeAnalysis,
  reviewFlashcard,
  reviewMistake,
  snapshotLeaderboard,
  toggleFavorite,
  type FlashcardRating,
  type LeaderboardPeriod,
} from '../services/edtech';

interface UserOptions {
  db: Db;
  userGuard: (r: FastifyRequest, p: FastifyReply) => Promise<void>;
}
interface AdminOptions {
  db: Db;
  adminGuard: (r: FastifyRequest, p: FastifyReply) => Promise<void>;
}

const uuid = z.string().uuid();
const idOf = (r: FastifyRequest) => uuid.parse((r.params as { id: string }).id);
const languageOf = (r: FastifyRequest): Language =>
  ((r.profile?.language as Language | undefined) ?? 'uz') as Language;
const periodSchema = z.enum(['weekly', 'monthly', 'all']);
const subjectSchema = z.enum(EDTECH_SUBJECTS);
const ratingSchema = z.enum(['again', 'hard', 'good', 'easy']);

function localized(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of ['uz', 'ru', 'en']) {
    if (typeof record[key] === 'string') out[key] = record[key] as string;
  }
  return out;
}

const localizedInput = z.record(z.string(), z.string());

export const edtechRoutes: FastifyPluginAsync<UserOptions> = async (app, { db, userGuard }) => {
  await app.register(async (user) => {
    user.addHook('preHandler', userGuard);

    // ---------------------------------------------------------------- dashboard
    user.get('/dashboard', async (r) => getDashboard(db, r.profile!.id, languageOf(r)));

    // ----------------------------------------------------------------- missions
    user.get('/missions', async (r) => {
      const query = z.object({ date: z.string().date().optional() }).parse(r.query);
      return getMissions(db, r.profile!.id, languageOf(r), query.date);
    });

    user.get('/streak', async (r) => getStreak(db, r.profile!.id));

    // -------------------------------------------------------------- leaderboard
    user.get('/leaderboard', async (r) => {
      const query = z
        .object({
          period: periodSchema.default('weekly'),
          subject: subjectSchema.default('all'),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        })
        .parse(r.query);
      return computeLeaderboard(
        db,
        query.period as LeaderboardPeriod,
        query.subject,
        query.limit,
        r.profile!.id,
      );
    });

    // --------------------------------------------------------------- flashcards
    user.get('/flashcards', async (r) => {
      const query = z
        .object({
          subject: z.string().optional(),
          grade: z.coerce.number().int().min(1).max(11).optional(),
        })
        .parse(r.query);
      const [decks, stats] = await Promise.all([
        listDecks(db, r.profile!.id, languageOf(r), query),
        flashcardStats(db, r.profile!.id),
      ]);
      return { decks, stats };
    });

    user.get('/flashcards/stats', async (r) => flashcardStats(db, r.profile!.id));

    user.get('/flashcards/:deckId', async (r) => {
      const deckId = uuid.parse((r.params as { deckId: string }).deckId);
      const query = z
        .object({
          dueOnly: z.coerce.boolean().optional(),
          favorites: z.coerce.boolean().optional(),
          search: z.string().max(120).optional(),
        })
        .parse(r.query);
      return deckCards(db, r.profile!.id, languageOf(r), deckId, query);
    });

    user.post('/flashcards/:cardId/review', async (r) => {
      const cardId = uuid.parse((r.params as { cardId: string }).cardId);
      const body = z.object({ rating: ratingSchema }).parse(r.body);
      return reviewFlashcard(db, r.profile!.id, cardId, body.rating as FlashcardRating);
    });

    user.post('/flashcards/:cardId/favorite', async (r) => {
      const cardId = uuid.parse((r.params as { cardId: string }).cardId);
      return toggleFavorite(db, r.profile!.id, cardId);
    });

    // ---------------------------------------------------------------- mistakes
    user.get('/mistakes', async (r) => {
      const query = z
        .object({
          subject: z.string().max(40).optional(),
          resolved: z.enum(['true', 'false']).optional(),
          search: z.string().max(120).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        })
        .parse(r.query);
      return listMistakes(db, r.profile!.id, {
        subject: query.subject,
        resolved: query.resolved === undefined ? undefined : query.resolved === 'true',
        search: query.search,
        limit: query.limit,
        offset: query.offset,
      });
    });

    user.get('/mistakes/analysis', async (r) => mistakeAnalysis(db, r.profile!.id));

    user.post('/mistakes/:id/review', async (r) => {
      const body = z
        .object({ selectedIndex: z.number().int().min(0).max(3) })
        .parse(r.body);
      return reviewMistake(db, r.profile!.id, idOf(r), body.selectedIndex);
    });

    // --------------------------------------------------------------- analytics
    user.get('/analytics', async (r) => getLearningMap(db, r.profile!.id));

    user.get('/recommendations', async (r) =>
      getRecommendations(db, r.profile!.id, languageOf(r)),
    );

    // ----------------------------------------------------------------- reports
    user.get('/reports/weekly', async (r) => {
      const query = z.object({ week: z.string().date().optional() }).parse(r.query);
      return buildWeeklyReport(db, r.profile!.id, query.week, languageOf(r));
    });

    // ------------------------------------------------------------ achievements
    user.get('/achievements', async (r) => {
      await evaluateAchievements(db, r.profile!.id);
      return getAchievements(db, r.profile!.id, languageOf(r));
    });

    // ---------------------------------------------------------------- privacy
    user.get('/profile/privacy', async (r) => {
      const [row] = await db.query<{ leaderboard_visible: boolean }>(
        'select leaderboard_visible from profiles where id=$1',
        [r.profile!.id],
      );
      return { leaderboardVisible: row?.leaderboard_visible ?? true };
    });

    user.patch('/profile/privacy', async (r) => {
      const body = z.object({ leaderboardVisible: z.boolean() }).parse(r.body);
      await db.query('update profiles set leaderboard_visible=$2 where id=$1', [
        r.profile!.id,
        body.leaderboardVisible,
      ]);
      return { leaderboardVisible: body.leaderboardVisible };
    });
  });
};

// ===========================================================================
// Admin
// ===========================================================================
const missionMetric = z.enum([
  'questions_answered',
  'algebra_topic',
  'geometry_practice',
  'flashcards_reviewed',
  'mistakes_reviewed',
  'daily_test',
]);

const missionBody = z.object({
  code: z.string().min(2).max(60).regex(/^[a-z0-9_]+$/),
  metric: missionMetric,
  target: z.number().int().min(1).max(1000),
  rewardCoins: z.number().int().min(0).max(100000),
  titles: localizedInput,
  descriptions: localizedInput.default({}),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  startsOn: z.string().date().nullable().optional(),
  endsOn: z.string().date().nullable().optional(),
});

const deckBody = z.object({
  subject: z.enum(['algebra', 'geometry', 'dtm', 'sat', 'english']),
  grade: z.number().int().min(1).max(11).nullable().optional(),
  titles: localizedInput,
  descriptions: localizedInput.default({}),
  status: z.enum(['draft', 'published']).default('draft'),
  position: z.number().int().min(0).max(10000).default(0),
});

const cardBody = z.object({
  front: localizedInput,
  back: localizedInput,
  explanation: localizedInput.default({}),
  example: localizedInput.default({}),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  position: z.number().int().min(0).max(10000).default(0),
  status: z.enum(['draft', 'published']).default('published'),
});

const achievementBody = z.object({
  code: z.string().min(2).max(60).regex(/^[a-z0-9_]+$/),
  titleUz: z.string().min(1),
  titleRu: z.string().min(1),
  titleEn: z.string().min(1),
  descriptionUz: z.string().default(''),
  descriptionRu: z.string().default(''),
  descriptionEn: z.string().default(''),
  icon: z.string().max(60).default('award'),
  coinReward: z.number().int().min(0).max(100000).default(0),
  criteriaType: z
    .enum(['questions', 'streak', 'topics', 'mistake_reviews', 'flashcards', 'missions', 'rank'])
    .nullable()
    .optional(),
  criteriaValue: z.number().int().min(0).max(1000000).default(0),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10000).default(0),
});

function page(r: FastifyRequest) {
  return z
    .object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
      search: z.string().max(120).default(''),
    })
    .parse(r.query);
}

export const adminEdtechRoutes: FastifyPluginAsync<AdminOptions> = async (
  app,
  { db, adminGuard },
) => {
  app.addHook('preHandler', adminGuard);
  const need = (r: FastifyRequest, permission = 'edtech.read') =>
    requirePermission(db, r.admin!, permission);

  // ---------------------------------------------------------------- overview
  app.get('/overview', async (r) => {
    await need(r);
    const [row] = await db.query<Record<string, number>>(
      `select
         (select count(*)::int from learning_activity where activity_date=current_date) as today_activity,
         (select count(distinct user_id)::int from learning_activity where activity_date >= current_date - 6) as active_7d,
         (select count(*)::int from user_daily_missions where mission_date=current_date and completed_at is not null) as missions_completed_today,
         (select count(*)::int from user_mistakes where resolved=false) as open_mistakes,
         (select count(*)::int from user_flashcard_progress where last_reviewed_at::date=current_date) as cards_reviewed_today,
         (select count(*)::int from user_streaks where current_streak > 0) as active_streaks,
         (select count(*)::int from user_achievements) as achievements_awarded,
         (select count(*)::int from flashcard_decks) as decks,
         (select count(*)::int from flashcards) as cards,
         (select count(*)::int from daily_missions where active) as active_missions`,
    );
    const kinds = await db.query<{ kind: string; total: number }>(
      `select kind, count(*)::int as total from learning_activity
        where activity_date >= current_date - 29 group by kind order by total desc`,
    );
    const daily = await db.query<{ date: string; total: number }>(
      `select activity_date::text as date, count(*)::int as total
         from learning_activity where activity_date >= current_date - 13
        group by activity_date order by activity_date`,
    );
    return { totals: row ?? {}, kinds, daily };
  });

  // ---------------------------------------------------------------- missions
  app.get('/missions', async (r) => {
    await need(r);
    const rows = await db.query(
      `select m.*, (select count(*)::int from user_daily_missions d where d.mission_id=m.id and d.completed_at is not null) as completions
         from daily_missions m order by m.sort_order, m.code`,
    );
    return { missions: rows };
  });

  app.post('/missions', async (r) => {
    await need(r, 'edtech.write');
    const body = missionBody.parse(r.body);
    return db.transaction(async (tx) => {
      const [row] = await tx.query<{ id: string }>(
        `insert into daily_missions
          (code, metric, target, reward_coins, titles, descriptions, active, sort_order, starts_on, ends_on)
         values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9::date,$10::date) returning id`,
        [
          body.code,
          body.metric,
          body.target,
          body.rewardCoins,
          JSON.stringify(body.titles),
          JSON.stringify(body.descriptions),
          body.active,
          body.sortOrder,
          body.startsOn ?? null,
          body.endsOn ?? null,
        ],
      );
      await recordAudit(tx, {
        adminId: r.admin!.id,
        action: 'edtech.mission.create',
        entityType: 'daily_mission',
        entityId: row.id,
        details: body,
      });
      return { id: row.id };
    });
  });

  app.patch('/missions/:id', async (r) => {
    await need(r, 'edtech.write');
    const body = missionBody.partial().parse(r.body);
    return db.transaction(async (tx) => {
      const [existing] = await tx.query('select id from daily_missions where id=$1', [idOf(r)]);
      if (!existing) throw new ApiError(404, 'MISSION_NOT_FOUND', 'Mission not found');
      await tx.query(
        `update daily_missions set
           code = coalesce($2, code), metric = coalesce($3, metric), target = coalesce($4, target),
           reward_coins = coalesce($5, reward_coins),
           titles = coalesce($6::jsonb, titles), descriptions = coalesce($7::jsonb, descriptions),
           active = coalesce($8, active), sort_order = coalesce($9, sort_order),
           starts_on = case when $10::boolean then $11::date else starts_on end,
           ends_on = case when $12::boolean then $13::date else ends_on end
         where id=$1`,
        [
          idOf(r),
          body.code ?? null,
          body.metric ?? null,
          body.target ?? null,
          body.rewardCoins ?? null,
          body.titles ? JSON.stringify(body.titles) : null,
          body.descriptions ? JSON.stringify(body.descriptions) : null,
          body.active ?? null,
          body.sortOrder ?? null,
          Object.prototype.hasOwnProperty.call(body, 'startsOn'),
          body.startsOn ?? null,
          Object.prototype.hasOwnProperty.call(body, 'endsOn'),
          body.endsOn ?? null,
        ],
      );
      await recordAudit(tx, {
        adminId: r.admin!.id,
        action: 'edtech.mission.update',
        entityType: 'daily_mission',
        entityId: idOf(r),
        details: body,
      });
      return { ok: true };
    });
  });

  app.delete('/missions/:id', async (r) => {
    await need(r, 'edtech.write');
    return db.transaction(async (tx) => {
      const used = await tx.query(
        'select 1 from user_daily_missions where mission_id=$1 limit 1',
        [idOf(r)],
      );
      if (used.length) {
        await tx.query('update daily_missions set active=false where id=$1', [idOf(r)]);
      } else {
        await tx.query('delete from daily_missions where id=$1', [idOf(r)]);
      }
      await recordAudit(tx, {
        adminId: r.admin!.id,
        action: 'edtech.mission.delete',
        entityType: 'daily_mission',
        entityId: idOf(r),
        details: { soft: used.length > 0 },
      });
      return { ok: true, softDeleted: used.length > 0 };
    });
  });

  // ------------------------------------------------------------------- decks
  app.get('/decks', async (r) => {
    await need(r);
    const rows = await db.query(
      `select d.*, count(c.id)::int as card_count
         from flashcard_decks d left join flashcards c on c.deck_id=d.id
        group by d.id order by d.position, d.created_at`,
    );
    return { decks: rows };
  });

  app.post('/decks', async (r) => {
    await need(r, 'edtech.write');
    const body = deckBody.parse(r.body);
    return db.transaction(async (tx) => {
      const [row] = await tx.query<{ id: string }>(
        `insert into flashcard_decks (subject, grade, titles, descriptions, status, position, created_by)
         values ($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7) returning id`,
        [
          body.subject,
          body.grade ?? null,
          JSON.stringify(body.titles),
          JSON.stringify(body.descriptions),
          body.status,
          body.position,
          r.admin!.id,
        ],
      );
      await recordAudit(tx, {
        adminId: r.admin!.id,
        action: 'edtech.deck.create',
        entityType: 'flashcard_deck',
        entityId: row.id,
        details: body,
      });
      return { id: row.id };
    });
  });

  app.patch('/decks/:id', async (r) => {
    await need(r, 'edtech.write');
    const body = deckBody.partial().parse(r.body);
    return db.transaction(async (tx) => {
      await tx.query(
        `update flashcard_decks set
           subject = coalesce($2, subject),
           grade = case when $3::boolean then $4::int else grade end,
           titles = coalesce($5::jsonb, titles),
           descriptions = coalesce($6::jsonb, descriptions),
           status = coalesce($7, status), position = coalesce($8, position), updated_at = now()
         where id=$1`,
        [
          idOf(r),
          body.subject ?? null,
          Object.prototype.hasOwnProperty.call(body, 'grade'),
          body.grade ?? null,
          body.titles ? JSON.stringify(body.titles) : null,
          body.descriptions ? JSON.stringify(body.descriptions) : null,
          body.status ?? null,
          body.position ?? null,
        ],
      );
      await recordAudit(tx, {
        adminId: r.admin!.id,
        action: 'edtech.deck.update',
        entityType: 'flashcard_deck',
        entityId: idOf(r),
        details: body,
      });
      return { ok: true };
    });
  });

  app.delete('/decks/:id', async (r) => {
    await need(r, 'edtech.write');
    return db.transaction(async (tx) => {
      await tx.query('delete from flashcard_decks where id=$1', [idOf(r)]);
      await recordAudit(tx, {
        adminId: r.admin!.id,
        action: 'edtech.deck.delete',
        entityType: 'flashcard_deck',
        entityId: idOf(r),
      });
      return { ok: true };
    });
  });

  app.get('/decks/:id/cards', async (r) => {
    await need(r);
    const cards = await db.query(
      'select * from flashcards where deck_id=$1 order by position, created_at',
      [idOf(r)],
    );
    return { cards };
  });

  app.post('/decks/:id/cards', async (r) => {
    await need(r, 'edtech.write');
    const body = cardBody.parse(r.body);
    return db.transaction(async (tx) => {
      const [deck] = await tx.query('select id from flashcard_decks where id=$1', [idOf(r)]);
      if (!deck) throw new ApiError(404, 'DECK_NOT_FOUND', 'Deck not found');
      const [row] = await tx.query<{ id: string }>(
        `insert into flashcards (deck_id, front, back, explanation, example, difficulty, position, status)
         values ($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,$6,$7,$8) returning id`,
        [
          idOf(r),
          JSON.stringify(body.front),
          JSON.stringify(body.back),
          JSON.stringify(body.explanation),
          JSON.stringify(body.example),
          body.difficulty,
          body.position,
          body.status,
        ],
      );
      await recordAudit(tx, {
        adminId: r.admin!.id,
        action: 'edtech.card.create',
        entityType: 'flashcard',
        entityId: row.id,
        details: { deckId: idOf(r) },
      });
      return { id: row.id };
    });
  });

  app.patch('/cards/:id', async (r) => {
    await need(r, 'edtech.write');
    const body = cardBody.partial().parse(r.body);
    return db.transaction(async (tx) => {
      await tx.query(
        `update flashcards set
           front = coalesce($2::jsonb, front), back = coalesce($3::jsonb, back),
           explanation = coalesce($4::jsonb, explanation), example = coalesce($5::jsonb, example),
           difficulty = coalesce($6, difficulty), position = coalesce($7, position),
           status = coalesce($8, status), updated_at = now()
         where id=$1`,
        [
          idOf(r),
          body.front ? JSON.stringify(body.front) : null,
          body.back ? JSON.stringify(body.back) : null,
          body.explanation ? JSON.stringify(body.explanation) : null,
          body.example ? JSON.stringify(body.example) : null,
          body.difficulty ?? null,
          body.position ?? null,
          body.status ?? null,
        ],
      );
      await recordAudit(tx, {
        adminId: r.admin!.id,
        action: 'edtech.card.update',
        entityType: 'flashcard',
        entityId: idOf(r),
      });
      return { ok: true };
    });
  });

  app.delete('/cards/:id', async (r) => {
    await need(r, 'edtech.write');
    return db.transaction(async (tx) => {
      await tx.query('delete from flashcards where id=$1', [idOf(r)]);
      await recordAudit(tx, {
        adminId: r.admin!.id,
        action: 'edtech.card.delete',
        entityType: 'flashcard',
        entityId: idOf(r),
      });
      return { ok: true };
    });
  });

  // ------------------------------------------------------------ achievements
  app.get('/achievements', async (r) => {
    await need(r);
    const rows = await db.query(
      `select a.*, (select count(*)::int from user_achievements u where u.achievement_id=a.id) as awarded
         from achievements a order by a.sort_order, a.code`,
    );
    return { achievements: rows };
  });

  app.post('/achievements', async (r) => {
    await need(r, 'edtech.write');
    const body = achievementBody.parse(r.body);
    return db.transaction(async (tx) => {
      const [row] = await tx.query<{ id: string }>(
        `insert into achievements
          (code, title_uz, title_ru, title_en, description_uz, description_ru, description_en,
           icon, coin_reward, criteria, active, sort_order)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12) returning id`,
        [
          body.code,
          body.titleUz,
          body.titleRu,
          body.titleEn,
          body.descriptionUz,
          body.descriptionRu,
          body.descriptionEn,
          body.icon,
          body.coinReward,
          JSON.stringify(
            body.criteriaType ? { type: body.criteriaType, value: body.criteriaValue } : {},
          ),
          body.active,
          body.sortOrder,
        ],
      );
      await recordAudit(tx, {
        adminId: r.admin!.id,
        action: 'edtech.achievement.create',
        entityType: 'achievement',
        entityId: row.id,
        details: body,
      });
      return { id: row.id };
    });
  });

  app.patch('/achievements/:id', async (r) => {
    await need(r, 'edtech.write');
    const body = achievementBody.partial().parse(r.body);
    return db.transaction(async (tx) => {
      await tx.query(
        `update achievements set
           title_uz = coalesce($2, title_uz), title_ru = coalesce($3, title_ru),
           title_en = coalesce($4, title_en),
           description_uz = coalesce($5, description_uz),
           description_ru = coalesce($6, description_ru),
           description_en = coalesce($7, description_en),
           icon = coalesce($8, icon), coin_reward = coalesce($9, coin_reward),
           criteria = case when $10::boolean then $11::jsonb else criteria end,
           active = coalesce($12, active), sort_order = coalesce($13, sort_order)
         where id=$1`,
        [
          idOf(r),
          body.titleUz ?? null,
          body.titleRu ?? null,
          body.titleEn ?? null,
          body.descriptionUz ?? null,
          body.descriptionRu ?? null,
          body.descriptionEn ?? null,
          body.icon ?? null,
          body.coinReward ?? null,
          Object.prototype.hasOwnProperty.call(body, 'criteriaType'),
          JSON.stringify(
            body.criteriaType ? { type: body.criteriaType, value: body.criteriaValue ?? 0 } : {},
          ),
          body.active ?? null,
          body.sortOrder ?? null,
        ],
      );
      await recordAudit(tx, {
        adminId: r.admin!.id,
        action: 'edtech.achievement.update',
        entityType: 'achievement',
        entityId: idOf(r),
        details: body,
      });
      return { ok: true };
    });
  });

  // -------------------------------------------------------------- leaderboard
  app.get('/leaderboard', async (r) => {
    await need(r);
    const query = z
      .object({
        period: periodSchema.default('weekly'),
        subject: subjectSchema.default('all'),
        limit: z.coerce.number().int().min(1).max(500).default(100),
      })
      .parse(r.query);
    return computeLeaderboard(db, query.period as LeaderboardPeriod, query.subject, query.limit, null);
  });

  app.post('/leaderboard/snapshot', async (r) => {
    await need(r, 'edtech.write');
    const body = z
      .object({
        period: periodSchema.default('weekly'),
        subject: subjectSchema.default('all'),
      })
      .parse(r.body ?? {});
    const result = await computeLeaderboard(db, body.period as LeaderboardPeriod, body.subject, 1, null);
    const saved = await snapshotLeaderboard(
      db,
      body.period as LeaderboardPeriod,
      body.subject,
      result.range,
    );
    await recordAudit(db, {
      adminId: r.admin!.id,
      action: 'edtech.leaderboard.snapshot',
      entityType: 'leaderboard',
      details: { ...body, saved },
    });
    return { saved, range: result.range };
  });

  // ------------------------------------------------------------ mistake stats
  app.get('/mistakes', async (r) => {
    await need(r);
    const query = page(r);
    const rows = await db.query(
      `select subject, topic_key, topic,
         sum(times_wrong)::int as wrong,
         count(*)::int as questions,
         count(*) filter (where resolved)::int as resolved,
         count(*) filter (where times_wrong > 1)::int as repeated
       from user_mistakes
       where ($1='' or subject ilike '%'||$1||'%' or topic ilike '%'||$1||'%')
       group by subject, topic_key, topic
       order by wrong desc limit $2 offset $3`,
      [query.search, query.limit, query.offset],
    );
    const [total] = await db.query<{ n: number }>(
      `select count(distinct (subject, topic_key))::int as n from user_mistakes
        where ($1='' or subject ilike '%'||$1||'%' or topic ilike '%'||$1||'%')`,
      [query.search],
    );
    return { topics: rows, total: Number(total?.n ?? 0) };
  });

  // ----------------------------------------------------------------- reports
  app.get('/reports', async (r) => {
    await need(r);
    const query = page(r);
    const rows = await db.query(
      `select r.id, r.user_id, p.nickname, r.week_start::text, r.week_end::text, r.payload, r.created_at
         from weekly_reports r join profiles p on p.id=r.user_id
        where ($1='' or p.nickname ilike '%'||$1||'%')
        order by r.week_start desc, r.created_at desc limit $2 offset $3`,
      [query.search, query.limit, query.offset],
    );
    const [total] = await db.query<{ n: number }>(
      `select count(*)::int as n from weekly_reports r join profiles p on p.id=r.user_id
        where ($1='' or p.nickname ilike '%'||$1||'%')`,
      [query.search],
    );
    return { reports: rows, total: Number(total?.n ?? 0) };
  });

  app.get('/reports/export', async (r, reply) => {
    await need(r);
    const rows = await db.query<Record<string, unknown>>(
      `select p.nickname, r.week_start::text as week_start, r.week_end::text as week_end,
              (r.payload->>'questions')::int as questions,
              (r.payload->>'accuracy')::int as accuracy,
              (r.payload->>'score')::int as score,
              (r.payload->>'rank')::int as rank,
              (r.payload->>'daysActive')::int as days_active
         from weekly_reports r join profiles p on p.id=r.user_id
        order by r.week_start desc limit 5000`,
    );
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', 'attachment; filename="zerolax-weekly-reports.csv"');
    if (rows.length === 0)
      return '\ufeffnickname,week_start,week_end,questions,accuracy,score,rank,days_active';
    return csvOutput(rows);
  });

  // ---------------------------------------------------------------- settings
  app.get('/settings', async (r) => {
    await need(r);
    return getEdtechSettings(db);
  });

  app.put('/settings', async (r) => {
    await need(r, 'edtech.write');
    const body = z
      .object({
        intervals: z
          .object({
            again: z.number().int().min(0).max(365),
            hard: z.number().int().min(0).max(365),
            good: z.number().int().min(0).max(365),
            easy: z.number().int().min(0).max(365),
          })
          .partial()
          .optional(),
        leaderboardWeights: z
          .object({
            correct: z.number().int().min(0).max(1000),
            test: z.number().int().min(0).max(1000),
          })
          .partial()
          .optional(),
        streakRewards: z.record(z.string(), z.number().int().min(0).max(100000)).optional(),
      })
      .parse(r.body);
    const current = await getEdtechSettings(db);
    const intervals = { ...current.intervals, ...(body.intervals ?? {}) };
    const weights = { ...current.leaderboardWeights, ...(body.leaderboardWeights ?? {}) };
    const rewards = { ...current.streakRewards, ...(body.streakRewards ?? {}) };
    await db.query(
      `update edtech_settings set intervals=$1::jsonb, leaderboard_weights=$2::jsonb,
         streak_rewards=$3::jsonb, updated_at=now() where id=1`,
      [JSON.stringify(intervals), JSON.stringify(weights), JSON.stringify(rewards)],
    );
    await recordAudit(db, {
      adminId: r.admin!.id,
      action: 'edtech.settings.update',
      entityType: 'edtech_settings',
      details: body,
    });
    return { intervals, leaderboardWeights: weights, streakRewards: rewards };
  });

  // ---------------------------------------------------------------- activity
  app.get('/activity', async (r) => {
    await need(r);
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
        kind: z.string().max(30).default(''),
        subject: z.string().max(30).default(''),
      })
      .parse(r.query);
    const rows = await db.query(
      `select a.id, a.user_id, p.nickname, a.kind, a.subject, a.topic, a.correct, a.score,
              a.activity_date::text, a.occurred_at, a.source_type
         from learning_activity a join profiles p on p.id=a.user_id
        where ($1='' or a.kind=$1) and ($2='' or a.subject=$2)
        order by a.occurred_at desc limit $3 offset $4`,
      [query.kind, query.subject, query.limit, query.offset],
    );
    const [total] = await db.query<{ n: number }>(
      `select count(*)::int as n from learning_activity
        where ($1='' or kind=$1) and ($2='' or subject=$2)`,
      [query.kind, query.subject],
    );
    return { activity: rows, total: Number(total?.n ?? 0) };
  });
};
