import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Calculator,
  Shapes,
  LockKeyhole,
  CheckCircle2,
  ChevronRight,
  GraduationCap,
} from "lucide-react";
import type {
  StudySubject,
  StudyGrade,
  StudyBook,
  StudyBookResponse,
  StudyLesson,
  StudySession,
} from "@zerolax/shared";
import { studyApi, studyPath, useStudyBack, useStudyWords } from "../lib/study";
import { ApiError } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { RichContent } from "../components/RichContent";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/feedback";
import { cn } from "../lib/utils";

function Progress({ value }: { value: number }) {
  const w = useStudyWords();
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between gap-3 text-xs text-muted-foreground">
        <span>{w.progress}</span>
        <span>{value}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={w.progress}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
function Frame({
  title,
  subtitle,
  back,
  children,
}: {
  title: string;
  subtitle?: string;
  back: string;
  children: ReactNode;
}) {
  const goBack = useStudyBack(back);
  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title={title}
        subtitle={subtitle}
        backTo={back}
        onBack={goBack}
      />
      {children}
    </div>
  );
}
function Failure({ error, back }: { error: Error; back: string }) {
  const w = useStudyWords();
  const code = error instanceof ApiError ? error.code : "";
  const premium = code === "PREMIUM_REQUIRED";
  const missing =
    error instanceof ApiError && (error.status === 404 || error.status === 400);
  return (
    <Frame
      title={premium ? w.premium : missing ? w.notFound : w.unavailable}
      back={back}
    >
      <Card>
        <CardContent className="space-y-3 p-5">
          <p role="alert">
            {premium
              ? w.premiumMessage
              : missing
                ? w.notFoundMessage
                : code === "BOOK_LOCKED"
                  ? w.previous
                  : code === "INTERMEDIATE_REQUIRED"
                    ? w.intermediate
                    : error.message}
          </p>
          <Link className="text-primary underline" to={back}>
            {w.back}
          </Link>
        </CardContent>
      </Card>
    </Frame>
  );
}
const Loading = () => (
  <div aria-busy="true" className="grid grid-cols-2 gap-3">
    {Array.from({ length: 4 }, (_, i) => (
      <Skeleton key={i} className="h-40 rounded-xl" />
    ))}
  </div>
);
const scoped = (grade: string | undefined, book: string | undefined) =>
  `/grades/${grade}/books/${book}`;

