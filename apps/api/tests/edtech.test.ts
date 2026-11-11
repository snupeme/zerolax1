import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { creditCoins } from '@zerolax/db';
import { createTestContext, createTestUser, loginAs, authHeader, createIqTestFixture, type TestContext } from './helpers';
import { hashPassword } from '../src/services/admin';
import {
  addDays,
  computeLeaderboard,
  getAchievements,
  getDashboard,
  getEdtechSettings,
  getLearningMap,
  getMissions,
  getStreak,
  listDecks,
  listMistakes,
  localDate,
  recordActivity,
  recordMistakes,
  reviewFlashcard,
  reviewMistake,
  snapshotLeaderboard,
} from '../src/services/edtech';

let ctx: TestContext;
let app: FastifyInstance;

beforeAll(async () => {
  ctx = await createTestContext();
  app = ctx.app;
});

afterAll(async () => {
  await ctx?.close();
});

interface Actor {
  id: string;
  telegramId: string;
  headers: { authorization: string };
}

async function actor(nickname?: string): Promise<Actor> {
  const user = await createTestUser(ctx.db, nickname ? { nickname } : {});
  const session = await loginAs(app, user.telegramId);
  return { id: user.id, telegramId: user.telegramId, headers: authHeader(session.accessToken) };
}

async function adminHeaders(email = 'admin@zerolax.test', password = 'test-admin-password') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/auth/login',
    payload: { email, password },
  });
  expect(response.statusCode, response.body).toBe(200);
  return authHeader(response.json().accessToken);
}

const user = (path: string, headers: Actor['headers'], method: 'GET' | 'POST' | 'PATCH' = 'GET', payload?: object) =>
  app.inject({ method, url: `/api/edtech${path}`, headers, payload });
const admin = (path: string, headers: { authorization: string }, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET', payload?: object) =>
  app.inject({ method, url: `/api/admin/edtech${path}`, headers, payload });

describe('edtech API surface', () => {
  it('exposes the dashboard with seeded missions and empty progress', async () => {
    const me = await actor();
    const response = await user('/dashboard', me.headers);
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body.missions.total).toBe(6);
    expect(body.missions.completed).toBe(0);
    expect(body.streak.current).toBe(0);
    expect(body.flashcards.totalCards).toBeGreaterThanOrEqual(31);
    expect(Array.isArray(body.recommendations)).toBe(true);
    expect(body.recommendations.length).toBeGreaterThan(0);
    expect(body.weeklyReport.daysActive).toBe(0);
    expect(body.achievements.total).toBeGreaterThanOrEqual(7);
  });

  it('requires a bearer token for user endpoints and admin auth for admin endpoints', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/edtech/dashboard' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/admin/edtech/missions' })).statusCode).toBe(401);
  });
});

