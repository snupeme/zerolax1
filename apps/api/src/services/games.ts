import { randomInt } from "node:crypto";
import { creditCoins, type Db, type Queryable } from "@zerolax/db";
import {
  GAME_IDS, GAME_OPERATIONS, gameAvailableForGrade,
  gameLevelSchema,
  gameRewardsSchema,
  tashkentDayStartUtc,
  tashkentDateString,
  type GameDefinition,
  type GameLevel,
  type GameDifficulty,
  type GameId,
  type GameAnswer,
  type GameSession,
  type GameQuestion,
} from "@zerolax/shared";
import { ApiError } from "../errors";
import { getPlatformSettings } from "./admin-control";
import { recordGameRound } from "./edtech-recording";
interface DefinitionRow {
  id: GameId;
  enabled: boolean;
  titles: GameDefinition["titles"];
  descriptions: GameDefinition["descriptions"];
  illustration_url: string;
  questions_per_round: number;
  rewards: GameDefinition["rewards"];
}
interface SessionRow {
  id: string;
  user_id: string;
  game_id: GameId;
  grade: number;
  difficulty: GameDifficulty;
  status: GameSession["status"];
  settings: { definition: GameDefinition; level: GameLevel };
  total: number;
  current_index: number;
  correct_count: number;
  answered_count: number;
  score: number;
  coins_earned: number;
  elapsed_ms: number | string;
  active_since: string | null;
}
interface Payload {
  game: GameId;
  a: number;
  b: number;
  c: number;
  choices: number[];
}
interface QuestionRow {
  id: string;
  position: number;
  payload: Payload;
  solution: number;
  remainder: number;
  answer: GameAnswer | null;
  correct: boolean | null;
}
const integer = (a: number, b: number) => randomInt(a, b + 1);
export function generateGameQuestion(
  game: GameId,
  level: GameLevel,
  difficulty: GameDifficulty,
) {
  const operation = GAME_OPERATIONS[game];
  const scale =
    difficulty === "easy" ? 0.5 : difficulty === "normal" ? 0.75 : 1;
  const limit = Math.min(
    level.maxValue,
    Math.max(level.minValue + 2, Math.floor(level.maxValue * scale)),
  );
  let a = 0,
    b = 0,
    c = 0,
    solution = 0,
    remainder = 0;
  if (operation === "addition") {
    a = integer(Math.min(level.minValue, limit - 2), limit - 1);
    b = integer(0, limit - a);
    if (level.multiStep) c = integer(0, Math.min(20, limit - a - b));
    solution = a + b + c;
  }
  if (operation === "subtraction") {
    a = integer(Math.max(2, Math.min(level.minValue, limit)), limit);
    b = integer(0, a);
    if (level.multiStep) c = integer(0, Math.min(20, a - b));
    solution = a - b - c;
  }
  if (operation === "multiplication" || operation === "division") {
    const pairs: Array<[number, number]> = [];
    for (let groups = 2; groups <= level.maxGroups; groups++)
      for (let each = 1; each <= level.maxPerGroup; each++)
        if (groups * each >= level.minValue && groups * each <= level.maxValue)
          pairs.push([groups, each]);
    if (!pairs.length)
      throw new ApiError(
        400,
        "GAME_INVALID_RANGE",
        "No valid equal groups fit this number range",
      );
    const scaled = pairs.filter(
      ([g, e]) =>
        g <= Math.max(2, Math.floor(level.maxGroups * scale)) &&
        e <= Math.max(1, Math.floor(level.maxPerGroup * scale)) &&
        g * e <= limit,
    );
    const pool = scaled.length ? scaled : pairs;
    const [groups, each] = pool[integer(0, pool.length - 1)];
    const groupLimit = Math.max(limit, groups * each);
    if (operation === "multiplication") {
      a = groups;
      b = each;
      if (level.multiStep) c = integer(0, Math.min(20, groupLimit - a * b));
      solution = a * b + c;
    } else {
      b = groups;
      a = groups * each;
      // Exact division only: children choose a single answer.
      solution = each;
    }
  }
  const choices = new Set<number>([solution]);
  for (const candidate of [Math.max(0, solution - 1), solution + 1, solution + 2]) {
    if (choices.size < 3) choices.add(candidate);
  }
  const options = [...choices];
  for (let i = options.length - 1; i > 0; i--) { const j = integer(0, i); [options[i], options[j]] = [options[j], options[i]]; }
  return { payload: { game, a, b, c, choices: options }, solution, remainder };
}
function definition(row: DefinitionRow): GameDefinition {
  return {
    id: row.id,
    enabled: row.enabled,
    titles: row.titles,
    descriptions: row.descriptions,
    illustrationUrl: row.illustration_url,
    questionsPerRound: row.questions_per_round,
    rewards: gameRewardsSchema.parse(row.rewards),
  };
}
export async function gameDefinitions(db: Queryable) {
  return (
    await db.query<DefinitionRow>(
      "select * from mini_games where archived_at is null order by case id when 'find-answer' then 1 when 'what-remains' then 2 when 'how-many' then 3 else 4 end",
    )
  ).map(definition);
}
async function enabled(db: Queryable, game: GameId, grade: number) {
  if (!gameAvailableForGrade(game, grade)) throw new ApiError(403, 'GAME_UNAVAILABLE', 'This game starts in a later grade');
  const [g] = await db.query<DefinitionRow>(
    "select * from mini_games where id=$1 and enabled=true and archived_at is null",
    [game],
  );
  const [l] = await db.query<{ config: GameLevel }>(
    "select config from mini_game_levels where game_id=$1 and grade=$2",
    [game, grade],
  );
  if (!g || !l || !l.config.enabled)
    throw new ApiError(
      403,
      "GAME_UNAVAILABLE",
      "This game or grade is currently disabled",
    );
  return { definition: definition(g), level: gameLevelSchema.parse(l.config) };
}
function publicQuestion(q: QuestionRow): GameQuestion {
  return { id: q.id, position: q.position, ...q.payload };
}
export async function gameSession(
  db: Queryable,
  userId: string,
  id: string,
): Promise<GameSession> {
  const [s] = await db.query<SessionRow>(
    "select * from mini_game_sessions where id=$1 and user_id=$2",
    [id, userId],
  );
  if (!s)
    throw new ApiError(404, "GAME_SESSION_NOT_FOUND", "Game session not found");
  if (!GAME_IDS.includes(s.game_id)) throw new ApiError(410, 'GAME_ARCHIVED', 'This old game has been archived');
  const qs = await db.query<QuestionRow>(
    "select * from mini_game_questions where session_id=$1 order by position",
    [id],
  );
  const current = qs[s.current_index];
  const feedback = (q: QuestionRow) =>
    q.answer
      ? {
          correct: !!q.correct,
          solution: q.solution,
          answer: q.answer,
        }
      : null;
  return {
    id: s.id,
    gameId: s.game_id,
    grade: s.grade,
    difficulty: s.difficulty,
    status: s.status,
    total: s.total,
    currentIndex: s.current_index,
    answered: s.answered_count,
    correct: s.correct_count,
    score: s.score,
    coins: s.coins_earned,
    elapsedMs: Number(s.elapsed_ms),
    activeSince: s.active_since,
    question: current ? publicQuestion(current) : null,
    feedback: current ? feedback(current) : null,
    ...(s.status === "completed"
      ? {
          review: qs.map((q) => ({
            question: publicQuestion(q),
            feedback: feedback(q)!,
          })),
        }
      : {}),
  };
}
export async function startGame(
  db: Db,
  userId: string,
  game: GameId,
  grade: number,
  restartSessionId?: string,
) {
  const id = await db.transaction(async (tx) => {
    await tx.query("select id from profiles where id=$1 for update", [userId]);
    const settings = await enabled(tx, game, grade);
    const difficulty = settings.level.difficulty;
    const [active] = await tx.query<SessionRow>(
      "select * from mini_game_sessions where user_id=$1 and status in ('playing','paused') for update",
      [userId],
    );
    if (restartSessionId) {
      if (!active || active.id !== restartSessionId)
        throw new ApiError(
          409,
          "GAME_RESTART_CONFLICT",
          "The selected round is no longer active",
        );
      await tx.query(
        "update mini_game_sessions set status='abandoned',finished_at=now(),active_since=null where id=$1",
        [active.id],
      );
    } else if (active) {
      if (
        active.game_id === game &&
        active.grade === grade &&
        active.difficulty === difficulty
      )
        return active.id;
      throw new ApiError(
        409,
        "GAME_ACTIVE",
        "Finish or exit the active round first",
        { sessionId: active.id },
      );
    }
    const [session] = await tx.query<{ id: string }>(
      "insert into mini_game_sessions(user_id,game_id,grade,difficulty,settings,total) values($1,$2,$3,$4,$5,$6) returning id",
      [
        userId,
        game,
        grade,
        difficulty,
        JSON.stringify(settings),
        settings.definition.questionsPerRound,
      ],
    );
    const seen = new Set<string>();
    for (
      let position = 0;
      position < settings.definition.questionsPerRound;
      position++
    ) {
      let q = generateGameQuestion(game, settings.level, difficulty);
      for (
        let tries = 0;
        seen.has(JSON.stringify([q.payload.game,q.payload.a,q.payload.b,q.payload.c])) && tries < 150;
        tries++
      )
        q = generateGameQuestion(game, settings.level, difficulty);
      seen.add(JSON.stringify([q.payload.game,q.payload.a,q.payload.b,q.payload.c]));
      await tx.query(
        "insert into mini_game_questions(session_id,position,payload,solution,remainder) values($1,$2,$3,$4,$5)",
        [
          session.id,
          position,
          JSON.stringify(q.payload),
          q.solution,
          q.remainder,
        ],
      );
    }
    return session.id;
  });
  return gameSession(db, userId, id);
}
async function locked(tx: Queryable, userId: string, id: string) {
  await tx.query("select id from profiles where id=$1 for update", [userId]);
  const [s] = await tx.query<SessionRow>(
    "select * from mini_game_sessions where id=$1 and user_id=$2 for update",
    [id, userId],
  );
  if (!s)
    throw new ApiError(404, "GAME_SESSION_NOT_FOUND", "Game session not found");
  if (!GAME_IDS.includes(s.game_id)) throw new ApiError(410,'GAME_ARCHIVED','This old game has been archived');
  return s;
}
async function finalize(tx: Queryable, s: SessionRow) {
  const [counts] = await tx.query<{ answered: number; correct: number }>(
    "select count(*) filter(where answer is not null)::int as answered,count(*) filter(where correct=true)::int as correct from mini_game_questions where session_id=$1",
    [s.id],
  );
  if (counts.answered !== s.total)
    throw new ApiError(
      409,
      "GAME_INCOMPLETE",
      "Answer every question before completing the round",
    );
  const score = Math.round((counts.correct * 100) / s.total);
  const rules = s.settings.definition.rewards;
  let coins =
    rules.correct * counts.correct +
    rules.completion +
    (counts.correct === s.total ? rules.perfect : 0);
  if (!(await getPlatformSettings(tx)).rewards.enabled) coins = 0;
  const [today] = await tx.query<{ total: string }>(
    "select coalesce(sum(amount),0)::text as total from coin_transactions where user_id=$1 and type='mini_game' and created_at>=$2",
    [s.user_id, tashkentDayStartUtc(tashkentDateString()).toISOString()],
  );
  coins = Math.min(coins, Math.max(0, rules.dailyCap - Number(today.total)));
  await creditCoins(tx, {
    userId: s.user_id,
    amount: coins,
    type: "mini_game",
    sourceType: "mini_game",
    sourceId: s.id,
    idempotencyKey: "mini-game:" + s.id,
    description: "Mini-game round: " + s.game_id,
  });
  await tx.query(
    `update mini_game_sessions set status='completed',correct_count=$2,answered_count=$3,score=$4,coins_earned=$5,finished_at=now(),elapsed_ms=elapsed_ms+case when active_since is null then 0 else greatest(0,extract(epoch from now()-active_since)*1000)::bigint end,active_since=null where id=$1`,
    [s.id, counts.correct, counts.answered, score, coins],
  );
  await tx.query(
    `insert into mini_game_progress(user_id,game_id,grade,difficulty,completed_rounds,correct_answers,total_answers,best_score,coins) values($1,$2,$3,$4,1,$5,$6,$7,$8) on conflict(user_id,game_id,grade,difficulty) do update set completed_rounds=mini_game_progress.completed_rounds+1,correct_answers=mini_game_progress.correct_answers+excluded.correct_answers,total_answers=mini_game_progress.total_answers+excluded.total_answers,best_score=greatest(mini_game_progress.best_score,excluded.best_score),coins=mini_game_progress.coins+excluded.coins,updated_at=now()`,
    [
      s.user_id,
      s.game_id,
      s.grade,
      s.difficulty,
      counts.correct,
      s.total,
      score,
      coins,
    ],
  );
  await recordGameRound(tx, s.user_id, s.id, s.game_id);
}
export async function answerGame(
  db: Db,
  userId: string,
  id: string,
  questionId: string,
  answer: GameAnswer,
) {
  await db.transaction(async (tx) => {
    const s = await locked(tx, userId, id);
    const [q] = await tx.query<QuestionRow>(
      "select * from mini_game_questions where id=$1 and session_id=$2",
      [questionId, id],
    );
    if (!q || q.position !== s.current_index)
      throw new ApiError(
        409,
        "GAME_QUESTION_ORDER",
        "Only the current question can be answered",
      );
    if (q.answer) return; // Immutable first answer; retries return its recorded feedback.
    if (s.status !== "playing")
      throw new ApiError(
        409,
        "GAME_PAUSED",
        "Resume the round before answering",
      );
    // Existing rounds use their validated snapshot; disabling stops new rounds.
    if (!q.payload.choices.includes(answer.value)) throw new ApiError(400, 'GAME_INVALID_CHOICE', 'Choose one of the offered answers');
    const correct = answer.value === q.solution;
    await tx.query(
      "update mini_game_questions set answer=$2,correct=$3,answered_at=now() where id=$1",
      [q.id, JSON.stringify(answer), correct],
    );
    const answered = s.answered_count + 1;
    const count = s.correct_count + (correct ? 1 : 0);
    await tx.query(
      "update mini_game_sessions set answered_count=$2,correct_count=$3,score=$4 where id=$1",
      [id, answered, count, Math.round((count * 100) / s.total)],
    );
    if (answered === s.total) await finalize(tx, s);
  });
  return gameSession(db, userId, id);
}
export async function gameAction(
  db: Db,
  userId: string,
  id: string,
  action: "next" | "pause" | "resume" | "abandon" | "complete",
) {
  await db.transaction(async (tx) => {
    const s = await locked(tx, userId, id);
    if (s.status === "completed") {
      if (action === "complete" || action === "next") return;
      throw new ApiError(
        409,
        "GAME_FINISHED",
        "The round is already completed",
      );
    }
    if (s.status === "abandoned")
      throw new ApiError(409, "GAME_FINISHED", "The round has ended");
    if (action === "complete") {
      await finalize(tx, s);
      return;
    }
    if (action === "next") {
      if (s.status !== "playing")
        throw new ApiError(409, "GAME_PAUSED", "Resume the game");
      const [q] = await tx.query<{ answer: unknown }>(
        "select answer from mini_game_questions where session_id=$1 and position=$2",
        [id, s.current_index],
      );
      if (!q?.answer)
        throw new ApiError(
          409,
          "GAME_QUESTION_UNANSWERED",
          "Answer the current question first",
        );
      await tx.query(
        "update mini_game_sessions set current_index=current_index+1 where id=$1 and current_index+1<total",
        [id],
      );
    }
    if (action === "resume") {
      // Continue the settings snapshot even if new starts are disabled.
      if (s.status === "paused")
        await tx.query(
          "update mini_game_sessions set status='playing',active_since=now() where id=$1",
          [id],
        );
    }
    if (action === "pause" || action === "abandon")
      await tx.query(
        `update mini_game_sessions set status=$2,finished_at=case when $2='abandoned' then now() else null end,elapsed_ms=elapsed_ms+case when active_since is null then 0 else greatest(0,extract(epoch from now()-active_since)*1000)::bigint end,active_since=null where id=$1`,
        [id, action === "pause" ? "paused" : "abandoned"],
      );
  });
  return gameSession(db, userId, id);
}
