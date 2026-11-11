import type { Db, Queryable } from "@zerolax/db";
import {
  evaluateLearningScore,
  learningSettingsSchema,
  type LearningSettings,
  type LearningExam,
  type LearningBook,
  type LearningSession,
} from "@zerolax/shared";
import { ApiError } from "../errors";
import { certificatePdf } from "./learning-certificates";
import { recordLearningSubmission } from "./edtech-recording";

export async function learningSettings(
  db: Queryable,
): Promise<LearningSettings> {
  const [row] = await db.query<{ value: unknown }>(
    "select value from learning_settings",
  );
  return learningSettingsSchema.parse(row.value);
}
export async function hasPremium(db: Queryable, userId: string) {
  const rows = await db.query(
    `select id from learning_subscriptions where user_id=$1 and revoked_at is null and starts_at<=now() and expires_at>now() limit 1`,
    [userId],
  );
  return rows.length > 0;
}
export async function bookUnlocked(
  db: Queryable,
  userId: string,
  book: LearningBook,
) {
  const previous = await db.query(
    "select id from learning_books where subject=$1 and grade=$2 and position<$3 and published=true limit 1",
    [book.subject, book.grade, book.position],
  );
  if (!previous.length) return true;
  return (
    (
      await db.query(
        "select book_id from learning_book_unlocks where user_id=$1 and book_id=$2",
        [userId, book.id],
      )
    ).length > 0
  );
}
export async function requireBook(
  db: Queryable,
  userId: string,
  bookId: string,
) {
  const [book] = await db.query<LearningBook>(
    "select b.* from learning_books b join content_subjects s on s.slug=b.subject join content_grades g on g.grade=b.grade where b.id=$1 and b.published=true and s.enabled=true and s.visible=true and g.enabled=true",
    [bookId],
  );
  if (!book) throw new ApiError(404, "BOOK_NOT_FOUND", "Book not found");
  if (!(await bookUnlocked(db, userId, book)))
    throw new ApiError(403, "BOOK_LOCKED", "Pass the previous book first");
  return book;
}
export async function requireTopic(
  db: Queryable,
  userId: string,
  topicId: string,
) {
  const [topic] = await db.query<{
    id: string;
    book_id: string;
    position: number;
    content: string;
    title: string;
  }>("select * from learning_topics where id=$1 and published=true", [topicId]);
  if (!topic) throw new ApiError(404, "TOPIC_NOT_FOUND", "Topic not found");
  const book = await requireBook(db, userId, topic.book_id);
  if (topic.position > book.free_topic_limit && !(await hasPremium(db, userId)))
    throw new ApiError(403, "PREMIUM_REQUIRED", "Active Premium is required");
  if (topic.position > 10) {
    const previousBlock = Math.floor((topic.position - 1) / 10);
    const passed = await db.query(
      `select a.id from learning_attempts a join learning_exams e on e.id=a.exam_id where a.user_id=$1 and e.book_id=$2 and e.kind='intermediate' and e.block_number=$3 and a.result->>'unlocked'='true' limit 1`,
      [userId, book.id, previousBlock],
    );
    if (!passed.length)
      throw new ApiError(
        403,
        "INTERMEDIATE_REQUIRED",
        "Pass the previous intermediate exam first",
      );
  }
  return topic;
}