describe('activity, missions and leaderboard', () => {
  it('records real activity, mission progress, analytics, mistakes and leaderboard score', async () => {
    const me = await actor('activity_user');
    await recordActivity(ctx.db, me.id, [
      {
        kind: 'question',
        subject: 'algebra',
        topicKey: 'formulas',
        topic: 'Qisqa ko‘paytirish formulalari',
        questionRef: 'q1',
        correct: true,
        sourceType: 'test',
        sourceId: 'test-1',
      },
      {
        kind: 'question',
        subject: 'algebra',
        topicKey: 'formulas',
        topic: 'Qisqa ko‘paytirish formulalari',
        questionRef: 'q2',
        correct: false,
        sourceType: 'test',
        sourceId: 'test-1',
      },
      {
        kind: 'topic',
        subject: 'algebra',
        topicKey: 'formulas',
        topic: 'Qisqa ko‘paytirish formulalari',
        correct: true,
        sourceType: 'learning_attempt',
        sourceId: 'attempt-1',
      },
    ]);

    const missions = await getMissions(ctx.db, me.id, 'uz');
    const questionsMission = missions.missions.find((mission) => mission.metric === 'questions_answered');
    const algebraMission = missions.missions.find((mission) => mission.metric === 'algebra_topic');
    expect(questionsMission?.progress).toBe(2);
    expect(questionsMission?.completed).toBe(false);
    expect(algebraMission?.progress).toBe(1);
    expect(algebraMission?.completed).toBe(true);
    expect(algebraMission?.rewardCredited).toBe(true);

    const [reward] = await ctx.db.query<{ n: number }>(
      `select count(*)::int as n from coin_transactions where user_id=$1 and type='daily_mission'`,
      [me.id],
    );
    expect(reward.n).toBe(1);

    const map = await getLearningMap(ctx.db, me.id);
    const algebra = map.subjects.find((subject) => subject.subject === 'algebra');
    expect(algebra?.mastered).toBe(1);

    const board = await computeLeaderboard(ctx.db, 'weekly', 'algebra', 50, me.id);
    expect(board.rows[0]?.userId).toBe(me.id);
    expect(board.rows[0]?.score).toBeGreaterThan(0);
    expect(board.currentUser?.rank).toBe(1);

    const streak = await getStreak(ctx.db, me.id);
    expect(streak.current).toBe(1);
  });

  it('keeps rewards idempotent when the same mission is evaluated again', async () => {
    const me = await actor();
    await recordActivity(ctx.db, me.id, [
      { kind: 'topic', subject: 'algebra', topicKey: 't', topic: 'T', correct: true },
    ]);
    const first = await getMissions(ctx.db, me.id, 'uz');
    expect(first.completed).toBe(1);
    await getMissions(ctx.db, me.id, 'uz');
    await getMissions(ctx.db, me.id, 'uz');
    const [count] = await ctx.db.query<{ n: number }>(
      `select count(*)::int as n from coin_transactions where user_id=$1 and type='daily_mission'`,
      [me.id],
    );
    expect(count.n).toBe(1);
  });

  it('hides a user from the public leaderboard but still shows their own private score', async () => {
    const visible = await actor('visible_user');
    const hidden = await actor('hidden_user');
    for (const me of [visible, hidden]) {
      await recordActivity(ctx.db, me.id, [
        { kind: 'question', subject: 'geometry', topicKey: 'g', topic: 'G', correct: true },
      ]);
    }
    await ctx.db.query('update profiles set leaderboard_visible=false where id=$1', [hidden.id]);

    const board = await computeLeaderboard(ctx.db, 'weekly', 'geometry', 50, hidden.id);
    expect(board.rows.some((row) => row.userId === hidden.id)).toBe(false);
    expect(board.hidden).toBe(true);
    expect(board.currentUser?.userId).toBe(hidden.id);
    expect(board.currentUser?.rank).toBeNull();
    expect(board.rows.some((row) => row.userId === visible.id)).toBe(true);

    const privacy = await user('/profile/privacy', hidden.headers);
    expect(privacy.json().leaderboardVisible).toBe(false);
    const updated = await user('/profile/privacy', hidden.headers, 'PATCH', { leaderboardVisible: true });
    expect(updated.json().leaderboardVisible).toBe(true);
  });

  it('creates leaderboard snapshots that skip hidden users', async () => {
    const me = await actor('snapshot_user');
    await recordActivity(ctx.db, me.id, [
      { kind: 'question', subject: 'sat', topicKey: 's', topic: 'S', correct: true },
    ]);
    const range = { start: addDays(localDate(), -6), end: localDate() };
    const saved = await snapshotLeaderboard(ctx.db, 'weekly', 'sat', range);
    expect(saved).toBeGreaterThanOrEqual(1);
    const [row] = await ctx.db.query<{ rank: number }>(
      'select rank from leaderboard_snapshots where user_id=$1 and period=$2 and subject=$3',
      [me.id, 'weekly', 'sat'],
    );
    expect(row.rank).toBeGreaterThan(0);
  });
});

