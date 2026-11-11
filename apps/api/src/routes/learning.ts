import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import type { Db } from "@zerolax/db";
import { z } from "zod";
import {
  type LearningBook,
  learningSettingsSchema,
  learningBookSchema,
  learningTopicSchema,
  learningQuestionSchema,
} from "@zerolax/shared";
import { ApiError } from "../errors";
import {
  bookUnlocked,
  hasPremium,
  learningSettings,
  requireBook,
  requireTopic,
  startLearningExam,
  submitLearningExam,
  learningSession,
} from "../services/learning";
import { recordAudit } from "../services/admin";
import {studyRoutes} from './study';
import { canAdmin } from "../services/admin-control";
import {
  certificatePdf,
  PUBLIC_CERTIFICATE_COLUMNS,
} from "../services/learning-certificates";
import {
  applyVerifiedPayment,
  type PaymentPlan,
} from "../services/learning-payments";
interface Options {
  db: Db;
  webUrl: string;
  userGuard: (r: FastifyRequest, p: FastifyReply) => Promise<void>;
  adminGuard: (r: FastifyRequest, p: FastifyReply) => Promise<void>;
  paymentPlan?: PaymentPlan;
}
const uuid = z.string().uuid();
const idOf = (r: FastifyRequest) => uuid.parse((r.params as { id: string }).id);
const answersSchema = z.object({
  answers: z.record(uuid, z.number().int().min(0).max(3)),
});
const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