interface Attempt {
  id: string;
  user_id: string;
  exam_id: string;
  status: string;
  started_at: string;
  expires_at: string;
  settings: LearningSettings;
  answers: Record<string, number>;
  score: number | null;
  result: LearningSession["result"];
}
interface Snapshot {
  imageUrl?: string | null;
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}
export async function learningSession(
  db: Queryable,
  userId: string,
  id: string,
): Promise<LearningSession> {
  const [a] = await db.query<Attempt>(
    "select * from learning_attempts where id=$1 and user_id=$2",
    [id, userId],
  );
  if (!a) throw new ApiError(404, "ATTEMPT_NOT_FOUND", "Attempt not found");
  const [exam] = await db.query<LearningExam>(
    "select * from learning_exams where id=$1",
    [a.exam_id],
  );
  if (a.status === "in_progress") {
    if (exam.kind === "topic") await requireTopic(db, userId, exam.topic_id!);
    else {
      const selected = await db.query<{ topic_id: string }>(
        "select distinct q.topic_id from learning_attempt_questions aq join learning_questions q on q.id=aq.question_id where aq.attempt_id=$1",
        [id],
      );
      for (const q of selected) await requireTopic(db, userId, q.topic_id);
    }
  }
  const questions = await db.query<{ question_id: string; snapshot: Snapshot }>(
    "select question_id,snapshot from learning_attempt_questions where attempt_id=$1 order by position",
    [id],
  );
  return {
    kind: exam.kind,
    id: a.id,
    exam_id: a.exam_id,
    status: a.status,
    started_at: a.started_at,
    expires_at: a.expires_at,
    score: a.score === null ? null : Number(a.score),
    result: a.result,
    answers: a.answers,
    questions: questions.map((q) => ({
      id: q.question_id,
      text: q.snapshot.text,
      options: q.snapshot.options,
      imageUrl: q.snapshot.imageUrl ?? null,
    })),
  };
}

