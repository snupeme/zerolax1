import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import type { Db } from "@zerolax/db";
import { z } from "zod";
import {
  GAME_IDS,
  gameAvailableForGrade,
  gameDefinitionSchema,
  gameLevelSchema,
  gameAnswerSchema,
  type GameLevel,
} from "@zerolax/shared";
import {
  gameDefinitions,
  gameSession,
  startGame,
  answerGame,
  gameAction,
  generateGameQuestion,
} from "../services/games";
import { requirePermission, safeDestination } from "../services/admin-control";
import { ApiError } from '../errors';
import { recordAudit } from "../services/admin";
interface Options {
  db: Db;
  userGuard: (r: FastifyRequest, p: FastifyReply) => Promise<void>;
  adminGuard: (r: FastifyRequest, p: FastifyReply) => Promise<void>;
}
const page = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
const sessionId = (r: FastifyRequest) =>
  z
    .string()
    .uuid()
    .parse((r.params as { id: string }).id);
export const gamesRoutes: FastifyPluginAsync<Options> = async (app, o) => {
  const { db } = o;
  await app.register(
    async (user) => {
      user.addHook("preHandler", o.userGuard);
      user.get("/", async (r) => {
        const definitions = await gameDefinitions(db);
        const levels = await db.query<{ game_id: string; config: GameLevel }>(
          "select l.game_id,l.config from mini_game_levels l join mini_games g on g.id=l.game_id where g.archived_at is null order by grade",
        );
        const stats = await db.query<{
          game_id: string;
          best: number;
          rounds: number;
          correct: number;
          total: number;
        }>(
          "select game_id,max(best_score)::int as best,sum(completed_rounds)::int as rounds,sum(correct_answers)::int as correct,sum(total_answers)::int as total from mini_game_progress where user_id=$1 group by game_id",
          [r.profile!.id],
        );
        return definitions.map((g) => {
          const s = stats.find((s) => s.game_id === g.id);
          return {
            ...g,
            levels: levels
              .filter((l) => l.game_id === g.id)
              .map((l) => l.config),
            bestScore: s?.best ?? 0,
            completedRounds: s?.rounds ?? 0,
            accuracy: s?.total ? Math.round((s.correct * 100) / s.total) : 0,
          };
        });
      });
      user.get("/active", async (r) => {
        const [s] = await db.query<{ id: string }>(
          "select id from mini_game_sessions where user_id=$1 and status in ('playing','paused')",
          [r.profile!.id],
        );
        return s ? gameSession(db, r.profile!.id, s.id) : null;
      });
      user.get("/history", async (r) => {
        const p = page.parse(r.query);
        return db.query(
          "select id,game_id,grade,difficulty,status,total,correct_count,score,coins_earned,started_at,finished_at from mini_game_sessions where user_id=$1 and status='completed' and game_id in ('find-answer','what-remains','how-many','share-equally') order by started_at desc limit $2 offset $3",
          [r.profile!.id, p.limit, p.offset],
        );
      });
      user.post("/start", (r) => {
        const b = z
          .object({
            gameId: z.enum(GAME_IDS),
            grade: z.number().int().min(1).max(5),
            restartSessionId: z.string().uuid().optional(),
          })
          .strict()
          .parse(r.body);
        return startGame(
          db,
          r.profile!.id,
          b.gameId,
          b.grade,
          b.restartSessionId,
        );
      });
      user.get("/sessions/:id", (r) =>
        gameSession(db, r.profile!.id, sessionId(r)),
      );
      user.post("/sessions/:id/answer", (r) => {
        const b = gameAnswerSchema.parse(r.body);
        return answerGame(
          db,
          r.profile!.id,
          sessionId(r),
          b.questionId,
          b.answer,
        );
      });
      user.post("/sessions/:id/:action", (r) => {
        const action = z
          .enum(["next", "pause", "resume", "abandon", "complete"])
          .parse((r.params as { action: string }).action);
        return gameAction(db, r.profile!.id, sessionId(r), action);
      });
    },
    { prefix: "/user" },
  );
  await app.register(
    async (admin) => {
      admin.addHook("preHandler", o.adminGuard);
      admin.get("/", async (r) => {
        await requirePermission(db, r.admin!, "games.read");
        return {
          definitions: await gameDefinitions(db),
          levels: await db.query(
            "select l.game_id,l.grade,l.config from mini_game_levels l join mini_games g on g.id=l.game_id where g.archived_at is null order by game_id,grade",
          ),
        };
      });
      admin.put("/:gameId", async (r) => {
        await requirePermission(db, r.admin!, "games.write");
        const game = z
          .enum(GAME_IDS)
          .parse((r.params as { gameId: string }).gameId);
        const b = gameDefinitionSchema.parse(r.body);
        if (b.illustrationUrl) safeDestination(b.illustrationUrl);
        return db.transaction(async (tx) => {
          const [before] = await tx.query(
            "select * from mini_games where id=$1",
            [game],
          );
          await tx.query(
            "update mini_games set enabled=$2,titles=$3,descriptions=$4,illustration_url=$5,questions_per_round=$6,rewards=$7,updated_at=now() where id=$1",
            [
              game,
              b.enabled,
              JSON.stringify(b.titles),
              JSON.stringify(b.descriptions),
              b.illustrationUrl,
              b.questionsPerRound,
              JSON.stringify(b.rewards),
            ],
          );
          await recordAudit(tx, {
            adminId: r.admin!.id,
            action: "games.definition.update",
            entityType: "mini_game",
            entityId: game,
            details: { before, after: b },
          });
          return { ok: true };
        });
      });
      admin.put("/:gameId/levels/:grade", async (r) => {
        await requirePermission(db, r.admin!, "games.write");
        const p = r.params as { gameId: string; grade: string };
        const game = z.enum(GAME_IDS).parse(p.gameId);
        const grade = z.coerce.number().int().min(1).max(5).parse(p.grade);
        const b = gameLevelSchema.parse({ ...(r.body as object), grade });
        if (b.enabled && !gameAvailableForGrade(game, grade)) throw new ApiError(400, 'GAME_INVALID_GRADE', 'This game is not appropriate for this grade');
        if (game === 'share-equally' && b.multiStep) throw new ApiError(400,'GAME_INVALID_LEVEL','This game uses exact single-step division');
        generateGameQuestion(game, b, b.difficulty);
        return db.transaction(async (tx) => {
          const [before] = await tx.query(
            "select config from mini_game_levels where game_id=$1 and grade=$2",
            [game, grade],
          );
          await tx.query(
            "update mini_game_levels set config=$3 where game_id=$1 and grade=$2",
            [game, grade, JSON.stringify(b)],
          );
          await recordAudit(tx, {
            adminId: r.admin!.id,
            action: "games.level.update",
            entityType: "mini_game",
            entityId: game,
            details: { grade, before, after: b },
          });
          return { ok: true };
        });
      });
      admin.get('/archive', async (r) => {
        await requirePermission(db, r.admin!, 'games.read');
        const p = page.parse(r.query);
        return {
          definitions: await db.query('select * from mini_games where archived_at is not null order by id'),
          sessions: await db.query('select s.id,s.user_id,s.game_id,s.grade,s.status,s.total,s.correct_count,s.score,s.coins_earned,s.started_at,s.finished_at from mini_game_sessions s join mini_games g on g.id=s.game_id where g.archived_at is not null order by s.started_at desc limit $1 offset $2', [p.limit,p.offset]),
          total: Number((await db.query<{n:string}>('select count(*)::text n from mini_game_sessions s join mini_games g on g.id=s.game_id where g.archived_at is not null'))[0].n),
        };
      });
      admin.get('/archive/sessions/:id', async (r) => {
        await requirePermission(db, r.admin!, 'games.read');
        const [session] = await db.query('select s.* from mini_game_sessions s join mini_games g on g.id=s.game_id where g.archived_at is not null and s.id=$1', [sessionId(r)]);
        if (!session) throw new ApiError(404,'GAME_SESSION_NOT_FOUND','Archived session not found');
        return {
          session,
          questions: await db.query('select * from mini_game_questions where session_id=$1 order by position',[sessionId(r)]),
          progress: await db.query('select p.* from mini_game_progress p join mini_game_sessions s on s.user_id=p.user_id and s.game_id=p.game_id and s.grade=p.grade and s.difficulty=p.difficulty where s.id=$1',[sessionId(r)]),
          rewards: await db.query("select id,amount,type,source_id,created_at from coin_transactions where source_id=$1 and type='mini_game'",[sessionId(r)]),
        };
      });
      admin.get("/analytics", async (r) => {
        await requirePermission(db, r.admin!, "games.read");
        return {
          games: await db.query(
            `select g.id,count(s.id)::int as started,count(s.id) filter(where s.status='completed')::int as completed,round(100.0*count(s.id) filter(where s.status='completed')/nullif(count(s.id),0),2) as completion_rate,round(avg(s.score) filter(where s.status='completed'),2) as average_score from mini_games g left join mini_game_sessions s on s.game_id=g.id where g.archived_at is null group by g.id order by count(s.id) desc`,
          ),
          grades: await db.query(
            `select game_id,grade,count(*)::int as completed,round(avg(score),2) as average_score from mini_game_sessions where status='completed' and game_id in ('find-answer','what-remains','how-many','share-equally') group by game_id,grade order by grade,game_id`,
          ),
        };
      });
    },
    { prefix: "/admin" },
  );
};
