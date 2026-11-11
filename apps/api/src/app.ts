import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import type { Db } from "@zerolax/db";
import { LANGUAGES, TIMEZONE } from "@zerolax/shared";
import type { AppConfig } from "./config";
import { ApiError } from "./errors";
import { createAdminGuard, createUserGuard } from "./auth/middleware";
import { authRoutes } from "./routes/auth";
import { userRoutes } from "./routes/user";
import { iqRoutes } from "./routes/iq";
import { entranceRoutes } from "./routes/entrance";
import { adminRoutes } from "./routes/admin";
import { internalBotRoutes } from "./routes/internal";
import { learningRoutes } from "./routes/learning";
import type { PaymentPlan } from "./services/learning-payments";
import {
  adminControlRoutes,
  publicContentRoutes,
} from "./routes/admin-control";
import { withoutTelegramIdentity } from "./serializers";
import { canAdmin, getPlatformSettings } from "./services/admin-control";
import {gamesRoutes} from './routes/games';
import {adminEdtechRoutes, edtechRoutes} from './routes/edtech';

export interface BuildAppOptions {
  config: AppConfig;
  db: Db;
  logger?: boolean;
  paymentPlan?: PaymentPlan;
}

function originAllowed(config: AppConfig, origin: string): boolean {
  const allowed = new Set<string>([config.webUrl, ...config.corsOrigins]);
  if (allowed.has(origin)) return true;
  // Local development servers on any port.
  if (
    !config.isProd &&
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  )
    return true;
  return false;
}

export async function buildApp(
  options: BuildAppOptions,
): Promise<FastifyInstance> {
  const { config, db } = options;
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: config.logLevel,
            transport: config.isProd ? undefined : undefined,
          },
    trustProxy: true,
    bodyLimit: 512 * 1024,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || originAllowed(config, origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "authorization"],
    maxAge: 600,
  });

  await app.register(rateLimit, {
    max: 240,
    timeWindow: "1 minute",
    allowList: [],
    errorResponseBuilder: () => ({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests, please try again shortly",
      },
    }),
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      });
      return;
    }

    if (error instanceof ZodError) {
      reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
      return;
    }

    const fastifyError = error as {
      statusCode?: number;
      code?: string;
      message?: string;
    };
    const statusCode =
      typeof fastifyError.statusCode === "number"
        ? fastifyError.statusCode
        : 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, "unhandled request error");
      reply.status(500).send({
        error: { code: "INTERNAL_ERROR", message: "Internal server error" },
      });
      return;
    }

    reply.status(statusCode).send({
      error: {
        code: fastifyError.code ?? "REQUEST_ERROR",
        message: fastifyError.message || "Request failed",
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: "NOT_FOUND",
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });

  app.get("/health", async () => {
    await db.query("select 1");
    return { status: "ok", time: new Date().toISOString() };
  });

  app.get("/api", async () => ({
    name: "ZEROLAX API",
    version: "1.0.0",
    timezone: TIMEZONE,
    languages: LANGUAGES,
    botUsername: config.botUsername,
    devAuthEnabled: config.devAuthEnabled,
  }));

  // JSON serialization is the final boundary, including nested audit metadata.
  app.addHook('preSerialization', async (request, _reply, payload) => {
    if (request.admin) return await canAdmin(db, request.admin, 'users.private') ? payload : withoutTelegramIdentity(payload);
    return request.profile ? withoutTelegramIdentity(payload) : payload;
  });
  const userGuard = createUserGuard(config, db);
  const adminGuard = createAdminGuard(config, db);
  app.addHook("preHandler", async (request) => {
    if (
      request.url.startsWith("/api/") &&
      !request.url.startsWith("/api/admin") &&
      !request.url.startsWith("/api/content") &&
      !request.url.startsWith("/api/learning/admin") &&
      !request.url.startsWith('/api/games/admin') &&
      !request.url.startsWith("/api/learning/certificates") &&
      !request.url.startsWith("/api/learning/webhooks/")
    ) {
      const settings = await getPlatformSettings(db);
      if (settings.maintenance)
        throw new ApiError(503, "MAINTENANCE", "Platform is under maintenance");
      if (
        !settings.registrationEnabled &&
        (request.url.startsWith("/api/auth/dev") ||
          request.url.includes("/register"))
      ) {
        const telegramId=(request.body as {telegramId?:unknown}|undefined)?.telegramId;
        const existing=request.url.startsWith('/api/auth/dev')&&typeof telegramId==='string'?await db.query('select id from profiles where telegram_id::text=$1',[telegramId]):[];
        if(!existing.length)throw new ApiError(
          403,
          "REGISTRATION_DISABLED",
          "Registration is disabled",
        );
      }
    }
  });

  await app.register(authRoutes, { prefix: "/api/auth", config, db });
  await app.register(userRoutes, {
    prefix: "/api/user",
    config,
    db,
    userGuard,
  });
  await app.register(iqRoutes, { prefix: "/api/iq", config, db, userGuard });
  await app.register(entranceRoutes, {
    prefix: "/api/entrance",
    config,
    db,
    userGuard,
  });
  await app.register(adminRoutes, {
    prefix: "/api/admin",
    config,
    db,
    adminGuard,
  });
  await app.register(internalBotRoutes, {
    prefix: "/api/internal/bot",
    config,
    db,
  });
  await app.register(learningRoutes, {
    prefix: "/api/learning",
    db,
    webUrl: config.webUrl,
    userGuard,
    adminGuard,
    paymentPlan: options.paymentPlan,
  });
  await app.register(adminControlRoutes, {
    prefix: "/api/admin/control",
    db,
    adminGuard,
  });
  await app.register(publicContentRoutes, { prefix: "/api/content", db });
  await app.register(gamesRoutes,{prefix:'/api/games',db,userGuard,adminGuard});
  await app.register(edtechRoutes, {prefix:'/api/edtech',db,userGuard});
  await app.register(adminEdtechRoutes, {prefix:'/api/admin/edtech',db,adminGuard});

  return app;
}