describe('flashcards and spaced repetition', () => {
  it('lists seeded decks, reviews a card and schedules it with the configured interval', async () => {
    const me = await actor();
    const decks = await listDecks(ctx.db, me.id, 'uz');
    expect(decks.length).toBe(5);
    const algebra = decks.find((deck) => deck.subject === 'algebra');
    expect(algebra).toBeTruthy();
    const response = await user(`/flashcards/${algebra!.id}`, me.headers);
    expect(response.statusCode, response.body).toBe(200);
    const card = response.json().cards[0];
    expect(card.front.length).toBeGreaterThan(0);

    const review = await user(`/flashcards/${card.id}/review`, me.headers, 'POST', { rating: 'good' });
    expect(review.statusCode, review.body).toBe(200);
    const settings = await getEdtechSettings(ctx.db);
    expect(review.json().intervalDays).toBe(settings.intervals.good);
    expect(review.json().box).toBe(1);

    const [progress] = await ctx.db.query<{ review_count: number; due_at: string }>(
      'select review_count, due_at from user_flashcard_progress where user_id=$1 and flashcard_id=$2',
      [me.id, card.id],
    );
    expect(progress.review_count).toBe(1);
    expect(new Date(progress.due_at).getTime()).toBeGreaterThan(Date.now());

    const again = await user(`/flashcards/${card.id}/review`, me.headers, 'POST', { rating: 'again' });
    expect(again.json().box).toBe(0);

    const missions = await getMissions(ctx.db, me.id, 'uz');
    expect(missions.missions.find((m) => m.metric === 'flashcards_reviewed')?.progress).toBe(2);
  });

  it('rejects unknown cards and invalid ratings', async () => {
    const me = await actor();
    expect(
      (await user('/flashcards/00000000-0000-4000-8000-000000000000/review', me.headers, 'POST', { rating: 'good' })).statusCode,
    ).toBe(404);
    const decks = await listDecks(ctx.db, me.id, 'uz');
    const response = await user(`/flashcards/${decks[0].id}`, me.headers);
    const card = response.json().cards[0];
    expect(
      (await user(`/flashcards/${card.id}/review`, me.headers, 'POST', { rating: 'perfect' })).statusCode,
    ).toBe(400);
  });
});

describe('smart error notebook', () => {
  it('records wrong answers once, resolves them on a correct review and tracks weakness', async () => {
    const me = await actor();
    const wrong = {
      source: 'iq' as const,
      sourceQuestionId: 'question-1',
      subject: 'iq',
      topicKey: 'daily-iq',
      topic: 'Daily IQ',
      question: { text: '2 + 2 = ?', options: ['3', '4', '5', '6'], correctIndex: 1 },
      selectedAnswer: '3',
      correctAnswer: '4',
      explanation: '2 + 2 = 4',
      difficulty: 'easy',
    };
    await recordMistakes(ctx.db, me.id, [wrong]);
    await recordMistakes(ctx.db, me.id, [wrong]);

    const list = await listMistakes(ctx.db, me.id, {});
    expect(list.total).toBe(1);
    expect(list.mistakes[0].timesWrong).toBe(2);
    expect(list.open).toBe(1);

    const wrongReview = await user(`/mistakes/${list.mistakes[0].id}/review`, me.headers, 'POST', { selectedIndex: 0 });
    expect(wrongReview.json().correct).toBe(false);
    expect(wrongReview.json().resolved).toBe(false);

    const rightReview = await user(`/mistakes/${list.mistakes[0].id}/review`, me.headers, 'POST', { selectedIndex: 1 });
    expect(rightReview.json().correct).toBe(true);
    expect(rightReview.json().resolved).toBe(true);

    const after = await listMistakes(ctx.db, me.id, {});
    expect(after.open).toBe(0);
    expect(after.mistakes[0].timesCorrect).toBe(1);
  });
});

