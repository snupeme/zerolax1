import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Db } from '@zerolax/db';
import type { AppConfig } from '../config';
import {
  getEntranceHistory,
  getEntranceResult,
  getEntranceSession,
  listEntranceTests,
  saveEntranceAnswer,
  startEntranceTest,
  submitEntranceAttempt,
} from '../services/entrance';

interface Options {
  config: AppConfig;
  db: Db;
  userGuard: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

const answerSchema = z.object({
  questionId: z.string().uuid(),
  optionId: z.string().uuid(),
});

export const entranceRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  const { db, config } = options;
  app.addHook('preHandler', options.userGuard);

  app.get('/tests', async (request) => {
    return listEntranceTests(db, request.profile!);
  });

  app.post('/tests/:testId/start', async (request) => {
    const { testId } = request.params as { testId: string };
    return startEntranceTest(db, config, request.profile!, testId);
  });

  app.get('/tests/:testId/session', async (request) => {
    const { testId } = request.params as { testId: string };
    return getEntranceSession(db, request.profile!, testId);
  });

  app.put('/attempts/:attemptId/answer', async (request) => {
    const { attemptId } = request.params as { attemptId: string };
    const body = answerSchema.parse(request.body);
    return saveEntranceAnswer(db, request.profile!, attemptId, body.questionId, body.optionId);
  });

  app.post('/attempts/:attemptId/submit', async (request) => {
    const { attemptId } = request.params as { attemptId: string };
    return submitEntranceAttempt(db, request.profile!, attemptId);
  });

  app.get('/attempts/:attemptId/result', async (request) => {
    const { attemptId } = request.params as { attemptId: string };
    return getEntranceResult(db, request.profile!, attemptId);
  });

  app.get('/history', async (request) => {
    return { history: await getEntranceHistory(db, request.profile!) };
  });
};