export async function startLearningExam(
  db: Db,
  userId: string,
  examId: string,
) {
  // Alert is saved outside the failed start transaction so admins can see the shortage.
  const outcome = await db.transaction(async (tx) => {
    await tx.query("select id from profiles where id=$1 for update", [userId]);
    const [exam] = await tx.query<LearningExam>(
      "select * from learning_exams where id=$1 and published=true for share",
      [examId],
    );
    if (!exam) throw new ApiError(404, "EXAM_NOT_FOUND", "Exam not found");
    const book = await requireBook(tx, userId, exam.book_id);
    const defaults = await learningSettings(tx);
    const settings = {
      ...defaults,
      maxAttempts: exam.max_attempts ?? defaults.maxAttempts,
      unlockFrom:
        exam.kind === "final"
          ? defaults.unlockFrom
          : (exam.passing_score ?? defaults.unlockFrom),
    };
    const [active] = await tx.query<Attempt>(
      "select * from learning_attempts where user_id=$1 and exam_id=$2 and status='in_progress'",
      [userId, examId],
    );
    if (active) return { id: active.id };
    const attempts = await tx.query<Attempt>(
      "select * from learning_attempts where user_id=$1 and exam_id=$2",
      [userId, examId],
    );
    const grants = await tx.query(
      "select id from learning_attempt_grants where user_id=$1 and exam_id=$2 and revoked_at is null",
      [userId, examId],
    );
    if (attempts.length >= settings.maxAttempts + grants.length)
      throw new ApiError(409, "ATTEMPT_LIMIT", "No attempts remaining");
    if (!settings.allowPassedRetake && attempts.some((a) => a.result?.unlocked))
      throw new ApiError(409, "ALREADY_PASSED", "Exam already passed");
    let topicIds: string[];
    if (exam.kind === "topic") {
      const topic = await requireTopic(tx, userId, exam.topic_id!);
      if (topic.book_id !== book.id)
        throw new ApiError(409, "EXAM_INVALID", "Topic and book do not match");
      topicIds = [topic.id];
    } else {
      const topics = await tx.query<{ id: string; position: number }>(
        `select id,position from learning_topics where book_id=$1 and published=true order by position`,
        [book.id],
      );
      const selected =
        exam.kind === "intermediate"
          ? topics.filter(
              (t) =>
                t.position > (exam.block_number! - 1) * 10 &&
                t.position <= exam.block_number! * 10,
            )
          : topics;
      if (
        !selected.length ||
        (exam.kind === "intermediate" &&
          (selected.length !== 10 ||
            selected.some(
              (t, i) => t.position !== (exam.block_number! - 1) * 10 + i + 1,
            )))
      )
        throw new ApiError(
          409,
          "TOPICS_INCOMPLETE",
          "Complete a block of ten published topics first",
        );
      for (const topic of selected) await requireTopic(tx, userId, topic.id);
      topicIds = selected.map((t) => t.id);
      const completed = await tx.query(
        "select topic_id from learning_progress where user_id=$1 and topic_id=any($2::uuid[])",
        [userId, topicIds],
      );
      if (completed.length !== selected.length)
        throw new ApiError(
          409,
          "PROGRESS_REQUIRED",
          "Complete all required topic tests first",
        );
      if (exam.kind === "final") {
        const blocks = Math.floor(topics.length / 10);
        const passed = await tx.query<{ block_number: number }>(
          `select distinct e.block_number from learning_exams e join learning_attempts a on a.exam_id=e.id where e.book_id=$1 and e.kind='intermediate' and a.user_id=$2 and a.result->>'unlocked'='true'`,
          [book.id, userId],
        );
        for (let block = 1; block <= blocks; block++)
          if (!passed.some((p) => p.block_number === block))
            throw new ApiError(
              409,
              "INTERMEDIATE_REQUIRED",
              "Pass each intermediate exam first",
            );
        const details = await tx.query(
          "select user_id from learning_student_details where user_id=$1",
          [userId],
        );
        if (!details.length)
          throw new ApiError(
            409,
            "STUDENT_DETAILS_REQUIRED",
            "Enter your full name and grade before the final exam",
          );
      }
    }
    const count = exam.kind === "topic" ? settings.topicQuestionCount : 20;
    const questions = await tx.query<{
      id: string;
      text: string;
      options: string[];
      correct_index: number;
      image_url: string | null;
      explanation: string;
    }>(
      exam.difficulty_distribution
        ? `select * from (select q.*,row_number() over(partition by difficulty order by random()) as selection_rank from learning_questions q where topic_id=any($1::uuid[]) and published=true) selected where selection_rank<=coalesce(($2::jsonb->>difficulty)::int,0) order by random()`
        : `select * from learning_questions where topic_id=any($1::uuid[]) and published=true order by random() limit $2`,
      [
        topicIds,
        exam.difficulty_distribution
          ? JSON.stringify(exam.difficulty_distribution)
          : count,
      ],
    );
    if (questions.length !== count) return { shortage: true };
    const [attempt] = await tx.query<{ id: string }>(
      `insert into learning_attempts(user_id,exam_id,attempt_number,expires_at,settings) values($1,$2,$3,now()+$4*interval '1 second',$5) returning id`,
      [
        userId,
        examId,
        attempts.length + 1,
        exam.duration_seconds,
        JSON.stringify(settings),
      ],
    );
    for (const [position, q] of questions.entries())
      await tx.query(
        "insert into learning_attempt_questions(attempt_id,question_id,position,snapshot) values($1,$2,$3,$4)",
        [
          attempt.id,
          q.id,
          position,
          JSON.stringify({
            text: q.text,
            options: q.options,
            correctIndex: q.correct_index,
            explanation: q.explanation,
            imageUrl: q.image_url,
          }),
        ],
      );
    await tx.query("delete from learning_alerts where exam_id=$1", [examId]);
    return { id: attempt.id };
  });
  if (outcome.shortage) {
    await db.query(
      `insert into learning_alerts(exam_id,message) values($1,'Not enough published questions to start a complete exam') on conflict(exam_id) do update set updated_at=now(),message=excluded.message`,
      [examId],
    );
    throw new ApiError(
      409,
      "INSUFFICIENT_QUESTIONS",
      "Not enough questions; the administrator has been notified",
    );
  }
  return learningSession(db, userId, outcome.id!);
}

