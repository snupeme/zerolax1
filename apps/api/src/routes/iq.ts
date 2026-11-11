import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Db } from '@zerolax/db';
import type { AppConfig } from '../config';
import {
  getIqHistory,
  getIqResult,
  getIqToday,
  saveIqAnswer,
  startIqTest,
  submitIqAttempt,
} from '../services/iq';

interface Options {
  config: AppConfig;
  db: Db;
  userGuard: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

const answerSchema = z.object({
  questionId: z.string().uuid(),
  optionId: z.string().uuid(),
});

export const iqRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  const { db, config } = options;
  app.addHook('preHandler', options.userGuard);

  app.get('/today', async (request) => {
    return getIqToday(db, request.profile!);
  });

  app.post('/:testId/attempt', async (request) => {
    const { testId } = request.params as { testId: string };
    return startIqTest(db, request.profile!, testId);
  });

  app.put('/attempts/:attemptId/answer', async (request) => {
    const { attemptId } = request.params as { attemptId: string };
    const body = answerSchema.parse(request.body);
    return saveIqAnswer(db, request.profile!, attemptId, body.questionId, body.optionId);
  });

  app.post('/attempts/:attemptId/submit', async (request) => {
    const { attemptId } = request.params as { attemptId: string };
    return submitIqAttempt(db, request.profile!, attemptId);
  });

  app.get('/:testId/result', async (request) => {
    const { testId } = request.params as { testId: string };
    return getIqResult(db, config, request.profile!, testId);
  });

  app.get('/history', async (request) => {
    return { history: await getIqHistory(db, request.profile!) };
  });
};
