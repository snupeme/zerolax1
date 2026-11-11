import { afterEach, describe, it, expect } from "vitest";
import { createTestContext, type TestContext } from "./helpers";
import { studyFixture } from "./study-fixture";
let ctx: TestContext;
afterEach(async () => {
  await ctx?.close();
});
describe("Subject, grade, book and topic navigation", () => {
  it("returns all seven grades with real subject-specific book counts and filters books by grade", async () => {
    ctx = await createTestContext();
    const f = await studyFixture(ctx);
    for (const subject of ["algebra", "geometry"]) {
      const response = await ctx.app.inject({
        url: `/api/learning/user/subjects/${subject}/grades`,
        headers: f.headers,
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().map((g: { grade: number }) => g.grade)).toEqual([
        5, 6, 7, 8, 9, 10, 11,
      ]);
      expect(
        response.json().find((g: { grade: number }) => g.grade === 7).bookCount,
      ).toBe(subject === "algebra" ? 2 : 1);
    }
    const a = await ctx.app.inject({
      url: "/api/learning/user/subjects/algebra/grades/7/books",
      headers: f.headers,
    });
    expect(a.json().map((b: { id: string }) => b.id)).toEqual([
      f.algebra,
      f.next,
    ]);
    expect(a.json()[0]).toMatchObject({
      topicCount: 4,
      progress: 0,
      unlocked: true,
      premiumRequired: true,
    });
    const g = await ctx.app.inject({
      url: "/api/learning/user/subjects/geometry/grades/7/books",
      headers: f.headers,
    });
    expect(g.json().map((b: { id: string }) => b.id)).toEqual([f.geometry]);
  });
  it("checks every relationship and rejects malformed, unknown and cross-subject IDs", async () => {
    ctx = await createTestContext();
    const f = await studyFixture(ctx);
    for (const url of [
      "/api/learning/user/subjects/algebra/grades/12/books",
      "/api/learning/user/subjects/algebra/grades/nope/books",
      f.url("geometry", 7, f.algebra) + "/topics",
      f.url("algebra", 8, f.algebra) + "/topics",
      f.url() + "/topics/" + f.geometryTopics[0].id,
      f.url("algebra", 7, "not-a-book") + "/topics",
    ])
      expect(
        (await ctx.app.inject({ url, headers: f.headers })).statusCode,
        url,
      ).toBe(404);
    expect(
      (await ctx.app.inject({ url: f.url() + "/topics" })).statusCode,
    ).toBe(401);
    expect(
      (
        await ctx.app.inject({
          url: f.url("algebra", 7, f.next) + "/topics",
          headers: f.headers,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await ctx.app.inject({
          method: "POST",
          url: f.url() + `/exams/${f.geometryTopics[0].examId}/start`,
          headers: f.headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(404);
  });
  it("returns ordered topic metadata without leaking locked lessons and enforces Premium on direct access", async () => {
    ctx = await createTestContext();
    const f = await studyFixture(ctx);
    const topics = await ctx.app.inject({
      url: f.url() + "/topics",
      headers: f.headers,
    });
    expect(
      topics.json().topics.map((t: { position: number }) => t.position),
    ).toEqual([1, 2, 3, 4]);
    expect(topics.json().topics[3]).toMatchObject({
      accessible: false,
      lockReason: "premium",
      testStatus: "not_started",
    });
    expect(topics.json().topics[3]).not.toHaveProperty("content");
    expect(
      (
        await ctx.app.inject({
          url: f.url() + "/topics/" + f.algebraTopics[0].id,
          headers: f.headers,
        })
      ).json().topic.content,
    ).toContain("Algebra material 1");
    expect(
      (
        await ctx.app.inject({
          url: f.url() + "/topics/" + f.algebraTopics[3].id,
          headers: f.headers,
        })
      ).statusCode,
    ).toBe(403);
    await f.premium();
    expect(
      (
        await ctx.app.inject({
          url: f.url() + "/topics/" + f.algebraTopics[3].id,
          headers: f.headers,
        })
      ).statusCode,
    ).toBe(200);
    await ctx.db.query(
      "update learning_subscriptions set revoked_at=now() where user_id=$1",
      [f.user.id],
    );
    expect(
      (
        await ctx.app.inject({
          url: f.url() + "/topics/" + f.algebraTopics[3].id,
          headers: f.headers,
        })
      ).statusCode,
    ).toBe(403);
    await ctx.db.query(
      "update learning_books set free_topic_limit=4 where id=$1",
      [f.algebra],
    );
    expect(
      (
        await ctx.app.inject({
          url: f.url() + "/topics/" + f.algebraTopics[3].id,
          headers: f.headers,
        })
      ).statusCode,
    ).toBe(200);
  });
  it("runs exactly ten questions, separates progress, scopes attempts and never issues a topic certificate", async () => {
    ctx = await createTestContext();
    const f = await studyFixture(ctx);
    const started = await ctx.app.inject({
      method: "POST",
      url: f.url() + `/exams/${f.algebraTopics[0].examId}/start`,
      headers: f.headers,
      payload: {},
    });
    expect(started.statusCode, started.body).toBe(200);
    const attempt = started.json();
    expect(attempt.questions).toHaveLength(10);
    expect(attempt.topicId).toBe(f.algebraTopics[0].id);
    expect(
      (
        await ctx.app.inject({
          url: f.url("geometry", 7, f.geometry) + `/attempts/${attempt.id}`,
          headers: f.headers,
        })
      ).statusCode,
    ).toBe(404);
    const answers = Object.fromEntries(
      attempt.questions.map((q: { id: string }) => [q.id, 0]),
    );
    const result = await ctx.app.inject({
      method: "POST",
      url: f.url() + `/attempts/${attempt.id}/submit`,
      headers: f.headers,
      payload: { answers },
    });
    expect(result.json()).toMatchObject({
      score: 100,
      kind: "topic",
      result: { certificate: false },
    });
    const a = await ctx.app.inject({
      url: "/api/learning/user/subjects/algebra/grades",
      headers: f.headers,
    });
    const g = await ctx.app.inject({
      url: "/api/learning/user/subjects/geometry/grades",
      headers: f.headers,
    });
    expect(
      a.json().find((v: { grade: number }) => v.grade === 7).completedTopics,
    ).toBe(1);
    expect(
      g.json().find((v: { grade: number }) => v.grade === 7).completedTopics,
    ).toBe(0);
    expect(
      (
        await ctx.app.inject({
          url: "/api/learning/user/certificates",
          headers: f.headers,
        })
      ).json(),
    ).toEqual([]);
    const topics = await ctx.app.inject({
      url: f.url() + "/topics",
      headers: f.headers,
    });
    expect(topics.json().topics[0]).toMatchObject({
      completed: true,
      testStatus: "passed",
      remainingAttempts: 0,
    });
  });
  it("respects admin-disabled grades and never starts a topic exam with a non-ten configuration", async () => {
    ctx = await createTestContext();
    const f = await studyFixture(ctx);
    await ctx.db.query(
      "update learning_settings set value=jsonb_set(value,'{topicQuestionCount}','5'::jsonb)",
    );
    expect(
      (
        await ctx.app.inject({
          method: "POST",
          url: f.url() + `/exams/${f.algebraTopics[0].examId}/start`,
          headers: f.headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(409);
    expect(await ctx.db.query("select id from learning_attempts")).toHaveLength(
      0,
    );
    await ctx.db.query("update content_grades set enabled=false where grade=7");
    expect(
      (
        await ctx.app.inject({
          url: "/api/learning/user/subjects/algebra/grades/7/books",
          headers: f.headers,
        })
      ).statusCode,
    ).toBe(404);
  });
});