export function SubjectLearningPage({
  subject,
  view,
}: {
  subject: StudySubject;
  view: "grades" | "books" | "topics" | "topic" | "attempt";
}) {
  return view === "grades" ? (
    <Grades subject={subject} />
  ) : view === "books" ? (
    <Books subject={subject} />
  ) : view === "topics" ? (
    <Topics subject={subject} />
  ) : view === "topic" ? (
    <Lesson subject={subject} />
  ) : (
    <Attempt subject={subject} />
  );
}
function Grades({ subject }: { subject: StudySubject }) {
  const w = useStudyWords();
  const q = useQuery({
    queryKey: ["course", subject, "grades"],
    queryFn: () => studyApi<StudyGrade[]>(subject, "/grades"),
  });
  const Icon = subject === "algebra" ? Calculator : Shapes;
  if (q.error) return <Failure error={q.error} back="/" />;
  return (
    <Frame title={w[subject]} subtitle={w.chooseGrade} back="/">
      {q.isLoading ? (
        <Loading />
      ) : (
        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3 sm:gap-4">
          {q.data?.map((g, i) => {
            const last = i === q.data.length - 1 && q.data.length % 2 === 1;
            const style = cn(
              "group relative space-y-4 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md sm:p-5",
              last &&
                "col-span-2 mx-auto w-[calc(50%-0.375rem)] sm:w-[calc(50%-0.5rem)]",
            );
            const content = (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "grid h-11 w-11 place-items-center rounded-xl",
                      subject === "algebra"
                        ? "bg-primary/10 text-primary"
                        : "bg-success/10 text-success",
                    )}
                  >
                    <Icon size={24} />
                  </span>
                  <ChevronRight size={16} className="text-muted-foreground" />
                </div>
                <h2 className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold">{g.grade}</span>
                  <span className="text-sm font-bold text-muted-foreground">
                    -{w.grade}
                  </span>
                </h2>
                <p className="text-sm text-muted-foreground">
                  {g.bookCount} {w.books}
                </p>
                {g.topicCount > 0 && <Progress value={g.progress} />}
              </>
            );
            return g.enabled ? (
              <Link
                key={g.grade}
                aria-label={`${g.grade}-${w.grade}`}
                className={style}
                to={studyPath(subject, g.grade)}
              >
                {content}
              </Link>
            ) : (
              <div
                key={g.grade}
                className={cn(style, "opacity-50")}
                aria-disabled="true"
              >
                {content}
                <p className="text-xs">{w.unavailable}</p>
              </div>
            );
          })}
        </div>
      )}
    </Frame>
  );
}
function Books({ subject }: { subject: StudySubject }) {
  const { gradeId } = useParams();
  const w = useStudyWords();
  const q = useQuery({
    queryKey: ["course", subject, gradeId, "books"],
    queryFn: () => studyApi<StudyBook[]>(subject, `/grades/${gradeId}/books`),
  });
  if (q.error) return <Failure error={q.error} back={studyPath(subject)} />;
  return (
    <Frame
      title={`${w[subject]} · ${gradeId}-${w.grade}`}
      subtitle={w.books}
      back={studyPath(subject)}
    >
      {q.isLoading ? (
        <Loading />
      ) : !q.data?.length ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {w.emptyBooks}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {q.data.map((b) => (
            <Card key={b.id} className="overflow-hidden">
              {b.cover_url ? (
                <img
                  src={b.cover_url}
                  alt={b.title}
                  className="h-40 w-full object-cover"
                />
              ) : (
                <div className="grid h-32 place-items-center bg-primary/5">
                  <BookOpen className="h-12 w-12 text-primary/60" />
                </div>
              )}
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={b.unlocked ? "success" : "default"}>
                    {b.unlocked ? w.available : w.locked}
                  </Badge>
                  {b.premiumRequired && (
                    <Badge variant="warning">Premium</Badge>
                  )}
                </div>
                <h2 className="text-lg font-bold">{b.title}</h2>
                {b.description && (
                  <p className="text-sm text-muted-foreground">
                    {b.description}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  {b.topicCount} {w.topics}
                </p>
                <Progress value={b.progress} />
                {b.unlocked ? (
                  <Link
                    className="inline-flex items-center gap-2 font-semibold text-primary"
                    to={`${studyPath(subject, gradeId, b.id)}/topics`}
                  >
                    {w.start}
                    <ChevronRight size={16} />
                  </Link>
                ) : (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <LockKeyhole size={14} />
                    {w.previous}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Frame>
  );
}
function Topics({ subject }: { subject: StudySubject }) {
  const { gradeId, bookId } = useParams();
  const w = useStudyWords();
  const navigate = useNavigate();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const base = studyPath(subject, gradeId, bookId);
  const q = useQuery({
    queryKey: ["course", subject, gradeId, bookId, "topics"],
    queryFn: () =>
      studyApi<StudyBookResponse>(subject, scoped(gradeId, bookId) + "/topics"),
  });
  const status = {
    not_started: w.notStarted,
    in_progress: w.inProgress,
    submitted: w.submitted,
    expired: w.expired,
    passed: w.passed,
  };
  if (q.error)
    return <Failure error={q.error} back={studyPath(subject, gradeId)} />;
  return (
    <Frame
      title={q.data?.book.title ?? w.topics}
      subtitle={`${w[subject]} · ${gradeId}-${w.grade}`}
      back={studyPath(subject, gradeId)}
    >
      {q.isLoading ? (
        <Loading />
      ) : (
        <>
          <Progress value={q.data?.book.progress ?? 0} />
          {notice && (
            <p
              role="alert"
              className="rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm"
            >
              {notice}
            </p>
          )}
          {!q.data?.topics.length && <p>{w.emptyTopics}</p>}
          <div className="space-y-3">
            {q.data?.topics.map((t) => (
              <button
                key={t.id}
                className="flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-left transition hover:border-primary/40"
                onClick={() => {
                  if (!t.accessible) {
                    setNotice(
                      t.lockReason === "premium"
                        ? w.premiumMessage
                        : w.intermediate,
                    );
                    return;
                  }
                  setNotice("");
                  navigate(`${base}/topics/${t.id}`);
                }}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 font-bold text-primary">
                  {t.position}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <h2 className="font-semibold">{t.title}</h2>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={t.completed ? "success" : "outline"}>
                      {t.completed
                        ? w.completed
                        : t.position <= (q.data?.book.free_topic_limit ?? 3)
                          ? w.free
                          : "Premium"}
                    </Badge>
                    {!t.accessible && (
                      <Badge variant="warning">
                        {t.lockReason === "premium" ? w.premium : w.locked}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t.examId
                      ? `${w.test}: ${status[t.testStatus]}`
                      : w.testSoon}
                  </p>
                </div>
                {t.completed ? (
                  <CheckCircle2 className="text-success" size={20} />
                ) : t.accessible ? (
                  <ChevronRight className="text-muted-foreground" size={20} />
                ) : (
                  <LockKeyhole className="text-gold-deep" size={20} />
                )}
              </button>
            ))}
          </div>
          {!!q.data?.exams.length && (
            <section className="space-y-3 border-t pt-5">
              <h2 className="font-semibold">{w.exams}</h2>
              {q.data.exams.map((e) => (
                <Card key={e.id}>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <span>
                      {e.kind === "final" ? w.final : w.block}{" "}
                      {e.block_number ?? ""}
                    </span>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setNotice("");
                        try {
                          const s = await studyApi<StudySession>(
                            subject,
                            scoped(gradeId, bookId) + `/exams/${e.id}/start`,
                            {},
                          );
                          navigate(`${base}/attempts/${s.id}`);
                        } catch (error) {
                          setNotice((error as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {w.start}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </section>
          )}
        </>
      )}
    </Frame>
  );
}
function Lesson({ subject }: { subject: StudySubject }) {
  const { gradeId, bookId, topicId } = useParams();
  const w = useStudyWords();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const back = studyPath(subject, gradeId, bookId) + "/topics";
  const q = useQuery({
    queryKey: ["course", subject, gradeId, bookId, topicId],
    queryFn: () =>
      studyApi<StudyLesson>(
        subject,
        scoped(gradeId, bookId) + `/topics/${topicId}`,
      ),
  });
  if (q.error) return <Failure error={q.error} back={back} />;
  return (
    <Frame
      title={q.data?.topic.title ?? w.topics}
      subtitle={q.data?.book.title}
      back={back}
    >
      {q.isLoading ? (
        <Loading />
      ) : (
        q.data && (
          <>
            <Card>
              <CardContent className="p-5 sm:p-6">
                <RichContent
                  content={q.data.topic.content ?? ""}
                  format={q.data.topic.content_format}
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-3 p-5">
                <h2 className="font-semibold">{w.test}</h2>
                <p className="text-sm text-muted-foreground">
                  {w.questionCount}
                </p>
                {q.data.exam && (
                  <p className="text-sm text-muted-foreground">
                    {w.remaining}: {q.data.exam.remaining}
                  </p>
                )}
                {error && (
                  <p role="alert" className="text-destructive">
                    {error}
                  </p>
                )}
                {q.data.exam ? (
                  <Button
                    disabled={
                      busy ||
                      (q.data.exam.remaining === 0 &&
                        !q.data.exam.activeAttemptId)
                    }
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        const s = await studyApi<StudySession>(
                          subject,
                          scoped(gradeId, bookId) +
                            `/exams/${q.data!.exam!.id}/start`,
                          {},
                        );
                        navigate(
                          studyPath(subject, gradeId, bookId) +
                            `/attempts/${s.id}`,
                        );
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {w.startTest}
                  </Button>
                ) : (
                  <p>{w.testSoon}</p>
                )}
              </CardContent>
            </Card>
          </>
        )
      )}
    </Frame>
  );
}
function Attempt({ subject }: { subject: StudySubject }) {
  const { gradeId, bookId, attemptId } = useParams();
  const w = useStudyWords();
  const cache = useQueryClient();
  const path = scoped(gradeId, bookId) + `/attempts/${attemptId}`;
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const q = useQuery({
    queryKey: ["course", subject, gradeId, bookId, "attempt", attemptId],
    queryFn: () => studyApi<StudySession>(subject, path),
  });
  useEffect(() => setSelected(q.data?.answers ?? {}), [q.data?.id]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const base = studyPath(subject, gradeId, bookId);
  const back = q.data?.topicId
    ? base + "/topics/" + q.data.topicId
    : base + "/topics";
  const seconds = q.data
    ? Math.max(
        0,
        Math.ceil((new Date(q.data.expires_at).getTime() - now) / 1000),
      )
    : 0;
  async function finish() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await studyApi<StudySession>(subject, path + "/submit", {
        answers: selected,
      });
      cache.setQueryData(
        ["course", subject, gradeId, bookId, "attempt", attemptId],
        result,
      );
      await cache.invalidateQueries({ queryKey: ["course"] });
      await cache.invalidateQueries({ queryKey: ["my-certificates"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (q.data?.status === "in_progress" && seconds === 0 && !busy)
      void finish();
  }, [seconds, q.data?.status]);
  if (q.error) return <Failure error={q.error} back={back} />;
  return (
    <Frame
      title={q.data?.status === "in_progress" ? w.test : w.result}
      back={back}
    >
      {q.isLoading ? (
        <Loading />
      ) : (
        q.data && (
          <>
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            {q.data.status === "in_progress" ? (
              <>
                <p className="sticky top-16 z-10 rounded-xl border bg-card p-3 font-semibold tabular-nums">
                  {w.time}: {Math.floor(seconds / 60)}:
                  {String(seconds % 60).padStart(2, "0")}
                </p>
                <div className="space-y-4">
                  {q.data.questions.map((question, i) => (
                    <Card key={question.id}>
                      <CardContent className="space-y-3 p-4">
                        <div className="font-semibold">
                          {i + 1}. <RichContent content={question.text} />
                        </div>
                        {question.imageUrl && (
                          <img
                            src={question.imageUrl}
                            className="max-h-64 max-w-full rounded"
                            alt=""
                          />
                        )}
                        {question.options.map((option, index) => (
                          <label
                            key={index}
                            className="flex cursor-pointer items-center gap-3 rounded-lg border p-3"
                          >
                            <input
                              type="radio"
                              name={question.id}
                              checked={selected[question.id] === index}
                              disabled={busy || seconds === 0}
                              onChange={async () => {
                                const next = {
                                  ...selected,
                                  [question.id]: index,
                                };
                                setSelected(next);
                                setBusy(true);
                                setError("");
                                try {
                                  await studyApi(
                                    subject,
                                    path + "/answers",
                                    { answers: next },
                                    "PUT",
                                  );
                                } catch (e) {
                                  setError((e as Error).message);
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            />
                            <RichContent content={option} />
                          </label>
                        ))}
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Button
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(w.confirm)) void finish();
                  }}
                >
                  {w.finish}
                </Button>
              </>
            ) : (
              <Card>
                <CardContent className="space-y-4 p-5">
                  <GraduationCap className="h-10 w-10 text-primary" />
                  <h2 className="text-xl font-bold">
                    {w.score}: {q.data.score}/100
                  </h2>
                  <p>
                    {q.data.result?.policy === "passed"
                      ? w.passed
                      : q.data.result?.policy === "repeat"
                        ? w.repeat
                        : q.data.result?.policy === "review"
                          ? w.review
                          : w.pending}
                  </p>
                  {q.data.kind === "final" && q.data.result?.unlocked && (
                    <p>{w.nextUnlocked}</p>
                  )}
                  {q.data.kind === "final" && q.data.result?.certificate && (
                    <div className="space-y-2">
                      <p>{w.certificateEligible}</p>
                      <Link
                        className="block text-primary underline"
                        to="/certificates"
                      >
                        {w.certificateModule}
                      </Link>
                    </div>
                  )}
                  <Link
                    className="inline-block font-semibold text-primary underline"
                    to={back}
                  >
                    {w.studyAgain}
                  </Link>
                </CardContent>
              </Card>
            )}
          </>
        )
      )}
    </Frame>
  );
}