export async function submitLearningExam(
  db: Db,
  userId: string,
  id: string,
  answers: Record<string, number>,
  saveOnly = false,
  webUrl = process.env.WEB_URL ?? "http://localhost:5173",
) {
  await db.transaction(async (tx) => {
    const [a] = await tx.query<Attempt>(
      "select * from learning_attempts where id=$1 and user_id=$2 for update",
      [id, userId],
    );
    if (!a) throw new ApiError(404, "ATTEMPT_NOT_FOUND", "Attempt not found");
    if (a.status !== "in_progress") return;
    const qs = await tx.query<{ question_id: string; snapshot: Snapshot }>(
      "select question_id,snapshot from learning_attempt_questions where attempt_id=$1",
      [id],
    );
    if (
      Object.keys(answers).some((key) => !qs.some((q) => q.question_id === key))
    )
      throw new ApiError(
        400,
        "INVALID_ANSWER",
        "Question is not part of this attempt",
      );
    const expired = new Date(a.expires_at).getTime() <= Date.now();
    const saved = expired ? a.answers : answers;
    if (saveOnly && !expired) {
      await tx.query("update learning_attempts set answers=$2 where id=$1", [
        id,
        JSON.stringify(saved),
      ]);
      return;
    }
    const score =
      Math.round(
        (qs.filter((q) => saved[q.question_id] === q.snapshot.correctIndex)
          .length *
          10000) /
          qs.length,
      ) / 100;
    const [exam] = await tx.query<LearningExam>(
      "select * from learning_exams where id=$1",
      [a.exam_id],
    );
    const result = evaluateLearningScore(score, a.settings);
    result.certificate = result.certificate && exam.kind === "final";
    await tx.query(
      `update learning_attempts set answers=$2,score=$3,result=$4,status=$5,finished_at=least(now(),expires_at) where id=$1`,
      [
        id,
        JSON.stringify(saved),
        score,
        JSON.stringify(result),
        expired ? "expired" : "submitted",
      ],
    );
    if (result.unlocked && exam.kind === "topic")
      await tx.query(
        "insert into learning_progress(user_id,topic_id) values($1,$2) on conflict do nothing",
        [userId, exam.topic_id],
      );
    await recordLearningSubmission(tx, userId, {
      attemptId: id,
      bookId: exam.book_id,
      topicId: exam.topic_id,
      kind: exam.kind,
      unlocked: result.unlocked,
      questions: qs.map((question) => ({
        questionId: question.question_id,
        snapshot: question.snapshot,
      })),
      answers: saved,
    });
    if (exam.kind === "final" && result.unlocked) {
      const [book] = await tx.query<LearningBook>(
        "select * from learning_books where id=$1",
        [exam.book_id],
      );
      const [next] = await tx.query<{ id: string }>(
        "select id from learning_books where subject=$1 and grade=$2 and position>$3 order by position limit 1",
        [book.subject, book.grade, book.position],
      );
      if (next)
        await tx.query(
          "insert into learning_book_unlocks(user_id,book_id,attempt_id) values($1,$2,$3) on conflict do nothing",
          [userId, next.id, id],
        );
      if (result.certificate) {
        const [student] = await tx.query<{ full_name: string; grade: number }>(
          "select * from learning_student_details where user_id=$1",
          [userId],
        );
        if (!student)
          throw new ApiError(
            409,
            "STUDENT_DETAILS_REQUIRED",
            "Student details required",
          );
        await tx.query(
          `insert into learning_certificates(user_id,book_id,attempt_id,student_name,grade,book_title,score,completed_at,seconds_spent) values($1,$2,$3,$4,$5,$6,$7,least(now(),$8::timestamptz),greatest(0,extract(epoch from least(now(),$8::timestamptz)-$9::timestamptz)::integer)) on conflict(user_id,book_id) do nothing`,
          [
            userId,
            book.id,
            id,
            student.full_name,
            student.grade,
            book.title,
            score,
            a.expires_at,
            a.started_at,
          ],
        );
      }
    }
  });
  const [certificate] = await db.query<{ verification_id: string }>(
    "select verification_id from learning_certificates where attempt_id=$1 and pdf is null and revoked_at is null",
    [id],
  );
  if (certificate)
    await certificatePdf(db, userId, certificate.verification_id, webUrl);
  return learningSession(db, userId, id);
}

export async function finalizeExpiredLearningAttempts(db: Db, webUrl?: string) {
  const expired = await db.query<{ id: string; user_id: string }>(
    "select id,user_id from learning_attempts where status='in_progress' and expires_at<=now() order by expires_at limit 100",
  );
  for (const a of expired)
    await submitLearningExam(db, a.user_id, a.id, {}, false, webUrl);
  const pending = await db.query<{ user_id: string; verification_id: string }>(
    "select user_id,verification_id from learning_certificates where pdf is null and revoked_at is null limit 100",
  );
  for (const c of pending)
    await certificatePdf(
      db,
      c.user_id,
      c.verification_id,
      webUrl ?? "http://localhost:5173",
    );
  return expired.length;
}
