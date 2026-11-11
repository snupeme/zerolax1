import { afterEach, describe, it, expect } from "vitest";
import {
  authHeader,
  createTestContext,
  createTestUser,
  loginAs,
  createIqTestFixture,
  type TestContext,
} from "./helpers";
import { signAdminAccessToken } from "../src/auth/tokens";
import { defaultPlatformSettings, tashkentDateString } from "@zerolax/shared";
import { csvOutput } from "../src/services/admin-control";
import {
  startLearningExam,
  submitLearningExam,
} from "../src/services/learning";
let ctx: TestContext;
afterEach(async () => {
  await ctx?.close();
});
async function setup() {
  ctx = await createTestContext();
  const login = await ctx.app.inject({
    method: "POST",
    url: "/api/admin/auth/login",
    payload: { email: "admin@zerolax.test", password: "test-admin-password" },
  });
  return authHeader(login.json().accessToken);
}
async function staff(role: string) {
  const [a] = await ctx.db.query<{ id: string; email: string; role: string }>(
    "insert into admin_users(email,name,password_hash,role) values($1,$2,'unusable',$2) returning id,email,role",
    [role + "@test.local", role],
  );
  return authHeader(await signAdminAccessToken(ctx.config, a));
}
describe("Admin control security and data", () => {
  it("enforces role isolation on both new and legacy APIs, including direct requests", async () => {
    const root = await setup();
    const content = await staff("content_manager");
    const finance = await staff("finance_manager");
    const analyst = await staff("analyst");
    await ctx.db.query(
      `update admin_roles set permissions='["analytics.read","reports.read"]' where key='analyst'`,
    );
    expect(
      (
        await ctx.app.inject({
          url: "/api/admin/control/catalog",
          headers: content,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await ctx.app.inject({
          url: "/api/admin/control/records/payments",
          headers: content,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await ctx.app.inject({
          method: "POST",
          url: "/api/admin/iq/tests",
          headers: finance,
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await ctx.app.inject({
          method: "POST",
          url: "/api/learning/admin/books",
          headers: finance,
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await ctx.app.inject({
          url: "/api/admin/control/roles",
          headers: finance,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await ctx.app.inject({ url: "/api/admin/control/roles" })).statusCode,
    ).toBe(401);
    expect(
      (await ctx.app.inject({ url: "/api/admin/control/roles", headers: root }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await ctx.app.inject({
          method: "PUT",
          url: "/api/admin/control/settings",
          headers: analyst,
          payload: defaultPlatformSettings,
        })
      ).statusCode,
    ).toBe(403);
  });
  it("keeps phone data private, filters users on the server and edits real profile fields", async () => {
    const root = await setup();
    const user = await createTestUser(ctx.db, { nickname: "filter_user" });
    await ctx.db.query(
      "update profiles set phone='+998901234567',city='Tashkent',district='Chilonzor',age=17 where id=$1",
      [user.id],
    );
    const support = await staff("support_manager");
    const privateResult = await ctx.app.inject({
      url: "/api/admin/control/users?search=998901234567",
      headers: root,
    });
    expect(privateResult.json().total).toBe(1);
    expect(privateResult.json().rows[0].phone).toBeTruthy();
    const publicResult = await ctx.app.inject({
      url: "/api/admin/control/users?city=Tashkent&district=Chilonzor&status=active",
      headers: support,
    });
    expect(publicResult.json().total).toBe(1);
    expect(publicResult.json().rows[0]).not.toHaveProperty("phone");
    expect(
      (
        await ctx.app.inject({
          url: `/api/admin/users/${user.id}`,
          headers: support,
        })
      ).json().phone,
    ).toBe(null);
    expect(
      (
        await ctx.app.inject({
          url: "/api/admin/control/users?city=Samarkand",
          headers: root,
        })
      ).json().total,
    ).toBe(0);
    expect(
      (
        await ctx.app.inject({
          method: "PATCH",
          url: `/api/admin/control/users/${user.id}`,
          headers: root,
          payload: {
            firstName: "Student",
            lastName: "Example",
            fullName: "Student Example",
            grade: 9,
            city: "Samarkand",
            district: "Center",
            age: 16,
          },
        })
      ).statusCode,
    ).toBe(200);
    const filtered = await ctx.app.inject({
      url: "/api/admin/control/users?grade=9&city=Samarkand",
      headers: root,
    });
    expect(filtered.json().total).toBe(1);
  });
  it("limits exports by permissions, excludes private data and escapes spreadsheet formulas", async () => {
    const root = await setup();
    const user = await createTestUser(ctx.db, { nickname: "export_user" });
    await ctx.db.query(
      "update profiles set phone='private-phone',first_name='=HYPERLINK(1)' where id=$1",
      [user.id],
    );
    // Exportable educational names still need CSV protection; Telegram names
    // must no longer be the fallback for staff without users.private.
    await ctx.db.query(
      "insert into learning_student_details(user_id,full_name,grade) values($1,'=HYPERLINK(1)',7)",
      [user.id],
    );
    const support = await staff("support_manager");
    expect(
      (
        await ctx.app.inject({
          url: "/api/admin/control/reports/users?format=csv",
          headers: support,
        })
      ).statusCode,
    ).toBe(403);
    await ctx.db.query(
      `update admin_roles set permissions='["reports.read","reports.export","users.read"]' where key='support_manager'`,
    );
    const csv = await ctx.app.inject({
      url: "/api/admin/control/reports/users?format=csv",
      headers: support,
    });
    expect(csv.statusCode).toBe(200);
    expect(csv.body).not.toContain("private-phone");
    expect(csv.body).toContain("'=HYPERLINK");
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csvOutput([{ value: "+SUM(1)" }])).toContain("'+SUM(1)");
    expect(
      (
        await ctx.app.inject({
          url: "/api/admin/control/reports/payments",
          headers: support,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      await ctx.db.query(
        "select id from admin_audit_logs where action='report.export'",
      ),
    ).toHaveLength(1);
  });
  it("publishes homepage banners only inside their schedule and rejects unsafe destinations", async () => {
    const root = await setup();
    const banner = {
      title: "Scheduled ad",
      description: "Live content",
      imageUrl: "",
      destination: "/learning",
      placement: "home",
      startsAt: new Date(Date.now() - 10000).toISOString(),
      endsAt: new Date(Date.now() + 3600000).toISOString(),
      priority: 1,
      enabled: true,
    };
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/admin/control/banners",
      headers: root,
      payload: banner,
    });
    expect(created.statusCode).toBe(200);
    expect(
      (
        await ctx.app.inject({ url: "/api/content/banners?placement=home" })
      ).json(),
    ).toHaveLength(1);
    await ctx.app.inject({
      method: "PUT",
      url: `/api/admin/control/banners/${created.json().id}`,
      headers: root,
      payload: {
        ...banner,
        startsAt: new Date(Date.now() + 20000).toISOString(),
      },
    });
    expect(
      (
        await ctx.app.inject({ url: "/api/content/banners?placement=home" })
      ).json(),
    ).toHaveLength(0);
    expect(
      (
        await ctx.app.inject({
          method: "POST",
          url: "/api/admin/control/banners",
          headers: root,
          payload: { ...banner, destination: "javascript:alert(1)" },
        })
      ).statusCode,
    ).toBe(400);
  });
  it("reports database analytics and keeps multi-currency verified revenue separate", async () => {
    const root = await setup();
    const user = await createTestUser(ctx.db);
    await ctx.db.query(
      "insert into learning_payments(user_id,provider,amount_minor,currency,duration_seconds,status,verified_at) values($1,'test',1000,'UZS',3600,'succeeded',now()),($1,'test',500,'USD',3600,'pending',null)",
      [user.id],
    );
    const response = await ctx.app.inject({
      url:
        "/api/admin/control/analytics?from=" +
        tashkentDateString() +
        "&to=" +
        tashkentDateString() +
        "&bucket=day",
      headers: root,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().counts.users).toBe(1);
    expect(response.json().revenue).toEqual([
      { currency: "UZS", amount_minor: "1000" },
    ]);
    const analyst = await staff("analyst");
    await ctx.db.query(
      `update admin_roles set permissions='["analytics.read","reports.read"]' where key='analyst'`,
    );
    const restricted = await ctx.app.inject({
      url: "/api/admin/control/analytics",
      headers: analyst,
    });
    expect(restricted.statusCode, restricted.body).toBe(200);
    expect(restricted.json().revenue).toBe(null);
    expect(
      (
        await ctx.app.inject({
          url: "/api/admin/control/exam-analytics",
          headers: root,
        })
      ).statusCode,
    ).toBe(200);
  });
  it("hides IQ diagnostics until the release time and supports entrance analytics", async () => {
    const root = await setup();
    const user = await createTestUser(ctx.db);
    const iq = await createIqTestFixture(ctx.db, {
      releaseAt: new Date(Date.now() + 3600000),
    });
    const [attempt] = await ctx.db.query<{ id: string }>(
      "insert into iq_attempts(user_id,test_id,status,submitted_at,correct_count,total_questions) values($1,$2,'submitted',now(),10,10) returning id",
      [user.id, iq.testId],
    );
    await ctx.db.query(
      "insert into iq_user_answers(attempt_id,question_id,selected_option_id) select $1,q.id,o.id from iq_questions q join iq_question_options o on o.question_id=q.id and o.position=q.correct_option_index where q.test_id=$2",
      [attempt.id, iq.testId],
    );
    const hidden = await ctx.app.inject({
      url: "/api/admin/control/exam-analytics?kind=iq",
      headers: root,
    });
    expect(hidden.statusCode, hidden.body).toBe(200);
    expect(hidden.json().summary.attempts).toBe(0);
    expect(hidden.json().questions).toHaveLength(0);
    await ctx.db.query(
      "update daily_iq_tests set release_at=now()-interval '1 second' where id=$1",
      [iq.testId],
    );
    const visible = await ctx.app.inject({
      url: "/api/admin/control/exam-analytics?kind=iq",
      headers: root,
    });
    expect(visible.statusCode, visible.body).toBe(200);
    expect(visible.json().summary.attempts).toBe(1);
    expect(visible.json().questions).toHaveLength(10);
    expect(visible.json().questions[0].missed).toBe(0);
    const entrance = await ctx.app.inject({
      url: "/api/admin/control/exam-analytics?kind=entrance",
      headers: root,
    });
    expect(entrance.statusCode, entrance.body).toBe(200);
  });
  it("audits role edits, prevents self-demotion and hides passwords", async () => {
    const root = await setup();
    const roles = await ctx.app.inject({
      url: "/api/admin/control/roles",
      headers: root,
    });
    expect(JSON.stringify(roles.json())).not.toContain("password_hash");
    const create = await ctx.app.inject({
      method: "PUT",
      url: "/api/admin/control/roles",
      headers: root,
      payload: {
        key: "custom_editor",
        name: "Custom Editor",
        permissions: ["content.read"],
      },
    });
    expect(create.statusCode).toBe(200);
    const [admin] = await ctx.db.query<{ id: string }>(
      "select id from admin_users limit 1",
    );
    expect(
      (
        await ctx.app.inject({
          method: "PATCH",
          url: `/api/admin/control/admins/${admin.id}`,
          headers: root,
          payload: { role: "analyst", status: "active" },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await ctx.app.inject({
          method: "PUT",
          url: "/api/admin/control/roles",
          headers: root,
          payload: { key: "superadmin", name: "Changed", permissions: [] },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      await ctx.db.query(
        "select id from admin_audit_logs where action='role.update'",
      ),
    ).toHaveLength(1);
  });
  it("applies maintenance to user endpoints while preserving admin recovery and public certificate verification", async () => {
    const root = await setup();
    const user = await createTestUser(ctx.db);
    const login = await loginAs(ctx.app, user.telegramId);
    expect(
      (
        await ctx.app.inject({
          method: "PUT",
          url: "/api/admin/control/settings",
          headers: root,
          payload: {
            ...defaultPlatformSettings,
            maintenance: true,
            name: "New Brand",
          },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await ctx.app.inject({
          url: "/api/user/me",
          headers: authHeader(login.accessToken),
        })
      ).statusCode,
    ).toBe(503);
    expect(
      (
        await ctx.app.inject({
          url: "/api/admin/control/settings",
          headers: root,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await ctx.app.inject({ url: "/api/content/config" })).json().name,
    ).toBe("New Brand");
  });
  it("sanitizes rich lesson content and validates CSV imports without silently discarding bad rows", async () => {
    const root = await setup();
    const [book] = await ctx.db.query<{ id: string }>(
      "insert into learning_books(title,subject,grade,position) values('Book','algebra',5,1) returning id",
    );
    const [topic] = await ctx.db.query<{ id: string }>(
      "insert into learning_topics(book_id,title,position) values($1,'Topic',1) returning id",
      [book.id],
    );
    const rich = await ctx.app.inject({
      method: "PUT",
      url: `/api/admin/control/topics/${topic.id}/rich-content`,
      headers: root,
      payload: {
        html: '<p onclick="alert(1)">Lesson</p><script>alert(2)</script><span data-type="inline-math" data-latex="x^2"></span>',
      },
    });
    expect(rich.statusCode).toBe(200);
    expect(rich.json().html).not.toContain("script");
    expect(rich.json().html).not.toContain("onclick");
    expect(rich.json().html).toContain("data-latex");
    const badCsv =
      "text,option1,option2,option3,option4,correctIndex,explanation\nGood,A,B,C,D,0,Explanation\nBad,A,B,C,D,8,Wrong";
    const invalid = await ctx.app.inject({
      method: "POST",
      url: `/api/admin/control/topics/${topic.id}/import`,
      headers: root,
      payload: { csv: badCsv, commit: true },
    });
    expect(invalid.json().errors).toHaveLength(1);
    expect(
      await ctx.db.query("select id from learning_questions"),
    ).toHaveLength(0);
    const goodCsv = badCsv.split("\n").slice(0, 2).join("\n");
    const imported = await ctx.app.inject({
      method: "POST",
      url: `/api/admin/control/topics/${topic.id}/import`,
      headers: root,
      payload: { csv: goodCsv, commit: true },
    });
    expect(imported.json().committed).toBe(true);
    expect(
      await ctx.db.query("select id from learning_questions"),
    ).toHaveLength(1);
    const duplicate = await ctx.app.inject({
      method: "POST",
      url: `/api/admin/control/topics/${topic.id}/import`,
      headers: root,
      payload: { csv: goodCsv, commit: true },
    });
    expect(duplicate.json().committed).toBe(false);
    expect(duplicate.json().errors).toHaveLength(1);
  });
  it("validates images, removes metadata and returns a safe public image URL", async () => {
    const root = await setup();
    expect(
      (
        await ctx.app.inject({
          method: "POST",
          url: "/api/admin/control/media",
          headers: root,
          payload: {
            base64: Buffer.from('<svg onload="alert(1)"></svg>').toString(
              "base64",
            ),
          },
        })
      ).statusCode,
    ).toBe(400);
    const sharp = (await import("sharp")).default;
    const image = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#2563eb" },
    })
      .png()
      .toBuffer();
    const uploaded = await ctx.app.inject({
      method: "POST",
      url: "/api/admin/control/media",
      headers: root,
      payload: { base64: image.toString("base64") },
    });
    expect(uploaded.statusCode, uploaded.body).toBe(200);
    const retrieved = await ctx.app.inject({ url: uploaded.json().url });
    expect(retrieved.statusCode).toBe(200);
    expect(retrieved.headers["content-type"]).toBe("image/png");
  });
  it("supports staff notes and support replies through protected endpoints", async () => {
    const root = await setup();
    const user = await createTestUser(ctx.db);
    const support = await staff("support_manager");
    const note = await ctx.app.inject({
      method: "POST",
      url: `/api/admin/control/users/${user.id}/notes`,
      headers: support,
      payload: { body: "Contacted student" },
    });
    expect(note.statusCode).toBe(200);
    const [ticket] = await ctx.db.query<{ id: string }>(
      "insert into support_requests(user_id,subject,message) values($1,'Help','Question') returning id",
      [user.id],
    );
    expect(
      (
        await ctx.app.inject({
          method: "POST",
          url: `/api/admin/control/support/${ticket.id}/reply`,
          headers: support,
          payload: { reply: "Resolved", status: "closed" },
        })
      ).statusCode,
    ).toBe(200);
    const detail = await ctx.app.inject({
      url: `/api/admin/control/users/${user.id}/details`,
      headers: root,
    });
    expect(detail.json().notes[0].body).toBe("Contacted student");
    expect(
      (
        await ctx.app.inject({
          url: "/api/admin/control/support",
          headers: support,
        })
      ).json()[0].status,
    ).toBe("closed");
  });
  it("applies exam-level passing scores, difficulty rules and attempt limits on the server", async () => {
    const root = await setup();
    const user = await createTestUser(ctx.db);
    const [book] = await ctx.db.query<{ id: string }>(
      "insert into learning_books(title,subject,grade,position,published) values('Book','algebra',5,1,true) returning id",
    );
    const [topic] = await ctx.db.query<{ id: string }>(
      "insert into learning_topics(book_id,title,position,published) values($1,'Topic',1,true) returning id",
      [book.id],
    );
    const [exam] = await ctx.db.query<{ id: string }>(
      "insert into learning_exams(book_id,topic_id,kind,published) values($1,$2,'topic',true) returning id",
      [book.id, topic.id],
    );
    await ctx.db.query(
      "insert into learning_questions(topic_id,text,options,correct_index,difficulty) select $1,'Question '||n,'[\"A\",\"B\",\"C\",\"D\"]'::jsonb,0,case when n<=5 then 'easy' else 'hard' end from generate_series(1,10) n",
      [topic.id],
    );
    const rules = await ctx.app.inject({
      method: "PUT",
      url: `/api/admin/control/exams/${exam.id}/rules`,
      headers: root,
      payload: {
        passingScore: 50,
        maxAttempts: 1,
        distribution: { easy: 5, medium: 0, hard: 5 },
      },
    });
    expect(rules.statusCode).toBe(200);
    const started = await startLearningExam(ctx.db, user.id, exam.id);
    expect(started.questions).toHaveLength(10);
    const answers = Object.fromEntries(
      started.questions.map((q, i) => [q.id, i < 5 ? 0 : 1]),
    );
    const result = await submitLearningExam(
      ctx.db,
      user.id,
      started.id,
      answers,
    );
    expect(result.result?.unlocked).toBe(true);
    await expect(
      startLearningExam(ctx.db, user.id, exam.id),
    ).rejects.toMatchObject({ code: "ATTEMPT_LIMIT" });
  });
});
