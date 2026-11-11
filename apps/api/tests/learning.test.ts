import { afterEach, describe, expect, it } from "vitest";
import {
  defaultLearningSettings,
  evaluateLearningScore,
  learningSettingsSchema,
} from "@zerolax/shared";
import {
  authHeader,
  createTestContext,
  createTestUser,
  loginAs,
  type TestContext,
} from "./helpers";
import {
  hasPremium,
  startLearningExam,
  submitLearningExam,
} from "../src/services/learning";
import {
  applyVerifiedPayment,
  type VerifiedPaymentEvent,
} from "../src/services/learning-payments";
let ctx: TestContext;
afterEach(async () => {
  if (ctx) await ctx.close();
});
async function fixture(topics = 1, questions = 10) {
  ctx = await createTestContext();
  const user = await createTestUser(ctx.db);
  const login = await loginAs(ctx.app, user.telegramId);
  const adminLogin = await ctx.app.inject({
    method: "POST",
    url: "/api/admin/auth/login",
    payload: { email: "admin@zerolax.test", password: "test-admin-password" },
  });
  const adminHeaders = authHeader(adminLogin.json().accessToken);
  const [admin] = await ctx.db.query<{ id: string }>(
    "select id from admin_users limit 1",
  );
  const [book] = await ctx.db.query<{ id: string }>(
    "insert into learning_books(title,subject,grade,position,published) values('Book 1','algebra',5,1,true) returning id",
  );
  const [next] = await ctx.db.query<{ id: string }>(
    "insert into learning_books(title,subject,grade,position,published) values('Book 2','algebra',5,2,true) returning id",
  );
  const topicIds: string[] = [];
  const examIds: string[] = [];
  for (let i = 0; i < topics; i++) {
    const [topic] = await ctx.db.query<{ id: string }>(
      "insert into learning_topics(book_id,title,position,published) values($1,$2,$3,true) returning id",
      [book.id, `Topic ${i + 1}`, i + 1],
    );
    topicIds.push(topic.id);
    const [exam] = await ctx.db.query<{ id: string }>(
      "insert into learning_exams(book_id,topic_id,kind,published) values($1,$2,'topic',true) returning id",
      [book.id, topic.id],
    );
    examIds.push(exam.id);
    await ctx.db.query(
      `insert into learning_questions(topic_id,text,options,correct_index) select $1,'Question '||n,'["A","B","C","D"]'::jsonb,0 from generate_series(1,$2::integer) n`,
      [topic.id, questions],
    );
  }
  const headers = authHeader(login.accessToken);
  return {
    user,
    admin,
    adminHeaders,
    headers,
    book: book.id,
    next: next.id,
    topicIds,
    examIds,
  };
}
const answersFor = (s: { questions: Array<{ id: string }> }, correct: number) =>
  Object.fromEntries(s.questions.map((q, i) => [q.id, i < correct ? 0 : 1]));
