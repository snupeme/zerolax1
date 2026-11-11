import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { Db } from "@zerolax/db";
import { z } from "zod";
import type {
  LearningBook,
  LearningExam,
  StudyBook,
  StudySubject,
  StudySession,
} from "@zerolax/shared";
import { ApiError } from "../errors";
import {
  bookUnlocked,
  hasPremium,
  requireBook,
  requireTopic,
  learningSettings,
  learningSession,
  startLearningExam,
  submitLearningExam,
} from "../services/learning";
interface Options {
  db: Db;
  webUrl: string;
}
interface Params {
  subject: string;
  gradeId?: string;
  bookId?: string;
  topicId?: string;
  examId?: string;
  attemptId?: string;
}
const answers = z.object({
  answers: z.record(z.string().uuid(), z.number().int().min(0).max(3)),
});
export const studyRoutes: FastifyPluginAsync<Options> = async (
  app,
  { db, webUrl },
) => {
  function identifier(value: string | undefined, kind: string) {
    if (!z.string().uuid().safeParse(value).success)
      throw new ApiError(
        404,
        kind.toUpperCase() + "_NOT_FOUND",
        kind + " not found",
      );
    return value!;
  }
  async function context(r: FastifyRequest, withGrade = true) {
    const p = r.params as Params;
    if (!["algebra", "geometry"].includes(p.subject))
      throw new ApiError(404, "SUBJECT_NOT_FOUND", "Subject not found");
    if (
      !(
        await db.query(
          "select slug from content_subjects where slug=$1 and enabled=true and visible=true",
          [p.subject],
        )
      ).length
    )
      throw new ApiError(404, "SUBJECT_NOT_FOUND", "Subject not found");
    const grade = Number(p.gradeId);
    if (
      withGrade &&
      (!/^\d+$/.test(p.gradeId ?? "") ||
        grade < 5 ||
        grade > 11 ||
        !(
          await db.query(
            "select grade from content_grades where grade=$1 and enabled=true",
            [grade],
          )
        ).length)
    )
      throw new ApiError(404, "GRADE_NOT_FOUND", "Grade not found");
    return {
      subject: p.subject as StudySubject,
      grade,
      userId: r.profile!.id,
      p,
    };
  }
  async function bookContext(r: FastifyRequest) {
    const c = await context(r);
    const bookId = identifier(c.p.bookId, "book");
    // Scope is checked before returning metadata or checking progression.
    const [book] = await db.query<LearningBook>(
      "select * from learning_books where id=$1 and subject=$2 and grade=$3 and published=true",
      [bookId, c.subject, c.grade],
    );
    if (!book)
      throw new ApiError(
        404,
        "BOOK_NOT_FOUND",
        "Book does not belong to this subject and grade",
      );
    await requireBook(db, c.userId, bookId);
    return { ...c, book };
  }
  app.get("/:subject/grades", async (r) => {
    const c = await context(r, false);
    const rows = await db.query<{
      grade: number;
      enabled: boolean;
      book_count: number;
      topic_count: number;
      completed: number;
    }>(
      `select g.grade,g.enabled,
   (select count(*)::int from learning_books b where b.subject=$1 and b.grade=g.grade and b.published=true) as book_count,
   (select count(*)::int from learning_topics t join learning_books b on b.id=t.book_id where b.subject=$1 and b.grade=g.grade and b.published=true and t.published=true) as topic_count,
   (select count(*)::int from learning_progress p join learning_topics t on t.id=p.topic_id join learning_books b on b.id=t.book_id where p.user_id=$2 and b.subject=$1 and b.grade=g.grade and b.published=true and t.published=true) as completed
   from content_grades g where g.grade between 5 and 11 order by g.grade`,
      [c.subject, c.userId],
    );
    return rows.map((g) => ({
      grade: g.grade,
      enabled: g.enabled,
      bookCount: g.enabled ? g.book_count : 0,
      topicCount: g.topic_count,
      completedTopics: g.completed,
      progress: g.topic_count
        ? Math.round((g.completed * 100) / g.topic_count)
        : 0,
    }));
  });
  app.get("/:subject/grades/:gradeId/books", async (r) => {
    const c = await context(r);
    const rows = await db.query<
      LearningBook & { topic_count: number; completed: number }
    >(
      `select b.*,
   (select count(*)::int from learning_topics t where t.book_id=b.id and t.published=true) as topic_count,
   (select count(*)::int from learning_progress p join learning_topics t on t.id=p.topic_id where p.user_id=$3 and t.book_id=b.id and t.published=true) as completed
   from learning_books b where b.subject=$1 and b.grade=$2 and b.published=true order by b.position,b.id`,
      [c.subject, c.grade, c.userId],
    );
    const premium = await hasPremium(db, c.userId);
    return Promise.all(
      rows.map(
        async (b) =>
          ({
            ...b,
            topicCount: b.topic_count,
            completedTopics: b.completed,
            progress: b.topic_count
              ? Math.round((b.completed * 100) / b.topic_count)
              : 0,
            unlocked: await bookUnlocked(db, c.userId, b),
            premiumRequired: !premium && b.topic_count > b.free_topic_limit,
          }) satisfies StudyBook,
      ),
    );
  });
  app.get("/:subject/grades/:gradeId/books/:bookId/topics", async (r) => {
    const c = await bookContext(r);
    const premium = await hasPremium(db, c.userId);
    const settings = await learningSettings(db);
    const topics = await db.query<{
      id: string;
      book_id: string;
      title: string;
      position: number;
      published: boolean;
      completed: boolean;
      exam_id: string | null;
      attempt_limit: number;
      used: number;
      latest_status: string | null;
      passed: boolean;
    }>(
      `select t.id,t.book_id,t.title,t.position,t.published,
   exists(select 1 from learning_progress p where p.user_id=$2 and p.topic_id=t.id) as completed,e.id as exam_id,coalesce(e.max_attempts,$3)+(select count(*) from learning_attempt_grants g where g.user_id=$2 and g.exam_id=e.id and g.revoked_at is null)::int as attempt_limit,
   (select count(*)::int from learning_attempts a where a.user_id=$2 and a.exam_id=e.id) as used,
   (select status from learning_attempts a where a.user_id=$2 and a.exam_id=e.id order by attempt_number desc limit 1) as latest_status,
   exists(select 1 from learning_attempts a where a.user_id=$2 and a.exam_id=e.id and a.result->>'unlocked'='true') as passed
   from learning_topics t left join learning_exams e on e.topic_id=t.id and e.kind='topic' and e.published=true where t.book_id=$1 and t.published=true order by t.position`,
      [c.book.id, c.userId, settings.maxAttempts],
    );
    const passedBlocks = await db.query<{ block_number: number }>(
      `select distinct e.block_number from learning_exams e join learning_attempts a on a.exam_id=e.id where e.book_id=$1 and e.kind='intermediate' and a.user_id=$2 and a.result->>'unlocked'='true'`,
      [c.book.id, c.userId],
    );
    const exams = await db.query<LearningExam>(
      `select e.* from learning_exams e where e.book_id=$1 and e.kind<>'topic' and e.published=true order by e.kind,e.block_number`,
      [c.book.id],
    );
    const completed = topics.filter((t) => t.completed).length;
    return {
      book: {
        ...c.book,
        topicCount: topics.length,
        completedTopics: completed,
        progress: topics.length
          ? Math.round((completed * 100) / topics.length)
          : 0,
        unlocked: true,
        premiumRequired:
          !premium && topics.some((t) => t.position > c.book.free_topic_limit),
      },
      premium,
      topics: topics.map((t) => {
        const lockReason =
          t.position > c.book.free_topic_limit && !premium
            ? "premium"
            : t.position > 10 &&
                !passedBlocks.some(
                  (b) => b.block_number === Math.floor((t.position - 1) / 10),
                )
              ? "intermediate"
              : null;
        return {
          id: t.id,
          book_id: t.book_id,
          title: t.title,
          position: t.position,
          published: t.published,
          completed: t.completed,
          accessible: !lockReason,
          lockReason,
          examId: t.exam_id,
          testStatus: t.passed ? "passed" : (t.latest_status ?? "not_started"),
          remainingAttempts:
            t.passed && !settings.allowPassedRetake
              ? 0
              : Math.max(0, t.attempt_limit - t.used),
        };
      }),
      exams,
    };
  });
  app.get(
    "/:subject/grades/:gradeId/books/:bookId/topics/:topicId",
    async (r) => {
      const c = await bookContext(r);
      const topicId = identifier(c.p.topicId, "topic");
      if (
        !(
          await db.query(
            "select id from learning_topics where id=$1 and book_id=$2 and published=true",
            [topicId, c.book.id],
          )
        ).length
      )
        throw new ApiError(
          404,
          "TOPIC_NOT_FOUND",
          "Topic does not belong to this book",
        );
      const topic = await requireTopic(db, c.userId, topicId);
      const [exam] = await db.query<LearningExam>(
        "select * from learning_exams where topic_id=$1 and kind='topic' and published=true",
        [topicId],
      );
      let details: (LearningExam & { activeAttemptId?: string | null }) | null =
        null;
      if (exam) {
        const settings = await learningSettings(db);
        const [state] = await db.query<{
          used: number;
          grants: number;
          passed: boolean;
          active_id: string | null;
        }>(
          `select (select count(*)::int from learning_attempts where user_id=$1 and exam_id=$2) as used,(select count(*)::int from learning_attempt_grants where user_id=$1 and exam_id=$2 and revoked_at is null) as grants,exists(select 1 from learning_attempts where user_id=$1 and exam_id=$2 and result->>'unlocked'='true') as passed,(select id from learning_attempts where user_id=$1 and exam_id=$2 and status='in_progress' limit 1) as active_id`,
          [c.userId, exam.id],
        );
        details = {
          ...exam,
          remaining:
            state.passed && !settings.allowPassedRetake
              ? 0
              : Math.max(
                  0,
                  (exam.max_attempts ?? settings.maxAttempts) +
                    state.grants -
                    state.used,
                ),
          activeAttemptId: state.active_id,
        };
      }
      return { book: c.book, topic, exam: details, questionCount: 10 };
    },
  );
  async function sessionContext(r: FastifyRequest) {
    const c = await bookContext(r);
    const attemptId = identifier(c.p.attemptId, "attempt");
    const [row] = await db.query<{ topic_id: string | null }>(
      `select e.topic_id from learning_attempts a join learning_exams e on e.id=a.exam_id where a.id=$1 and a.user_id=$2 and e.book_id=$3`,
      [attemptId, c.userId, c.book.id],
    );
    if (!row)
      throw new ApiError(
        404,
        "ATTEMPT_NOT_FOUND",
        "Attempt does not belong to this book",
      );
    return { ...c, attemptId, topicId: row.topic_id };
  }
  const sessionResponse = (
    s: Awaited<ReturnType<typeof learningSession>>,
    topicId: string | null,
  ): StudySession => ({ ...s, topicId });
  app.post(
    "/:subject/grades/:gradeId/books/:bookId/exams/:examId/start",
    async (r) => {
      const c = await bookContext(r);
      const examId = identifier(c.p.examId, "exam");
      const [exam] = await db.query<LearningExam>(
        "select * from learning_exams where id=$1 and book_id=$2 and published=true",
        [examId, c.book.id],
      );
      if (!exam)
        throw new ApiError(
          404,
          "EXAM_NOT_FOUND",
          "Exam does not belong to this book",
        );
      if (
        exam.kind === "topic" &&
        (await learningSettings(db)).topicQuestionCount !== 10
      )
        throw new ApiError(
          409,
          "TOPIC_QUESTION_COUNT",
          "This learning module requires ten questions per topic test; update the admin setting",
        );
      const session = await startLearningExam(db, c.userId, examId);
      if (exam.kind === "topic" && session.questions.length !== 10)
        throw new ApiError(
          409,
          "TOPIC_QUESTION_COUNT",
          "The existing attempt does not have ten questions",
        );
      return sessionResponse(session, exam.topic_id);
    },
  );
  app.get(
    "/:subject/grades/:gradeId/books/:bookId/attempts/:attemptId",
    async (r) => {
      const c = await sessionContext(r);
      let s = await learningSession(db, c.userId, c.attemptId);
      if (
        s.status === "in_progress" &&
        new Date(s.expires_at).getTime() <= Date.now()
      )
        s = await submitLearningExam(
          db,
          c.userId,
          c.attemptId,
          {},
          false,
          webUrl,
        );
      return sessionResponse(s, c.topicId);
    },
  );
  for (const [suffix, method, saveOnly] of [
    ["answers", "PUT", true],
    ["submit", "POST", false],
  ] as const) {
    app.route({
      method,
      url:
        "/:subject/grades/:gradeId/books/:bookId/attempts/:attemptId/" + suffix,
      handler: async (r) => {
        const c = await sessionContext(r);
        return sessionResponse(
          await submitLearningExam(
            db,
            c.userId,
            c.attemptId,
            answers.parse(r.body).answers,
            saveOnly,
            webUrl,
          ),
          c.topicId,
        );
      },
    });
  }
};