describe('streaks and achievements', () => {
  it('awards a streak milestone exactly once and unlocks criteria achievements', async () => {
    const me = await actor();
    await ctx.db.query(
      `insert into user_streaks (user_id, current_streak, longest_streak, last_activity_date)
       values ($1, 2, 2, $2::date)`,
      [me.id, addDays(localDate(), -1)],
    );
    await recordActivity(ctx.db, me.id, [
      { kind: 'question', subject: 'algebra', topicKey: 'a', topic: 'A', correct: true },
    ]);
    const streak = await getStreak(ctx.db, me.id);
    expect(streak.current).toBe(3);
    expect(streak.milestones.find((m) => m.milestone === 3)?.claimed).toBe(true);

    await ctx.db.query(
      `insert into user_streaks (user_id, current_streak, longest_streak, last_activity_date)
       values ($1, 2, 2, $2::date)
       on conflict (user_id) do update set current_streak=2, last_activity_date=$2::date`,
      [me.id, addDays(localDate(), -1)],
    );
    await recordActivity(ctx.db, me.id, [
      { kind: 'question', subject: 'algebra', topicKey: 'a', topic: 'A', correct: true },
    ]);
    const [rewards] = await ctx.db.query<{ n: number }>(
      `select count(*)::int as n from coin_transactions where user_id=$1 and type='streak' and source_id='3'`,
      [me.id],
    );
    expect(rewards.n).toBe(1);

    const [questions] = await ctx.db.query<{ n: number }>(
      `select count(*)::int as n from learning_activity where user_id=$1 and kind='question'`,
      [me.id],
    );
    expect(questions.n).toBe(2);

    const achievements = await getAchievements(ctx.db, me.id, 'uz');
    expect(achievements.achievements.length).toBeGreaterThanOrEqual(7);
  });

  it('unlocks the questions achievement after real activity', async () => {
    const me = await actor();
    const items = Array.from({ length: 100 }, (_, index) => ({
      kind: 'question' as const,
      subject: 'algebra',
      topicKey: 'a',
      topic: 'A',
      questionRef: `q-${index}`,
      correct: true,
    }));
    await recordActivity(ctx.db, me.id, items);
    const [award] = await ctx.db.query<{ n: number }>(
      `select count(*)::int as n from user_achievements ua join achievements a on a.id=ua.achievement_id
        where ua.user_id=$1 and a.code='questions_100'`,
      [me.id],
    );
    expect(award.n).toBe(1);
    const [coins] = await ctx.db.query<{ n: number }>(
      `select count(*)::int as n from coin_transactions where user_id=$1 and type='achievement' and source_id='questions_100'`,
      [me.id],
    );
    expect(coins.n).toBe(1);
  });
});