describe("Learning score policy", () => {
  it.each([
    [0, "repeat", false, false],
    [39, "repeat", false, false],
    [40, "pending", false, false],
    [49, "pending", false, false],
    [50, "review", false, false],
    [70, "review", false, false],
    [71, "passed", true, false],
    [79, "passed", true, false],
    [80, "passed", true, true],
    [100, "passed", true, true],
  ])(
    "score %s uses the correct policy",
    (score, policy, unlocked, certificate) => {
      expect(
        evaluateLearningScore(score as number, defaultLearningSettings),
      ).toEqual({ policy, unlocked, certificate });
    },
  );
  it("rejects overlapping thresholds and invalid scores", () => {
    expect(
      learningSettingsSchema.safeParse({
        ...defaultLearningSettings,
        unlockFrom: 39,
      }).success,
    ).toBe(false);
    expect(() => evaluateLearningScore(101, defaultLearningSettings)).toThrow();
  });
});
describe("Learning attempts and access", () => {
  it("admin content and settings editors affect the real student API", async () => {
    const f = await fixture();
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/learning/admin/books",
      headers: f.adminHeaders,
      payload: {
        title: "Geometry Book",
        subject: "geometry",
        grade: 6,
        position: 1,
        freeTopicLimit: 3,
        published: true,
      },
    });
    expect(created.statusCode).toBe(200);
    const topic = await ctx.app.inject({
      method: "POST",
      url: `/api/learning/admin/books/${created.json().id}/topics`,
      headers: f.adminHeaders,
      payload: {
        title: "Triangles",
        position: 1,
        content: "Lesson text",
        published: true,
      },
    });
    expect(topic.statusCode).toBe(200);
    const topicId = topic.json().id;
    const added = await ctx.app.inject({
      method: "POST",
      url: `/api/learning/admin/topics/${topicId}/questions`,
      headers: f.adminHeaders,
      payload: {
        text: "Question",
        options: ["A", "B", "C", "D"],
        correctIndex: 2,
        published: true,
      },
    });
    expect(added.statusCode).toBe(200);
    const updated = await ctx.app.inject({
      method: "PUT",
      url: "/api/learning/admin/settings",
      headers: f.adminHeaders,
      payload: { ...defaultLearningSettings, topicQuestionCount: 1 },
    });
    expect(updated.statusCode).toBe(200);
    const [exam] = await ctx.db.query<{ id: string }>(
      "select id from learning_exams where topic_id=$1",
      [topicId],
    );
    const started = await ctx.app.inject({
      method: "POST",
      url: `/api/learning/user/exams/${exam.id}/start`,
      headers: f.headers,
      payload: {},
    });
    expect(started.statusCode).toBe(200);
    expect(started.json().questions).toHaveLength(1);
    const completed = await ctx.app.inject({
      method: "POST",
      url: `/api/learning/user/attempts/${started.json().id}/submit`,
      headers: f.headers,
      payload: { answers: { [added.json().id]: 2 } },
    });
    expect(completed.json().score).toBe(100);
    expect(completed.json().result.certificate).toBe(false);
  });
  it("selects exactly ten unique questions, hides correct answers, resumes and snapshots the question bank", async () => {
    const f = await fixture(1, 15);
    const s = await startLearningExam(ctx.db, f.user.id, f.examIds[0]);
    expect(s.questions).toHaveLength(10);
    expect(new Set(s.questions.map((q) => q.id)).size).toBe(10);
    expect(s.questions[0]).not.toHaveProperty("correctIndex");
    expect((await startLearningExam(ctx.db, f.user.id, f.examIds[0])).id).toBe(
      s.id,
    );
    await ctx.db.query("update learning_questions set correct_index=1");
    const result = await submitLearningExam(
      ctx.db,
      f.user.id,
      s.id,
      answersFor(s, 10),
    );
    expect(result.score).toBe(100);
    expect(await ctx.db.query("select * from learning_progress")).toHaveLength(
      1,
    );
    await expect(
      startLearningExam(ctx.db, f.user.id, f.examIds[0]),
    ).rejects.toMatchObject({ code: "ALREADY_PASSED" });
  });
  it("allows one retake, blocks a third in API and database, permits an audited admin exception", async () => {
    const f = await fixture();
    for (let i = 0; i < 2; i++) {
      const s = await startLearningExam(ctx.db, f.user.id, f.examIds[0]);
      await submitLearningExam(ctx.db, f.user.id, s.id, answersFor(s, 0));
    }
    const denied = await ctx.app.inject({
      method: "POST",
      url: `/api/learning/user/exams/${f.examIds[0]}/start`,
      headers: f.headers,
      payload: {},
    });
    expect(denied.statusCode).toBe(409);
    await expect(
      ctx.db.query(
        `insert into learning_attempts(user_id,exam_id,attempt_number,expires_at,settings) values($1,$2,3,now()+interval '1 hour',$3)`,
        [f.user.id, f.examIds[0], JSON.stringify(defaultLearningSettings)],
      ),
    ).rejects.toThrow("Learning attempt limit exceeded");
    const grant = await ctx.app.inject({
      method: "POST",
      url: `/api/learning/admin/users/${f.user.id}/grants`,
      headers: f.adminHeaders,
      payload: { examId: f.examIds[0], reason: "Approved exception" },
    });
    expect(grant.statusCode).toBe(200);
    const third = await startLearningExam(ctx.db, f.user.id, f.examIds[0]);
    expect(third.status).toBe("in_progress");
    expect(
      await ctx.db.query(
        "select id from admin_audit_logs where action='learning.attempt.grant'",
      ),
    ).toHaveLength(1);
  });
  it("serializes concurrent starts and duplicate submissions without duplicating progress", async () => {
    const f = await fixture();
    const sessions = await Promise.all([
      startLearningExam(ctx.db, f.user.id, f.examIds[0]),
      startLearningExam(ctx.db, f.user.id, f.examIds[0]),
    ]);
    expect(sessions[0].id).toBe(sessions[1].id);
    const s = sessions[0];
    const results = await Promise.all([
      submitLearningExam(ctx.db, f.user.id, s.id, answersFor(s, 10)),
      submitLearningExam(ctx.db, f.user.id, s.id, {}),
    ]);
    expect(results.map((r) => r.score)).toEqual([100, 100]);
    expect(await ctx.db.query("select * from learning_progress")).toHaveLength(
      1,
    );
  });
  it("refuses incomplete tests and persists an admin alert", async () => {
    const f = await fixture(1, 9);
    await expect(
      startLearningExam(ctx.db, f.user.id, f.examIds[0]),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_QUESTIONS" });
    expect(await ctx.db.query("select * from learning_alerts")).toHaveLength(1);
    expect(await ctx.db.query("select * from learning_attempts")).toHaveLength(
      0,
    );
  });
  it("enforces the timer and scores only previously saved answers after expiry", async () => {
    const f = await fixture();
    const s = await startLearningExam(ctx.db, f.user.id, f.examIds[0]);
    await submitLearningExam(ctx.db, f.user.id, s.id, answersFor(s, 3), true);
    await ctx.db.query(
      "update learning_attempts set expires_at=now()-interval '1 second' where id=$1",
      [s.id],
    );
    const result = await submitLearningExam(
      ctx.db,
      f.user.id,
      s.id,
      answersFor(s, 10),
    );
    expect(result.status).toBe("expired");
    expect(result.score).toBe(30);
  });
  it("protects attempts from other users and ignores forged score and user ID", async () => {
    const f = await fixture();
    const s = await startLearningExam(ctx.db, f.user.id, f.examIds[0]);
    const other = await createTestUser(ctx.db);
    const login = await loginAs(ctx.app, other.telegramId);
    expect(
      (
        await ctx.app.inject({
          url: `/api/learning/user/attempts/${s.id}`,
          headers: authHeader(login.accessToken),
        })
      ).statusCode,
    ).toBe(404);
    const r = await ctx.app.inject({
      method: "POST",
      url: `/api/learning/user/attempts/${s.id}/submit`,
      headers: f.headers,
      payload: {
        answers: answersFor(s, 0),
        score: 100,
        userId: other.id,
        premium: true,
      },
    });
    expect(r.json().score).toBe(0);
  });
  it("free users can open topics 1–3; admin Premium opens topic 4; expiry preserves progress", async () => {
    const f = await fixture(4);
    expect(
      (
        await ctx.app.inject({
          url: `/api/learning/user/topics/${f.topicIds[2]}`,
          headers: f.headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await ctx.app.inject({
          url: `/api/learning/user/topics/${f.topicIds[3]}`,
          headers: f.headers,
        })
      ).statusCode,
    ).toBe(403);
    const granted = await ctx.app.inject({
      method: "POST",
      url: `/api/learning/admin/users/${f.user.id}/premium`,
      headers: f.adminHeaders,
      payload: {
        startsAt: new Date(Date.now() - 10000).toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        reason: "Manual grant",
      },
    });
    expect(granted.statusCode).toBe(200);
    expect(
      (
        await ctx.app.inject({
          url: `/api/learning/user/topics/${f.topicIds[3]}`,
          headers: f.headers,
        })
      ).statusCode,
    ).toBe(200);
    const s = await startLearningExam(ctx.db, f.user.id, f.examIds[3]);
    await submitLearningExam(ctx.db, f.user.id, s.id, answersFor(s, 10));
    await ctx.db.query(
      "update learning_subscriptions set starts_at=now()-interval '2 days',expires_at=now()-interval '1 day'",
    );
    expect(await hasPremium(ctx.db, f.user.id)).toBe(false);
    expect(
      (
        await ctx.app.inject({
          url: `/api/learning/user/topics/${f.topicIds[3]}`,
          headers: f.headers,
        })
      ).statusCode,
    ).toBe(403);
    expect(await ctx.db.query("select * from learning_progress")).toHaveLength(
      1,
    );
  });
  it("requires learning permissions even for an authenticated regular admin", async () => {
    const f = await fixture();
    await ctx.db.query("update admin_users set role='admin' where id=$1", [
      f.admin.id,
    ]);
    expect(
      (
        await ctx.app.inject({
          url: "/api/learning/admin/settings",
          headers: f.adminHeaders,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await ctx.app.inject({
          method: "POST",
          url: `/api/learning/admin/users/${f.user.id}/grants`,
          headers: f.adminHeaders,
          payload: { examId: f.examIds[0], reason: "Denied" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await ctx.app.inject({
          url: "/api/learning/admin/settings",
          headers: f.headers,
        })
      ).statusCode,
    ).toBeGreaterThanOrEqual(401);
    await ctx.db.query(
      "insert into learning_admin_permissions(admin_id,permission) values($1,'content')",
      [f.admin.id],
    );
    expect(
      (
        await ctx.app.inject({
          url: "/api/learning/admin/books",
          headers: f.adminHeaders,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await ctx.app.inject({
          url: "/api/learning/admin/payments",
          headers: f.adminHeaders,
        })
      ).statusCode,
    ).toBe(403);
  });
});
describe("Intermediate, final and certificates", () => {
  it.each([75, 100])(
    "final score %s unlocks the next book with the correct certificate eligibility",
    async (score) => {
      const f = await fixture(1, 20);
      await ctx.db.query(
        "insert into learning_progress(user_id,topic_id) values($1,$2)",
        [f.user.id, f.topicIds[0]],
      );
      await ctx.db.query(
        "insert into learning_student_details(user_id,full_name,grade) values($1,'Student Example',5)",
        [f.user.id],
      );
      const [exam] = await ctx.db.query<{ id: string }>(
        "insert into learning_exams(book_id,kind,published) values($1,'final',true) returning id",
        [f.book],
      );
      const s = await startLearningExam(ctx.db, f.user.id, exam.id);
      const result = await submitLearningExam(
        ctx.db,
        f.user.id,
        s.id,
        answersFor(s, score / 5),
      );
      expect(result.score).toBe(score);
      expect(
        await ctx.db.query("select * from learning_book_unlocks"),
      ).toHaveLength(1);
      await submitLearningExam(
        ctx.db,
        f.user.id,
        s.id,
        answersFor(s, score / 5),
      );
      const certs = await ctx.db.query<{ pdf: Buffer }>(
        "select * from learning_certificates",
      );
      expect(certs).toHaveLength(score === 100 ? 1 : 0);
      if (score === 100)
        expect(Buffer.from(certs[0].pdf).subarray(0, 4).toString()).toBe(
          "%PDF",
        );
    },
  );
  it("uses twenty questions, checks progress, unlocks only on passing and issues one private PDF certificate at 80+", async () => {
    const f = await fixture(10, 10);
    await ctx.db.query(
      "update learning_books set free_topic_limit=10 where id=$1",
      [f.book],
    );
    const [intermediate] = await ctx.db.query<{ id: string }>(
      "insert into learning_exams(book_id,kind,block_number,published) values($1,'intermediate',1,true) returning id",
      [f.book],
    );
    const [final] = await ctx.db.query<{ id: string }>(
      "insert into learning_exams(book_id,kind,published) values($1,'final',true) returning id",
      [f.book],
    );
    await expect(
      startLearningExam(ctx.db, f.user.id, intermediate.id),
    ).rejects.toMatchObject({ code: "PROGRESS_REQUIRED" });
    await ctx.db.query(
      "insert into learning_progress(user_id,topic_id) select $1,id from learning_topics where book_id=$2",
      [f.user.id, f.book],
    );
    const mid = await startLearningExam(ctx.db, f.user.id, intermediate.id);
    expect(mid.questions).toHaveLength(20);
    await submitLearningExam(ctx.db, f.user.id, mid.id, answersFor(mid, 20));
    await ctx.app.inject({
      method: "PUT",
      url: "/api/learning/user/student",
      headers: f.headers,
      payload: { fullName: "Test Student", grade: 5 },
    });
    const s = await startLearningExam(ctx.db, f.user.id, final.id);
    expect(s.questions).toHaveLength(20);
    await submitLearningExam(ctx.db, f.user.id, s.id, answersFor(s, 14));
    expect(
      await ctx.db.query("select * from learning_book_unlocks"),
    ).toHaveLength(0);
    expect(
      await ctx.db.query("select * from learning_certificates"),
    ).toHaveLength(0);
    const retake = await startLearningExam(ctx.db, f.user.id, final.id);
    await submitLearningExam(
      ctx.db,
      f.user.id,
      retake.id,
      answersFor(retake, 16),
    );
    await submitLearningExam(
      ctx.db,
      f.user.id,
      retake.id,
      answersFor(retake, 20),
    );
    const certs = await ctx.db.query<{ verification_id: string }>(
      "select * from learning_certificates",
    );
    expect(certs).toHaveLength(1);
    expect(
      await ctx.db.query(
        "select * from learning_book_unlocks where book_id=$1",
        [f.next],
      ),
    ).toHaveLength(1);
    const verification = await ctx.app.inject({
      url: `/api/learning/certificates/${certs[0].verification_id}`,
    });
    expect(verification.statusCode).toBe(200);
    expect(verification.json()).not.toHaveProperty("user_id");
    expect(verification.json()).not.toHaveProperty("id");
    expect(verification.json()).not.toHaveProperty("phone");
    expect(verification.json().score).toBe("80.00");
    const pdf = await ctx.app.inject({
      url: `/api/learning/user/certificates/${certs[0].verification_id}/pdf`,
      headers: f.headers,
    });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe("%PDF");
    expect(
      (
        await ctx.db.query<{ pdf: Buffer }>(
          "select pdf from learning_certificates",
        )
      )[0].pdf.length,
    ).toBeGreaterThan(1000);
    const other = await createTestUser(ctx.db);
    const otherLogin = await loginAs(ctx.app, other.telegramId);
    expect(
      (
        await ctx.app.inject({
          url: `/api/learning/user/certificates/${certs[0].verification_id}/pdf`,
          headers: authHeader(otherLogin.accessToken),
        })
      ).statusCode,
    ).toBe(404);
    await ctx.app.inject({
      method: "POST",
      url: `/api/learning/admin/certificates/${certs[0].verification_id}/revoke`,
      headers: f.adminHeaders,
      payload: { reason: "Invalid student name" },
    });
    expect(
      (
        await ctx.app.inject({
          url: `/api/learning/certificates/${certs[0].verification_id}`,
        })
      ).json().revoked_at,
    ).toBeTruthy();
    expect(
      (
        await ctx.app.inject({
          url: `/api/learning/user/certificates/${certs[0].verification_id}/pdf`,
          headers: f.headers,
        })
      ).statusCode,
    ).toBe(410);
  });
});
describe("Verified payment boundary", () => {
  it("requires provider configuration; creates Premium only for verified matching payment; deduplicates and revokes on refund", async () => {
    const f = await fixture();
    expect(
      (
        await ctx.app.inject({
          method: "POST",
          url: "/api/learning/user/checkout",
          headers: f.headers,
          payload: { status: "succeeded", premium: true },
        })
      ).statusCode,
    ).toBe(503);
    expect(await hasPremium(ctx.db, f.user.id)).toBe(false);
    const [p] = await ctx.db.query<{ id: string }>(
      "insert into learning_payments(user_id,provider,amount_minor,currency,duration_seconds) values($1,'test-adapter',1000,'UZS',3600) returning id",
      [f.user.id],
    );
    const event: VerifiedPaymentEvent = {
      eventId: "event-1",
      paymentId: p.id,
      transactionId: "tx-1",
      amountMinor: 1000,
      currency: "UZS",
      status: "succeeded",
    };
    await expect(
      applyVerifiedPayment(ctx.db, "test-adapter", {
        ...event,
        amountMinor: 1,
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_MISMATCH" });
    expect(await hasPremium(ctx.db, f.user.id)).toBe(false);
    await applyVerifiedPayment(ctx.db, "test-adapter", event);
    await applyVerifiedPayment(ctx.db, "test-adapter", event);
    await applyVerifiedPayment(ctx.db, "test-adapter", {
      ...event,
      eventId: "event-2",
    });
    expect(await hasPremium(ctx.db, f.user.id)).toBe(true);
    expect(
      await ctx.db.query("select * from learning_subscriptions"),
    ).toHaveLength(1);
    await applyVerifiedPayment(ctx.db, "test-adapter", {
      ...event,
      eventId: "event-3",
      status: "refunded",
    });
    expect(await hasPremium(ctx.db, f.user.id)).toBe(false);
    await applyVerifiedPayment(ctx.db, "test-adapter", {
      ...event,
      eventId: "event-4",
    });
    expect(await hasPremium(ctx.db, f.user.id)).toBe(false);
  });
});
