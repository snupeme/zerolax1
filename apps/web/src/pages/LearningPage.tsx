import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type {
  LearningBook,
  LearningTopic,
  LearningExam,
  LearningSession,
  LearningCertificate,
} from "@zerolax/shared";
import { request } from "../lib/api";
import {
  learningRequest as call,
  useLearningWords,
  downloadCertificate,
} from "../lib/learning";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
import { RichContent } from '../components/RichContent';
import { BannerStrip } from '../components/BannerStrip';

export function LearningPage() {
  const w = useLearningWords();
  const navigate = useNavigate();
  const { bookId, attemptId } = useParams();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lesson, setLesson] = useState<LearningTopic | null>(null);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState(5);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());
  const books = useQuery({
    queryKey: ["learning-books"],
    queryFn: () => call<LearningBook[]>("/books"),
  });
  const book = useQuery({
    queryKey: ["learning-book", bookId],
    queryFn: () =>
      call<{
        book: LearningBook;
        topics: LearningTopic[];
        exams: LearningExam[];
      }>(`/books/${bookId}`),
    enabled: !!bookId,
  });
  const me = useQuery({
    queryKey: ["learning-me"],
    queryFn: () =>
      call<{
        premium: boolean;
        student: { full_name: string; grade: number } | null;
        attempts: LearningSession[];
        certificates: LearningCertificate[];
      }>("/me"),
  });
  const attempt = useQuery({
    queryKey: ["learning-attempt", attemptId],
    queryFn: () => call<LearningSession>(`/attempts/${attemptId}`),
    enabled: !!attemptId,
  });
  useEffect(() => {
    if (me.data?.student) {
      setName(me.data.student.full_name);
      setGrade(me.data.student.grade);
    }
  }, [me.data?.student]);
  useEffect(() => {
    setAnswers(attempt.data?.answers ?? {});
  }, [attempt.data?.id]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    const result = await call<LearningSession>(
      `/attempts/${attemptId}/submit`,
      { answers },
    );
    attempt.refetch();
    me.refetch();
    book.refetch();
    return result;
  }
  const remaining = attempt.data
    ? Math.max(
        0,
        Math.ceil((new Date(attempt.data.expires_at).getTime() - now) / 1000),
      )
    : 0;
  useEffect(() => {
    if (attempt.data?.status === "in_progress" && remaining === 0 && !busy)
      void run(finish);
  }, [remaining, attempt.data?.status]);
  // Persist answers immediately; the server ignores writes after the deadline.
  async function answer(questionId: string, index: number) {
    const next = { ...answers, [questionId]: index };
    setAnswers(next);
    await run(async () => {
      await call(`/attempts/${attemptId}/answers`, { answers: next }, "PUT");
    });
  }
  const content = attempt.data;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{w.learning}</h1>
      {!attemptId&&<BannerStrip placement="learning"/>}
      {(error || books.error || book.error || attempt.error || me.error) && (
        <p role="alert" className="text-destructive">
          {error ||
            (books.error || book.error || attempt.error || me.error)?.message}
        </p>
      )}
      {(books.isLoading ||
        me.isLoading ||
        book.isFetching ||
        attempt.isFetching) && <p aria-live="polite">…</p>}
      {attemptId ? (
        <>
          <Link to={bookId ? `/learning/books/${bookId}` : "/learning"}>
            {w.back}
          </Link>
          {content && (
            <>
              <p>
                {w.time}: {Math.floor(remaining / 60)}:
                {String(remaining % 60).padStart(2, "0")}
              </p>
              {content.status === "in_progress" ? (
                <>
                  <div className="space-y-4">
                    {content.questions.map((q, i) => (
                      <Card key={q.id}>
                        <CardContent className="space-y-3 p-4">
                          <div className="font-semibold">{i+1}. <RichContent content={q.text}/></div>
                          {q.imageUrl&&<img className="max-h-64 max-w-full rounded-lg" src={q.imageUrl} alt=""/>}
                          {q.options.map((option, index) => (
                            <label
                              key={index}
                              className="flex cursor-pointer items-center gap-3 rounded border p-3"
                            >
                              <input
                                type="radio"
                                name={q.id}
                                checked={answers[q.id] === index}
                                disabled={busy || remaining === 0}
                                onChange={() => void answer(q.id, index)}
                              />
                              <RichContent content={option}/>
                            </label>
                          ))}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  <Button
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(w.confirm)) void run(finish);
                    }}
                  >
                    {w.submit}
                  </Button>
                </>
              ) : (
                <Card>
                  <CardContent className="space-y-2 p-5">
                    <p>
                      {w.score}: {content.score}/100
                    </p>
                    <p>
                      {content.result
                        ? w[
                            content.result.policy as
                              "repeat" | "review" | "pending" | "passed"
                          ]
                        : ""}
                    </p>
                    {content.kind === "final" && content.result?.unlocked && (
                      <p>{w.next}</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      ) : bookId ? (
        <>
          <Link to="/learning">{w.back}</Link>
          <h2 className="text-xl font-semibold">{book.data?.book.title}</h2>
          {book.data?.topics.map((topic) => (
            <Card key={topic.id}>
              <CardContent className="space-y-2 p-4">
                <h3 className="font-semibold">
                  {topic.position}. {topic.title} {topic.completed ? "✓" : ""}
                </h3>
                {topic.accessible ? (
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() =>
                      void run(async () =>
                        setLesson(
                          await call<LearningTopic>(`/topics/${topic.id}`),
                        ),
                      )
                    }
                  >
                    {w.load}
                  </Button>
                ) : (
                  <p>{w.premium}</p>
                )}
                {book.data.exams
                  .filter((e) => e.kind === "topic" && e.topic_id === topic.id)
                  .map((exam) => (
                    <div key={exam.id}>
                      <p>
                        {w.remaining}: {exam.remaining}
                      </p>
                      <Button
                        disabled={busy || !topic.accessible || !exam.remaining}
                        onClick={() =>
                          void run(async () => {
                            const s = await call<LearningSession>(
                              `/exams/${exam.id}/start`,
                              {},
                            );
                            navigate(
                              `/learning/books/${bookId}/attempts/${s.id}`,
                            );
                          })
                        }
                      >
                        {w.topic}
                      </Button>
                    </div>
                  ))}
              </CardContent>
            </Card>
          ))}
          {lesson && (
            <Card>
              <CardContent className="space-y-3 p-4">
                <h3 className="font-bold">{lesson.title}</h3>
                <RichContent content={lesson.content??''} format={lesson.content_format}/>
                <Button variant="outline" onClick={() => setLesson(null)}>
                  {w.back}
                </Button>
              </CardContent>
            </Card>
          )}
          {book.data?.exams
            .filter((e) => e.kind !== "topic")
            .map((e) => (
              <Card key={e.id}>
                <CardContent className="space-y-3 p-4">
                  <h3>
                    {w[e.kind]} {e.block_number ?? ""}
                  </h3>
                  <p>
                    {w.remaining}: {e.remaining}
                  </p>
                  <Button
                    disabled={busy || !e.remaining}
                    onClick={() =>
                      void run(async () => {
                        const a = await call<LearningSession>(
                          `/exams/${e.id}/start`,
                          {},
                        );
                        navigate(`/learning/books/${bookId}/attempts/${a.id}`);
                      })
                    }
                  >
                    {w.start}
                  </Button>
                </CardContent>
              </Card>
            ))}
        </>
      ) : (
        <>
          <p>{me.data?.premium ? w.active : w.noPremium}</p>
          <Button
            disabled={busy}
            variant="outline"
            onClick={() =>
              void run(async () => {
                const c = await call<{ url: string }>("/checkout", {});
                window.location.assign(c.url);
              })
            }
          >
            {w.checkout}
          </Button>
          <h2 className="text-lg font-semibold">{w.books}</h2>
          {books.data?.length === 0 && <p>{w.empty}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {books.data?.map((b) => (
              <Card key={b.id}>
                <CardContent className="space-y-3 p-4">
                  <h3 className="font-semibold">{b.title}</h3>
                  {b.cover_url&&<img src={b.cover_url} alt="" className="h-36 w-full rounded-lg object-cover"/>}
                  {b.description&&<p className="text-sm text-muted-foreground">{b.description}</p>}
                  <p>
                    {b.grade} · {b.subject_title??b.subject}
                  </p>
                  {b.unlocked ? (
                    <Link
                      className="text-primary underline"
                      to={`/learning/books/${b.id}`}
                    >
                      {w.start}
                    </Link>
                  ) : (
                    <p>{w.locked}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
      {!attemptId && (
        <>
          <form
            className="space-y-3 rounded-xl border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await call("/student", { fullName: name, grade }, "PUT");
                await me.refetch();
              });
            }}
          >
            <h2 className="font-semibold">{w.student}</h2>
            <label className="block">
              {w.name}
              <Input
                required
                minLength={3}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block">
              {w.grade}
              <Input
                type="number"
                min={5}
                max={11}
                value={grade}
                onChange={(e) => setGrade(Number(e.target.value))}
              />
            </label>
            <Button disabled={busy}>{w.save}</Button>
          </form>
          <h2 className="font-semibold">{w.history}</h2>
          {me.data?.attempts.map((a) => (
            <Link
              key={a.id}
              className="block rounded border p-3"
              to={`/learning/attempts/${a.id}`}
            >
              {new Date(a.started_at).toLocaleString()} · {a.score ?? "…"}
              /100
            </Link>
          ))}
          <h2 className="font-semibold">{w.certificates}</h2>
          {me.data?.certificates.map((c) => (
            <div
              key={c.verification_id}
              className="space-y-2 rounded border p-4"
            >
              <p>
                {c.book_title} · {c.score}/100
              </p>
              <Link
                className="text-primary underline"
                to={`/certificates/${c.verification_id}`}
              >
                {w.verify}
              </Link>
              <Button
                disabled={busy || !!c.revoked_at}
                variant="outline"
                onClick={() =>
                  void run(() => downloadCertificate(c.verification_id))
                }
              >
                {w.download}
              </Button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export function CertificatePage() {
  const { id } = useParams();
  const w = useLearningWords();
  const q = useQuery({
    queryKey: ["certificate", id],
    queryFn: () =>
      request<LearningCertificate>(`/api/learning/certificates/${id}`, {
        auth: "none",
      }),
  });
  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">ZEROLAX · {w.verify}</h1>
      {q.error && <p role="alert">{q.error.message}</p>}
      {q.isLoading && <p>…</p>}
      {q.data && (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p
              className={
                q.data.revoked_at ? "text-destructive" : "text-primary"
              }
            >
              {q.data.revoked_at ? w.revoked : w.valid}
            </p>
            <h2 className="text-xl font-semibold">{q.data.student_name}</h2>
            <p>{q.data.book_title}</p>
            <p>
              {w.grade}: {q.data.grade}
            </p>
            <p>
              {w.score}: {q.data.score}/100
            </p>
            <p>{new Date(q.data.completed_at).toLocaleString()}</p>
            <p className="break-all text-xs">{q.data.verification_id}</p>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