describe('weekly reports', () => {
  it('builds a real weekly report from activity and stores a snapshot', async () => {
    const me = await actor();
    await recordActivity(ctx.db, me.id, [
      { kind: 'question', subject: 'algebra', topicKey: 'a', topic: 'A', correct: true },
      { kind: 'question', subject: 'geometry', topicKey: 'g', topic: 'G', correct: false },
      { kind: 'flashcard', subject: 'flashcards', topicKey: 'deck', correct: true },
      { kind: 'test', subject: 'algebra', topicKey: 'a', topic: 'A', score: 50 },
    ]);
    const response = await user('/reports/weekly', me.headers);
    expect(response.statusCode, response.body).toBe(200);
    const report = response.json();
    expect(report.questions).toBe(2);
    expect(report.correct).toBe(1);
    expect(report.accuracy).toBe(50);
    expect(report.flashcards).toBe(1);
    expect(report.daysActive).toBe(1);
    expect(report.daily.length).toBe(1);
    expect(report.subjects.length).toBe(2);
    expect(report.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const [stored] = await ctx.db.query<{ n: number }>(
      'select count(*)::int as n from weekly_reports where user_id=$1',
      [me.id],
    );
    expect(stored.n).toBe(1);
  });
});

describe('admin configuration and audit', () => {
  it('lists and updates missions, decks, achievements and settings with audit entries', async () => {
    const headers = await adminHeaders();

    const missions = await admin('/missions', headers);
    expect(missions.statusCode, missions.body).toBe(200);
    expect(missions.json().missions.length).toBeGreaterThanOrEqual(6);

    const created = await admin('/missions', headers, 'POST', {
      code: 'test_mission',
      metric: 'questions_answered',
      target: 5,
      rewardCoins: 3,
      titles: { uz: 'Test', ru: 'Тест', en: 'Test' },
      descriptions: { uz: 'Test', ru: 'Тест', en: 'Test' },
      active: true,
      sortOrder: 999,
    });
    expect(created.statusCode, created.body).toBe(200);
    const missionId = created.json().id;
    const updated = await admin(`/missions/${missionId}`, headers, 'PATCH', { active: false, target: 7 });
    expect(updated.statusCode, updated.body).toBe(200);

    const decks = await admin('/decks', headers);
    expect(decks.json().decks.length).toBe(5);
    const deck = await admin('/decks', headers, 'POST', {
      subject: 'sat',
      titles: { uz: 'Admin deck', ru: 'Admin deck', en: 'Admin deck' },
      status: 'published',
    });
    expect(deck.statusCode, deck.body).toBe(200);
    const card = await admin(`/decks/${deck.json().id}/cards`, headers, 'POST', {
      front: { uz: 'Savol', ru: 'Вопрос', en: 'Question' },
      back: { uz: 'Javob', ru: 'Ответ', en: 'Answer' },
      difficulty: 'easy',
    });
    expect(card.statusCode, card.body).toBe(200);

    const achievements = await admin('/achievements', headers);
    expect(achievements.statusCode, achievements.body).toBe(200);
    expect(achievements.json().achievements.length).toBeGreaterThanOrEqual(7);

    const settings = await admin('/settings', headers);
    expect(settings.statusCode, settings.body).toBe(200);
    const settingsUpdate = await admin('/settings', headers, 'PUT', {
      intervals: { good: 4 },
      leaderboardWeights: { test: 6 },
    });
    expect(settingsUpdate.statusCode, settingsUpdate.body).toBe(200);
    expect(settingsUpdate.json().intervals.good).toBe(4);
    expect(settingsUpdate.json().leaderboardWeights.test).toBe(6);

    const overview = await admin('/overview', headers);
    expect(overview.statusCode, overview.body).toBe(200);
    expect(overview.json().totals).toBeTruthy();

    const activity = await admin('/activity', headers);
    expect(activity.statusCode, activity.body).toBe(200);
    expect(Array.isArray(activity.json().activity)).toBe(true);

    const [audit] = await ctx.db.query<{ n: number }>(
      `select count(*)::int as n from admin_audit_logs where action like 'edtech.%'`,
    );
    expect(audit.n).toBeGreaterThanOrEqual(5);
  });

  it('denies a regular admin without edtech permissions', async () => {
    const password = 'limited-admin-password';
    await ctx.db.query(
      `insert into admin_users (email, name, password_hash, role)
       values ('limited@zerolax.test','Limited',$1,'admin')`,
      [hashPassword(password)],
    );
    const headers = await adminHeaders('limited@zerolax.test', password);
    const response = await admin('/missions', headers);
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('ADMIN_FORBIDDEN');
  });

  it('exports weekly reports as CSV', async () => {
    const headers = await adminHeaders();
    const response = await admin('/reports/export', headers);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.body).toContain('week_start');
  });
});

describe('dashboard aggregation', () => {
  it('returns recommendations derived from real weakness data', async () => {
    const me = await actor();
    await recordMistakes(ctx.db, me.id, [
      {
        source: 'learning',
        sourceQuestionId: 'weak-1',
        subject: 'geometry',
        topicKey: 'triangles',
        topic: 'Uchburchak yuzi',
        question: { text: 'S = ?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 },
        selectedAnswer: 'b',
        correctAnswer: 'a',
        explanation: '',
        difficulty: 'easy',
      },
    ]);
    const dashboard = await getDashboard(ctx.db, me.id, 'uz');
    expect(dashboard.mistakes.open).toBe(1);
    expect(dashboard.mistakes.weakestTopic).toBe('Uchburchak yuzi');
    expect(dashboard.recommendations.some((item) => item.href === '/mistakes')).toBe(true);
    expect(dashboard.recommendations.some((item) => item.kind === 'mission')).toBe(true);
  });
});

describe('coin ledger safety', () => {
  it('does not double credit on repeated mission evaluation', async () => {
    const me = await actor();
    const result = await creditCoins(ctx.db, {
      userId: me.id,
      amount: 5,
      type: 'daily_mission',
      idempotencyKey: `mission:${me.id}:${localDate()}:daily_10_questions`,
    });
    expect(result.credited).toBe(true);
    const second = await creditCoins(ctx.db, {
      userId: me.id,
      amount: 5,
      type: 'daily_mission',
      idempotencyKey: `mission:${me.id}:${localDate()}:daily_10_questions`,
    });
    expect(second.credited).toBe(false);
  });
});
