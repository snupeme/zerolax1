import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { createDb, runMigrations, type Db } from '@zerolax/db';
import {
  tashkentDateString,
  tashkentPublishInstant,
  type Language,
} from '@zerolax/shared';
import { buildApp } from '../src/app';
import { loadConfig, type AppConfig } from '../src/config';

export interface TestContext {
  db: Db;
  config: AppConfig;
  app: FastifyInstance;
  close: () => Promise<void>;
}

export async function createTestContext(
  overrides: Record<string, string> = {},
): Promise<TestContext> {
  const db = await createDb({ memory: true });
  await runMigrations(db);
  const config = loadConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret-zerolax-0123456789',
    WEB_URL: 'http://localhost:5173',
    DEV_AUTH_ENABLED: 'true',
    TELEGRAM_BOT_USERNAME: 'ZerolaxTestBot',
    ADMIN_EMAIL: 'admin@zerolax.test',
    ADMIN_PASSWORD: 'test-admin-password',
    ADMIN_NAME: 'Test Admin',
    ACCESS_TOKEN_TTL_SECONDS: '900',
    LOG_LEVEL: 'silent',
    ...overrides,
  });
  const app = await buildApp({ config, db, logger: false });
  await app.ready();
  return {
    db,
    config,
    app,
    async close() {
      await app.close();
      await db.close();
    },
  };
}

export interface TestUser {
  id: string;
  telegramId: string;
  nickname: string;
  language: Language;
}

export async function createTestUser(
  db: Db,
  input: Partial<TestUser> & { nickname?: string } = {},
): Promise<TestUser> {
  const telegramId = input.telegramId ?? String(900_100_000 + Math.floor(Math.random() * 1_000_000));
  const nickname = input.nickname ?? `user_${telegramId}`;
  const language = input.language ?? 'uz';
  const rows = await db.query<{ id: string }>(
    `insert into profiles (telegram_id, nickname, language, first_name, is_dev)
     values ($1, $2, $3, 'Test', true)
     returning id`,
    [telegramId, nickname, language],
  );
  return { id: rows[0].id, telegramId, nickname, language };
}

export async function loginAs(
  app: FastifyInstance,
  telegramId: string,
): Promise<{ accessToken: string; refreshToken: string; profile: { id: string } }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/dev',
    payload: { telegramId },
  });
  if (response.statusCode !== 200) {
    throw new Error(`dev login failed: ${response.statusCode} ${response.body}`);
  }
  return response.json();
}

export function authHeader(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

export interface SeededQuestion {
  id: string;
  correctOptionId: string;
  optionIds: string[];
}

export interface SeededIqTest {
  testId: string;
  date: string;
  questions: SeededQuestion[];
}

export async function createIqTestFixture(
  db: Db,
  options: {
    date?: string;
    releaseAt: Date;
    status?: 'draft' | 'scheduled' | 'published';
    questionCount?: number;
    coins?: number;
  },
): Promise<SeededIqTest> {
  const date = options.date ?? tashkentDateString();
  const status = options.status ?? 'published';
  const questionCount = options.questionCount ?? 10;
  const coins = options.coins ?? 1;
  const publishAt = tashkentPublishInstant(date);

  const rows = await db.query<{ id: string }>(
    `insert into daily_iq_tests
      (test_date, title_uz, title_ru, title_en, status, publish_at, published_at, release_at)
     values ($1, 'Test IQ', 'Test IQ', 'Test IQ', $2, $3, $4, $5)
     returning id`,
    [
      date,
      status,
      publishAt.toISOString(),
      status === 'published' ? publishAt.toISOString() : null,
      options.releaseAt.toISOString(),
    ],
  );
  const testId = rows[0].id;

  const questions: SeededQuestion[] = [];
  await db.transaction(async (tx) => {
    for (let index = 0; index < questionCount; index++) {
      const question = await tx.query<{ id: string }>(
        `insert into iq_questions
          (test_id, position, text_uz, text_ru, text_en, explanation_uz, explanation_ru, explanation_en,
           difficulty, coins, correct_option_index)
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'easy', $9, 0)
         returning id`,
        [
          testId,
          index + 1,
          `Savol ${index + 1}`,
          `Вопрос ${index + 1}`,
          `Question ${index + 1}`,
          `Izoh ${index + 1}`,
          `Объяснение ${index + 1}`,
          `Explanation ${index + 1}`,
          coins,
        ],
      );
      const optionIds: string[] = [];
      for (let optionIndex = 0; optionIndex < 4; optionIndex++) {
        const option = await tx.query<{ id: string }>(
          `insert into iq_question_options (question_id, position, text_uz, text_ru, text_en)
           values ($1, $2, $3, $4, $5)
           returning id`,
          [question[0].id, optionIndex, `Variant ${optionIndex}`, `Вариант ${optionIndex}`, `Option ${optionIndex}`],
        );
        optionIds.push(option[0].id);
      }
      questions.push({ id: question[0].id, correctOptionId: optionIds[0], optionIds });
    }
  });

  return { testId, date, questions };
}

export interface SeededEntranceTest {
  testId: string;
  questions: SeededQuestion[];
}

export async function createEntranceTestFixture(
  db: Db,
  options: {
    slug?: string;
    published?: boolean;
    questionCount?: number;
    durationSeconds?: number;
    coins?: number;
  } = {},
): Promise<SeededEntranceTest> {
  const slug = options.slug ?? `test-${Math.random().toString(36).slice(2, 10)}`;
  const questionCount = options.questionCount ?? 20;
  const durationSeconds = options.durationSeconds ?? 1800;
  const coins = options.coins ?? 1;
  const published = options.published ?? true;

  const rows = await db.query<{ id: string }>(
    `insert into entrance_tests
      (slug, title_uz, title_ru, title_en, subject, difficulty, duration_seconds, status, published_at)
     values ($1, 'Kirish testi', 'Вступительный тест', 'Entrance test', 'Mathematics', 'medium', $2, $3, $4)
     returning id`,
    [slug, durationSeconds, published ? 'published' : 'draft', published ? new Date().toISOString() : null],
  );
  const testId = rows[0].id;

  const questions: SeededQuestion[] = [];
  await db.transaction(async (tx) => {
    for (let index = 0; index < questionCount; index++) {
      const question = await tx.query<{ id: string }>(
        `insert into entrance_questions
          (test_id, position, text_uz, text_ru, text_en, explanation_uz, explanation_ru, explanation_en,
           difficulty, coins, correct_option_index)
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'easy', $9, 0)
         returning id`,
        [
          testId,
          index + 1,
          `Savol ${index + 1}`,
          `Вопрос ${index + 1}`,
          `Question ${index + 1}`,
          `Izoh ${index + 1}`,
          `Объяснение ${index + 1}`,
          `Explanation ${index + 1}`,
          coins,
        ],
      );
      const optionIds: string[] = [];
      for (let optionIndex = 0; optionIndex < 4; optionIndex++) {
        const option = await tx.query<{ id: string }>(
          `insert into entrance_question_options (question_id, position, text_uz, text_ru, text_en)
           values ($1, $2, $3, $4, $5)
           returning id`,
          [question[0].id, optionIndex, `Variant ${optionIndex}`, `Вариант ${optionIndex}`, `Option ${optionIndex}`],
        );
        optionIds.push(option[0].id);
      }
      questions.push({ id: question[0].id, correctOptionId: optionIds[0], optionIds });
    }
  });

  return { testId, questions };
}

export function signTelegramInitData(
  botToken: string,
  user: Record<string, unknown>,
  authDate: number,
): string {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'AAHtestQuery',
    user: JSON.stringify(user),
  });
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}