export const learningRoutes: FastifyPluginAsync<Options> = async (app, o) => {
  const { db } = o;
  app.get("/certificates/:id", async (r) => {
    const [c] = await db.query(
      `select ${PUBLIC_CERTIFICATE_COLUMNS} from learning_certificates where verification_id=$1`,
      [idOf(r)],
    );
    if (!c)
      throw new ApiError(404, "CERTIFICATE_NOT_FOUND", "Certificate not found");
    return c;
  });
  await app.register(
    async (user) => {
      user.addHook("preHandler", o.userGuard);
      await user.register(studyRoutes,{prefix:'/subjects',db,webUrl:o.webUrl});
      user.get('/certificates',async r=>{const p=pageSchema.parse(r.query);return db.query(`select ${PUBLIC_CERTIFICATE_COLUMNS} from learning_certificates where user_id=$1 order by completed_at desc limit $2 offset $3`,[r.profile!.id,p.limit,p.offset]);});
      user.get("/books", async (r) => {
        const books = await db.query<LearningBook>(
          "select b.*,s.title as subject_title from learning_books b join content_subjects s on s.slug=b.subject join content_grades g on g.grade=b.grade where b.published=true and s.enabled=true and s.visible=true and g.enabled=true order by s.position,b.grade,b.position",
        );
        return Promise.all(
          books.map(async (b) => ({
            ...b,
            unlocked: await bookUnlocked(db, r.profile!.id, b),
          })),
        );
      });
      user.get("/books/:id", async (r) => {
        const userId = r.profile!.id;
        const book = await requireBook(db, userId, idOf(r));
        const premium = await hasPremium(db, userId);
        const topics = await db.query(
          `select t.id,t.book_id,t.title,t.position,t.published,(p.topic_id is not null) as completed from learning_topics t left join learning_progress p on p.topic_id=t.id and p.user_id=$2 where t.book_id=$1 and t.published=true order by t.position`,
          [book.id, userId],
        );
        const settings = await learningSettings(db);
        const exams = await db.query(
          `select e.*,greatest(0,coalesce(e.max_attempts,$3)+(select count(*) from learning_attempt_grants g where g.exam_id=e.id and g.user_id=$2 and g.revoked_at is null)-(select count(*) from learning_attempts a where a.exam_id=e.id and a.user_id=$2))::integer as remaining from learning_exams e where e.book_id=$1 and e.published=true order by e.kind,e.block_number`,
          [book.id, userId, settings.maxAttempts],
        );
        return {
          book,
          premium,
          topics: topics.map((t) => ({
            ...t,
            accessible: Number(t.position) <= book.free_topic_limit || premium,
          })),
          exams,
        };
      });
      user.get("/topics/:id", (r) => requireTopic(db, r.profile!.id, idOf(r)));
      user.put("/student", async (r) => {
        const s = z
          .object({
            fullName: z.string().trim().min(3).max(200),
            grade: z.number().int().min(5).max(11),
          })
          .parse(r.body);
        await db.query(
          "insert into learning_student_details(user_id,full_name,grade) values($1,$2,$3) on conflict(user_id) do update set full_name=excluded.full_name,grade=excluded.grade",
          [r.profile!.id, s.fullName, s.grade],
        );
        return { ok: true };
      });
      user.get("/me", async (r) => {
        const p = pageSchema.parse(r.query);
        return {
          premium: await hasPremium(db, r.profile!.id),
          student:
            (
              await db.query(
                "select full_name,grade from learning_student_details where user_id=$1",
                [r.profile!.id],
              )
            )[0] ?? null,
          subscriptions: await db.query(
            "select id,source,starts_at,expires_at,revoked_at from learning_subscriptions where user_id=$1 order by expires_at desc limit $2 offset $3",
            [r.profile!.id, p.limit, p.offset],
          ),
          attempts: await db.query(
            "select id,exam_id,attempt_number,status,score,result,started_at,finished_at from learning_attempts where user_id=$1 order by started_at desc limit $2 offset $3",
            [r.profile!.id, p.limit, p.offset],
          ),
          certificates: await db.query(
            `select ${PUBLIC_CERTIFICATE_COLUMNS} from learning_certificates where user_id=$1 order by completed_at desc limit $2 offset $3`,
            [r.profile!.id, p.limit, p.offset],
          ),
        };
      });
      user.post("/exams/:id/start", (r) =>
        startLearningExam(db, r.profile!.id, idOf(r)),
      );
      user.get("/attempts/:id", async (r) => {
        const s = await learningSession(db, r.profile!.id, idOf(r));
        return s.status === "in_progress" &&
          new Date(s.expires_at).getTime() <= Date.now()
          ? submitLearningExam(db, r.profile!.id, s.id, {}, false, o.webUrl)
          : s;
      });
      user.put("/attempts/:id/answers", (r) =>
        submitLearningExam(
          db,
          r.profile!.id,
          idOf(r),
          answersSchema.parse(r.body).answers,
          true,
          o.webUrl,
        ),
      );
      user.post("/attempts/:id/submit", (r) =>
        submitLearningExam(
          db,
          r.profile!.id,
          idOf(r),
          answersSchema.parse(r.body).answers,
          false,
          o.webUrl,
        ),
      );
      user.get("/certificates/:id/pdf", async (r, p) =>
        p
          .type("application/pdf")
          .header("cache-control", "no-store")
          .send(await certificatePdf(db, r.profile!.id, idOf(r), o.webUrl)),
      );
      user.post("/checkout", async (r) => {
        const plan = o.paymentPlan;
        if (!plan)
          throw new ApiError(
            503,
            "PAYMENT_NOT_CONFIGURED",
            "Payment provider, price and duration are not configured",
          );
        const [payment] = await db.query<{ id: string }>(
          `insert into learning_payments(user_id,provider,amount_minor,currency,duration_seconds) values($1,$2,$3,$4,$5) returning id`,
          [
            r.profile!.id,
            plan.provider.name,
            plan.amountMinor,
            plan.currency,
            plan.durationSeconds,
          ],
        );
        const checkout = await plan.provider.createCheckout({
          paymentId: payment.id,
          amountMinor: plan.amountMinor,
          currency: plan.currency,
        });
        if (!checkout.url.startsWith("https://"))
          throw new ApiError(
            502,
            "PAYMENT_URL_INVALID",
            "Invalid checkout URL",
          );
        await db.query(
          "update learning_payments set provider_transaction_id=$2 where id=$1",
          [payment.id, checkout.transactionId],
        );
        return { url: checkout.url };
      });
    },
    { prefix: "/user" },
  );
  // A scoped buffer parser preserves the exact signed webhook bytes.
  await app.register(
    async (webhook) => {
      webhook.removeContentTypeParser("application/json");
      webhook.addContentTypeParser(
        "application/json",
        { parseAs: "buffer" },
        (_r, body, done) => done(null, body),
      );
      webhook.post("/payment", async (r) => {
        if (!o.paymentPlan)
          throw new ApiError(
            503,
            "PAYMENT_NOT_CONFIGURED",
            "Payment provider is not configured",
          );
        const event = await o.paymentPlan.provider.verifyWebhook(
          r.body as Buffer,
          r.headers,
        );
        await applyVerifiedPayment(db, o.paymentPlan.provider.name, event);
        return { ok: true };
      });
    },
    { prefix: "/webhooks" },
  );
  await app.register(
    async (admin) => {
      admin.addHook("preHandler", o.adminGuard);
      async function permission(r: FastifyRequest, p: string) {
        if (r.admin!.role === "superadmin") return;
        const mapped: Record<string, string> = {
          content: "content",
          settings: "exams",
          attempts: "exams",
          premium: "premium",
          payments: "payments",
          certificates: "certificates",
          students: "users",
        };
        const scope =
          p === "content" && r.url.includes("/exams/") ? "exams" : mapped[p];
        if (
          await canAdmin(
            db,
            r.admin!,
            `${scope}.${r.method === "GET" ? "read" : "write"}`,
          )
        )
          return;
        if (
          !(
            await db.query(
              "select permission from learning_admin_permissions where admin_id=$1 and permission=$2",
              [r.admin!.id, p],
            )
          ).length
        )
          throw new ApiError(403, "ADMIN_FORBIDDEN", "Permission required");
      }
      async function audit(
        r: FastifyRequest,
        action: string,
        entityId: string | undefined,
        work: (tx: import("@zerolax/db").Queryable) => Promise<unknown>,
        details: unknown = r.body,
      ) {
        return db.transaction(async (tx) => {
          const result = await work(tx);
          await recordAudit(tx, {
            adminId: r.admin!.id,
            action,
            entityType: "learning",
            entityId,
            details,
          });
          return result;
        });
      }
      admin.get("/settings", async (r) => {
        await permission(r, "settings");
        return learningSettings(db);
      });
      admin.put("/settings", async (r) => {
        await permission(r, "settings");
        const value = learningSettingsSchema.parse(r.body);
        return audit(r, "learning.settings", undefined, async (tx) => {
          const before = await learningSettings(tx);
          await tx.query("update learning_settings set value=$1", [
            JSON.stringify(value),
          ]);
          return { before, value };
        });
      });
      admin.get("/books", async (r) => {
        await permission(r, "content");
        return db.query(
          "select * from learning_books order by subject,grade,position",
        );
      });
      admin.post("/books", async (r) => {
        await permission(r, "content");
        const b = learningBookSchema.parse(r.body);
        return audit(
          r,
          "learning.book.create",
          undefined,
          async (tx) =>
            (
              await tx.query(
                "insert into learning_books(title,subject,grade,position,free_topic_limit,published) values($1,$2,$3,$4,$5,$6) returning *",
                [
                  b.title,
                  b.subject,
                  b.grade,
                  b.position,
                  b.freeTopicLimit,
                  b.published,
                ],
              )
            )[0],
        );
      });
      admin.put("/books/:id", async (r) => {
        await permission(r, "content");
        const b = learningBookSchema.parse(r.body);
        return audit(
          r,
          "learning.book.update",
          idOf(r),
          async (tx) =>
            (
              await tx.query(
                "update learning_books set title=$2,subject=$3,grade=$4,position=$5,free_topic_limit=$6,published=$7 where id=$1 returning *",
                [
                  idOf(r),
                  b.title,
                  b.subject,
                  b.grade,
                  b.position,
                  b.freeTopicLimit,
                  b.published,
                ],
              )
            )[0],
        );
      });
      admin.get("/books/:id", async (r) => {
        await permission(r, "content");
        return {
          topics: await db.query(
            "select * from learning_topics where book_id=$1 order by position",
            [idOf(r)],
          ),
          exams: await db.query(
            "select * from learning_exams where book_id=$1",
            [idOf(r)],
          ),
        };
      });
      admin.post("/books/:id/topics", async (r) => {
        await permission(r, "content");
        const t = learningTopicSchema.parse(r.body);
        return audit(r, "learning.topic.create", idOf(r), async (tx) => {
          const [topic] = await tx.query<{ id: string }>(
            "insert into learning_topics(book_id,title,content,position,published) values($1,$2,$3,$4,$5) returning *",
            [idOf(r), t.title, t.content, t.position, t.published],
          );
          await tx.query(
            `insert into learning_exams(book_id,topic_id,kind,published) values($1,$2,'topic',$3)`,
            [idOf(r), topic.id, t.published],
          );
          if (t.position % 10 === 0)
            await tx.query(
              `insert into learning_exams(book_id,kind,block_number) values($1,'intermediate',$2) on conflict do nothing`,
              [idOf(r), t.position / 10],
            );
          await tx.query(
            `insert into learning_exams(book_id,kind) values($1,'final') on conflict do nothing`,
            [idOf(r)],
          );
          return topic;
        });
      });
      admin.put("/topics/:id", async (r) => {
        await permission(r, "content");
        const t = learningTopicSchema.parse(r.body);
        return audit(
          r,
          "learning.topic.update",
          idOf(r),
          async (tx) =>
            (
              await tx.query(
                "update learning_topics set title=$2,content=$3,position=$4,published=$5 where id=$1 returning *",
                [idOf(r), t.title, t.content, t.position, t.published],
              )
            )[0],
        );
      });
      admin.get("/topics/:id/questions", async (r) => {
        await permission(r, "content");
        const p = pageSchema.parse(r.query);
        return db.query(
          "select * from learning_questions where topic_id=$1 order by id limit $2 offset $3",
          [idOf(r), p.limit, p.offset],
        );
      });
      admin.post("/topics/:id/questions", async (r) => {
        await permission(r, "content");
        const q = learningQuestionSchema.parse(r.body);
        return audit(
          r,
          "learning.question.create",
          idOf(r),
          async (tx) =>
            (
              await tx.query(
                "insert into learning_questions(topic_id,text,options,correct_index,explanation,published) values($1,$2,$3,$4,$5,$6) returning *",
                [
                  idOf(r),
                  q.text,
                  JSON.stringify(q.options),
                  q.correctIndex,
                  q.explanation,
                  q.published,
                ],
              )
            )[0],
        );
      });
      admin.put("/questions/:id", async (r) => {
        await permission(r, "content");
        const q = learningQuestionSchema.parse(r.body);
        return audit(
          r,
          "learning.question.update",
          idOf(r),
          async (tx) =>
            (
              await tx.query(
                "update learning_questions set text=$2,options=$3,correct_index=$4,explanation=$5,published=$6 where id=$1 returning *",
                [
                  idOf(r),
                  q.text,
                  JSON.stringify(q.options),
                  q.correctIndex,
                  q.explanation,
                  q.published,
                ],
              )
            )[0],
        );
      });
      admin.put("/exams/:id", async (r) => {
        await permission(r, "content");
        const e = z
          .object({
            published: z.boolean(),
            durationSeconds: z.number().int().min(60).max(14400),
          })
          .parse(r.body);
        return audit(
          r,
          "learning.exam.update",
          idOf(r),
          async (tx) =>
            (
              await tx.query(
                "update learning_exams set published=$2,duration_seconds=$3 where id=$1 returning *",
                [idOf(r), e.published, e.durationSeconds],
              )
            )[0],
        );
      });
      admin.get("/alerts", async (r) => {
        await permission(r, "content");
        return db.query(
          "select * from learning_alerts order by updated_at desc limit 100",
        );
      });
      admin.get("/users/:id", async (r) => {
        await permission(r, "students");
        const p = pageSchema.parse(r.query);
        return {
          attempts: await db.query(
            "select * from learning_attempts where user_id=$1 order by started_at desc limit $2 offset $3",
            [idOf(r), p.limit, p.offset],
          ),
          progress: await db.query(
            "select * from learning_progress where user_id=$1 limit $2 offset $3",
            [idOf(r), p.limit, p.offset],
          ),
          certificates: await db.query(
            `select ${PUBLIC_CERTIFICATE_COLUMNS} from learning_certificates where user_id=$1 limit $2 offset $3`,
            [idOf(r), p.limit, p.offset],
          ),
          grants: await db.query(
            "select * from learning_attempt_grants where user_id=$1 order by created_at desc limit $2 offset $3",
            [idOf(r), p.limit, p.offset],
          ),
        };
      });
      admin.post("/users/:id/grants", async (r) => {
        await permission(r, "attempts");
        const g = z
          .object({ examId: uuid, reason: z.string().trim().min(3).max(1000) })
          .parse(r.body);
        return audit(r, "learning.attempt.grant", idOf(r), async (tx) => {
          await tx.query("select id from profiles where id=$1 for update", [
            idOf(r),
          ]);
          return (
            await tx.query(
              "insert into learning_attempt_grants(user_id,exam_id,admin_id,reason) values($1,$2,$3,$4) returning *",
              [idOf(r), g.examId, r.admin!.id, g.reason],
            )
          )[0];
        });
      });
      admin.post("/grants/:id/revoke", async (r) => {
        await permission(r, "attempts");
        return audit(r, "learning.attempt.revoke", idOf(r), async (tx) => {
          await tx.query(
            "update learning_attempt_grants set revoked_at=now() where id=$1",
            [idOf(r)],
          );
          return { ok: true };
        });
      });
      admin.get("/subscriptions", async (r) => {
        await permission(r, "premium");
        const p = pageSchema.extend({ userId: uuid.optional() }).parse(r.query);
        return db.query(
          "select * from learning_subscriptions where ($3::uuid is null or user_id=$3) order by expires_at desc limit $1 offset $2",
          [p.limit, p.offset, p.userId ?? null],
        );
      });
      admin.post("/users/:id/premium", async (r) => {
        await permission(r, "premium");
        const s = z
          .object({
            startsAt: z.iso.datetime(),
            expiresAt: z.iso.datetime(),
            reason: z.string().trim().min(3).max(1000),
          })
          .refine((s) => s.expiresAt > s.startsAt)
          .parse(r.body);
        return audit(
          r,
          "learning.premium.grant",
          idOf(r),
          async (tx) =>
            (
              await tx.query(
                `insert into learning_subscriptions(user_id,source,starts_at,expires_at,admin_id,reason) values($1,'admin',$2,$3,$4,$5) returning *`,
                [idOf(r), s.startsAt, s.expiresAt, r.admin!.id, s.reason],
              )
            )[0],
        );
      });
      admin.put("/subscriptions/:id", async (r) => {
        await permission(r, "premium");
        const s = z
          .object({
            expiresAt: z.iso.datetime(),
            reason: z.string().trim().min(3).max(1000),
          })
          .parse(r.body);
        return audit(
          r,
          "learning.premium.extend",
          idOf(r),
          async (tx) =>
            (
              await tx.query(
                `update learning_subscriptions set expires_at=$2,reason=$3,admin_id=$4 where id=$1 and source='admin' returning *`,
                [idOf(r), s.expiresAt, s.reason, r.admin!.id],
              )
            )[0],
        );
      });
      admin.post("/subscriptions/:id/revoke", async (r) => {
        await permission(r, "premium");
        return audit(r, "learning.premium.revoke", idOf(r), async (tx) => {
          await tx.query(
            "update learning_subscriptions set revoked_at=now() where id=$1",
            [idOf(r)],
          );
          return { ok: true };
        });
      });
      admin.get("/payments", async (r) => {
        await permission(r, "payments");
        const p = pageSchema.parse(r.query);
        return {
          configured: !!o.paymentPlan,
          plan: o.paymentPlan
            ? {
                provider: o.paymentPlan.provider.name,
                amountMinor: o.paymentPlan.amountMinor,
                currency: o.paymentPlan.currency,
                durationSeconds: o.paymentPlan.durationSeconds,
              }
            : null,
          transactions: await db.query(
            "select * from learning_payments order by created_at desc limit $1 offset $2",
            [p.limit, p.offset],
          ),
        };
      });
      admin.get("/certificates", async (r) => {
        await permission(r, "certificates");
        const p = pageSchema.parse(r.query);
        return db.query(
          `select ${PUBLIC_CERTIFICATE_COLUMNS},user_id from learning_certificates order by completed_at desc limit $1 offset $2`,
          [p.limit, p.offset],
        );
      });
      admin.get("/certificates/:id/pdf", async (r, p) => {
        await permission(r, "certificates");
        return p
          .type("application/pdf")
          .header("cache-control", "no-store")
          .send(await certificatePdf(db, undefined, idOf(r), o.webUrl, true));
      });
      admin.post("/certificates/:id/revoke", async (r) => {
        await permission(r, "certificates");
        const body = z
          .object({ reason: z.string().trim().min(3).max(1000) })
          .parse(r.body);
        return audit(
          r,
          "learning.certificate.revoke",
          idOf(r),
          async (tx) => {
            await tx.query(
              "update learning_certificates set revoked_at=now() where verification_id=$1",
              [idOf(r)],
            );
            return { ok: true };
          },
          body,
        );
      });
      admin.put("/permissions/:id", async (r) => {
        if (r.admin!.role !== "superadmin")
          throw new ApiError(403, "ADMIN_FORBIDDEN", "Superadmin required");
        const permissions = z
          .array(
            z.enum([
              "content",
              "settings",
              "attempts",
              "premium",
              "payments",
              "certificates",
              "students",
            ]),
          )
          .parse(r.body);
        return audit(r, "learning.permissions", idOf(r), async (tx) => {
          await tx.query(
            "delete from learning_admin_permissions where admin_id=$1",
            [idOf(r)],
          );
          for (const p of new Set(permissions))
            await tx.query(
              "insert into learning_admin_permissions(admin_id,permission) values($1,$2)",
              [idOf(r), p],
            );
          return { ok: true };
        });
      });
    },
    { prefix: "/admin" },
  );
};
