import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  defaultLearningSettings,
  evaluateLearningScore,
  type LearningSettings,
  type LearningBook,
  type LearningTopic,
  type LearningExam,
  type LearningCertificate,
} from "@zerolax/shared";
import {
  learningRequest,
  useLearningWords,
  downloadCertificate,
} from "../../lib/learning";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Link } from "react-router-dom";
import {control} from '../../lib/admin-control';
const call = <T,>(
  path: string,
  body?: unknown,
  method?: "GET" | "POST" | "PUT",
) => learningRequest<T>(path, body, method, true);
const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span>{label}</span>
      {children}
    </label>
  );
}
interface Question {
  id: string;
  text: string;
  options: string[];
  correct_index: number;
  explanation: string;
  published: boolean;
}
interface Subscription {
  id: string;
  user_id: string;
  source: string;
  starts_at: string;
  expires_at: string;
  revoked_at: string | null;
}
export function AdminLearningPage() {
  const w = useLearningWords();
  const initialUser=new URLSearchParams(window.location.search).get('userId')??'';
  const [tab, setTab] = useState(initialUser?'users':"content");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [bookId, setBookId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [book, setBook] = useState({
    title: "",
    subject: "algebra",
    grade: 5,
    position: 1,
    freeTopicLimit: 3,
    published: false,
  });
  const [topic, setTopic] = useState({
    title: "",
    content: "",
    position: 1,
    published: false,
  });
  const [editTopicId, setEditTopicId] = useState("");
  const [question, setQuestion] = useState({
    text: "",
    options: ["", "", "", ""],
    correctIndex: 0,
    explanation: "",
    published: true,
  });
  const [settings, setSettings] = useState<LearningSettings | null>(null);
  const [userId, setUserId] = useState(initialUser);
  const [loadedUser, setLoadedUser] = useState(initialUser);
  const [examId, setExamId] = useState("");
  const [reason, setReason] = useState("");
  const [starts, setStarts] = useState("");
  const [expires, setExpires] = useState("");
  const [offset, setOffset] = useState(0);
  const books = useQuery({
    queryKey: ["admin-learning-books"],
    queryFn: () => call<LearningBook[]>("/books"),
    enabled: tab === "content",
  });
  const catalog=useQuery({queryKey:['control-catalog'],queryFn:()=>control<{subjects:Array<{slug:string;title:string}>}>('/catalog'),enabled:tab==='content'});
  const detail = useQuery({
    queryKey: ["admin-learning-book", bookId],
    queryFn: () =>
      call<{ topics: LearningTopic[]; exams: LearningExam[] }>(
        `/books/${bookId}`,
      ),
    enabled: !!bookId && tab === "content",
  });
  const questions = useQuery({
    queryKey: ["admin-learning-questions", topicId, offset],
    queryFn: () =>
      call<Question[]>(`/topics/${topicId}/questions?offset=${offset}`),
    enabled: !!topicId && tab === "content",
  });
  const rules = useQuery({
    queryKey: ["admin-learning-settings"],
    queryFn: () => call<LearningSettings>("/settings"),
    enabled: tab === "settings",
  });
  const alerts = useQuery({
    queryKey: ["admin-learning-alerts"],
    queryFn: () => call<Array<{ exam_id: string; message: string }>>("/alerts"),
    enabled: tab === "content",
  });
  const subscriptions = useQuery({
    queryKey: ["admin-learning-subs", offset, loadedUser],
    queryFn: () =>
      call<Subscription[]>(
        `/subscriptions?offset=${offset}${loadedUser ? `&userId=${loadedUser}` : ""}`,
      ),
    enabled: tab === "subscriptions",
  });
  const certificates = useQuery({
    queryKey: ["admin-learning-certs", offset],
    queryFn: () =>
      call<Array<LearningCertificate & { user_id: string }>>(
        `/certificates?offset=${offset}`,
      ),
    enabled: tab === "certificates",
  });
  const payments = useQuery({
    queryKey: ["admin-learning-payments", offset],
    queryFn: () =>
      call<{ configured: boolean; plan: unknown; transactions: unknown[] }>(
        `/payments?offset=${offset}`,
      ),
    enabled: tab === "payments",
  });
  const student = useQuery({
    queryKey: ["admin-learning-user", loadedUser, offset],
    queryFn: () =>
      call<{
        attempts: Array<{
          id: string;
          exam_id: string;
          score: number;
          status: string;
          attempt_number: number;
        }>;
        progress: unknown[];
        certificates: LearningCertificate[];
        grants: Array<{
          id: string;
          reason: string;
          revoked_at: string | null;
        }>;
      }>(`/users/${loadedUser}?offset=${offset}`),
    enabled: tab === "users" && !!loadedUser,
  });
  const current = settings ?? rules.data ?? defaultLearningSettings;
  async function run(fn: () => Promise<unknown>) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await fn();
      setMessage(w.saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const errors = [
    books.error,
    detail.error,
    questions.error,
    rules.error,
    alerts.error,
    subscriptions.error,
    certificates.error,
    payments.error,
    student.error,
  ].filter(Boolean);
  function chooseBook(b: LearningBook) {
    setBookId(b.id);
    setBook({
      title: b.title,
      subject: b.subject,
      grade: b.grade,
      position: b.position,
      freeTopicLimit: b.free_topic_limit,
      published: b.published,
    });
    setTopicId("");
    setEditTopicId("");
    setOffset(0);
  }
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{w.learning}</h1>
      <nav className="flex flex-wrap gap-2">
        {(
          [
            "content",
            "settings",
            "subscriptions",
            "payments",
            "certificates",
            "users",
          ] as const
        ).map((t) => (
          <Button
            key={t}
            variant={tab === t ? "primary" : "outline"}
            onClick={() => {
              setTab(t);
              setOffset(0);
              setError("");
            }}
          >
            {w[t]}
          </Button>
        ))}
      </nav>
      {(error || errors.length > 0) && (
        <p role="alert" className="text-destructive">
          {error || errors[0]?.message}
        </p>
      )}
      {message && (
        <p role="status" className="text-primary">
          {message}
        </p>
      )}
      {tab === "settings" && (
        <form
          className="space-y-3 rounded-xl border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await call("/settings", current, "PUT");
              setSettings(null);
              await rules.refetch();
            });
          }}
        >
          {(
            [
              "repeatBelow",
              "reviewFrom",
              "unlockFrom",
              "certificateFrom",
              "topicQuestionCount",
              "maxAttempts",
            ] as const
          ).map((k) => (
            <Field key={k} label={w[k]}>
              <Input
                type="number"
                min={1}
                max={100}
                value={current[k]}
                onChange={(e) =>
                  setSettings({ ...current, [k]: Number(e.target.value) })
                }
              />
            </Field>
          ))}
          <Field label={w.borderlinePolicy}>
            <select
              className={fieldClass}
              value={current.borderlinePolicy}
              onChange={(e) =>
                setSettings({
                  ...current,
                  borderlinePolicy: e.target
                    .value as LearningSettings["borderlinePolicy"],
                })
              }
            >
              {(["pending", "repeat", "review"] as const).map((p) => (
                <option key={p} value={p}>
                  {w[p]}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={current.allowPassedRetake}
              onChange={(e) =>
                setSettings({ ...current, allowPassedRetake: e.target.checked })
              }
            />
            {w.allowPassedRetake}
          </label>
          <div className="flex flex-wrap gap-3 text-sm">
            {[39, 40, 49, 50, 70, 71, 79, 80, 100].map((score) => (
              <span key={score}>
                {score}:{" "}
                {
                  w[
                    evaluateLearningScore(score, current).policy as
                      "repeat" | "review" | "pending" | "passed"
                  ]
                }
              </span>
            ))}
          </div>
          <Button disabled={busy}>{w.save}</Button>
        </form>
      )}
      {tab === "content" && (
        <>
          {(alerts.data?.length ?? 0) > 0 && (
            <div className="rounded border border-gold p-3">
              <h2>{w.alerts}</h2>
              {alerts.data?.map((a) => (
                <p key={a.exam_id} className="break-all text-sm">
                  {a.exam_id}: {a.message}
                </p>
              ))}
            </div>
          )}
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="space-y-3">
              <h2 className="font-semibold">{w.books}</h2>
              {books.data?.map((b) => (
                <button
                  className={`block w-full rounded border p-3 text-left ${b.id === bookId ? "border-primary" : ""}`}
                  key={b.id}
                  onClick={() => chooseBook(b)}
                >
                  {b.title} · {b.grade} · {b.published ? "✓" : "—"}
                </button>
              ))}
              <form
                className="space-y-3 rounded border p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    const b = await call<LearningBook>(
                      bookId ? `/books/${bookId}` : "/books",
                      book,
                      bookId ? "PUT" : "POST",
                    );
                    chooseBook(b);
                    await books.refetch();
                  });
                }}
              >
                <Field label={w.title}>
                  <Input
                    required
                    value={book.title}
                    onChange={(e) =>
                      setBook({ ...book, title: e.target.value })
                    }
                  />
                </Field>
                <select
                  aria-label="Subject"
                  className={fieldClass}
                  value={book.subject}
                  onChange={(e) =>
                    setBook({
                      ...book,
                      subject: e.target.value,
                    })
                  }
                >
                  {(catalog.data?.subjects??[{slug:'algebra',title:'Algebra'},{slug:'geometry',title:'Geometriya'}]).map(s=><option key={s.slug} value={s.slug}>{s.title}</option>)}
                </select>
                {(["grade", "position", "freeTopicLimit"] as const).map((k) => (
                  <Field
                    key={k}
                    label={
                      k === "grade"
                        ? w.grade
                        : k === "position"
                          ? w.position
                          : w.free
                    }
                  >
                    <Input
                      type="number"
                      min={k === "freeTopicLimit" ? 0 : k === "grade" ? 5 : 1}
                      max={k === "grade" ? 11 : 1000}
                      value={book[k]}
                      onChange={(e) =>
                        setBook({ ...book, [k]: Number(e.target.value) })
                      }
                    />
                  </Field>
                ))}
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={book.published}
                    onChange={(e) =>
                      setBook({ ...book, published: e.target.checked })
                    }
                  />
                  {w.published}
                </label>
                <Button disabled={busy}>{w.save}</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setBookId("");
                    setBook({
                      ...book,
                      title: "",
                      position: book.position + 1,
                    });
                  }}
                >
                  {w.create}
                </Button>
              </form>
            </section>
            {bookId && (
              <section className="space-y-3">
                <h2 className="font-semibold">{w.content}</h2>
                {detail.data?.topics.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-2 rounded border p-2"
                  >
                    <button
                      className="text-left"
                      onClick={() => {
                        setEditTopicId(t.id);
                        setTopic({
                          title: t.title,
                          content: t.content ?? "",
                          position: t.position,
                          published: t.published,
                        });
                      }}
                    >
                      {t.position}. {t.title}
                    </button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTopicId(t.id);
                        setQuestionId("");
                        setOffset(0);
                      }}
                    >
                      {w.questions}
                    </Button>
                  </div>
                ))}
                <form
                  className="space-y-3 rounded border p-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await call(
                        editTopicId
                          ? `/topics/${editTopicId}`
                          : `/books/${bookId}/topics`,
                        topic,
                        editTopicId ? "PUT" : "POST",
                      );
                      await detail.refetch();
                    });
                  }}
                >
                  <Field label={w.title}>
                    <Input
                      required
                      value={topic.title}
                      onChange={(e) =>
                        setTopic({ ...topic, title: e.target.value })
                      }
                    />
                  </Field>
                  <Field label={w.position}>
                    <Input
                      type="number"
                      min={1}
                      value={topic.position}
                      onChange={(e) =>
                        setTopic({ ...topic, position: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label={w.body}>
                    <textarea
                      className={fieldClass}
                      rows={8}
                      value={topic.content}
                      onChange={(e) =>
                        setTopic({ ...topic, content: e.target.value })
                      }
                    />
                  </Field>
                  <label className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={topic.published}
                      onChange={(e) =>
                        setTopic({ ...topic, published: e.target.checked })
                      }
                    />
                    {w.published}
                  </label>
                  <Button disabled={busy}>{w.save}</Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditTopicId("");
                      setTopic({
                        title: "",
                        content: "",
                        position: topic.position + 1,
                        published: false,
                      });
                    }}
                  >
                    {w.create}
                  </Button>
                </form>
                {detail.data?.exams.map((exam) => (
                  <ExamRow
                    key={exam.id}
                    exam={exam}
                    busy={busy}
                    onSave={(duration, published) =>
                      void run(async () => {
                        await call(
                          `/exams/${exam.id}`,
                          { durationSeconds: duration, published },
                          "PUT",
                        );
                        await detail.refetch();
                      })
                    }
                  />
                ))}
              </section>
            )}
          </div>
          {topicId && (
            <section className="space-y-3 rounded-xl border p-4">
              <h2 className="font-semibold">
                {w.questions} ·{" "}
                {detail.data?.topics.find((t) => t.id === topicId)?.title}
              </h2>
              {questions.data?.map((q) => (
                <button
                  key={q.id}
                  className="block w-full rounded border p-3 text-left"
                  onClick={() => {
                    setQuestionId(q.id);
                    setQuestion({
                      text: q.text,
                      options: q.options,
                      correctIndex: q.correct_index,
                      explanation: q.explanation,
                      published: q.published,
                    });
                  }}
                >
                  {q.text}
                </button>
              ))}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={!offset}
                  onClick={() => setOffset(Math.max(0, offset - 30))}
                >
                  {w.back}
                </Button>
                <Button
                  variant="outline"
                  disabled={questions.data?.length !== 30}
                  onClick={() => setOffset(offset + 30)}
                >
                  {w.more}
                </Button>
              </div>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await call(
                      questionId
                        ? `/questions/${questionId}`
                        : `/topics/${topicId}/questions`,
                      question,
                      questionId ? "PUT" : "POST",
                    );
                    await questions.refetch();
                  });
                }}
              >
                <Field label={w.question}>
                  <textarea
                    required
                    className={fieldClass}
                    value={question.text}
                    onChange={(e) =>
                      setQuestion({ ...question, text: e.target.value })
                    }
                  />
                </Field>
                <Field label={w.options}>
                  <textarea
                    required
                    rows={4}
                    className={fieldClass}
                    value={question.options.join("\n")}
                    onChange={(e) =>
                      setQuestion({
                        ...question,
                        options: e.target.value.split("\n"),
                      })
                    }
                  />
                </Field>
                <Field label={w.correct}>
                  <Input
                    type="number"
                    min={1}
                    max={4}
                    value={question.correctIndex + 1}
                    onChange={(e) =>
                      setQuestion({
                        ...question,
                        correctIndex: Number(e.target.value) - 1,
                      })
                    }
                  />
                </Field>
                <Field label={w.explanation}>
                  <textarea
                    className={fieldClass}
                    value={question.explanation}
                    onChange={(e) =>
                      setQuestion({ ...question, explanation: e.target.value })
                    }
                  />
                </Field>
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={question.published}
                    onChange={(e) =>
                      setQuestion({ ...question, published: e.target.checked })
                    }
                  />
                  {w.published}
                </label>
                <Button disabled={busy}>{w.save}</Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => {
                    setQuestionId("");
                    setQuestion({
                      text: "",
                      options: ["", "", "", ""],
                      correctIndex: 0,
                      explanation: "",
                      published: true,
                    });
                  }}
                >
                  {w.create}
                </Button>
              </form>
            </section>
          )}
        </>
      )}
      {(tab === "subscriptions" || tab === "users") && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setLoadedUser(userId);
            setOffset(0);
          }}
        >
          <Field label={w.userId}>
            <Input
              required
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </Field>
          <Button>{w.load}</Button>
        </form>
      )}
      {tab === "subscriptions" && (
        <>
          <form
            className="space-y-3 rounded border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await call(`/users/${userId}/premium`, {
                  startsAt: new Date(starts).toISOString(),
                  expiresAt: new Date(expires).toISOString(),
                  reason,
                });
                await subscriptions.refetch();
              });
            }}
          >
            <Field label={w.userId}>
              <Input
                required
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              />
            </Field>
            <Field label={w.starts}>
              <Input
                required
                type="datetime-local"
                value={starts}
                onChange={(e) => setStarts(e.target.value)}
              />
            </Field>
            <Field label={w.expires}>
              <Input
                required
                type="datetime-local"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
            </Field>
            <Field label={w.reason}>
              <Input
                required
                minLength={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <Button disabled={busy}>{w.create}</Button>
          </form>
          {subscriptions.data?.map((s) => (
            <div key={s.id} className="space-y-2 rounded border p-4">
              <p className="break-all">
                {s.user_id} · {s.source}
              </p>
              <p>
                {new Date(s.starts_at).toLocaleString()} —{" "}
                {new Date(s.expires_at).toLocaleString()}
              </p>
              <Button
                variant="outline"
                disabled={busy || !!s.revoked_at}
                onClick={() => {
                  if (window.confirm(w.confirm))
                    void run(async () => {
                      await call(`/subscriptions/${s.id}/revoke`, {});
                      await subscriptions.refetch();
                    });
                }}
              >
                {w.revoke}
              </Button>
              {s.source === "admin" && (
                <Button
                  variant="outline"
                  disabled={busy || !expires || reason.length < 3}
                  onClick={() =>
                    void run(async () => {
                      await call(
                        `/subscriptions/${s.id}`,
                        { expiresAt: new Date(expires).toISOString(), reason },
                        "PUT",
                      );
                      await subscriptions.refetch();
                    })
                  }
                >
                  {w.extend}
                </Button>
              )}
            </div>
          ))}
        </>
      )}
      {tab === "users" && student.data && (
        <>
          <h2 className="font-semibold">{w.history}</h2>
          {student.data.attempts.map((a) => (
            <p key={a.id} className="break-all rounded border p-3">
              {a.exam_id} · #{a.attempt_number} · {a.status} ·{" "}
              {a.score ?? "…"}/100
            </p>
          ))}
          <p>
            {w.content}: {student.data.progress.length} ✓
          </p>
          <h2>{w.certificates}</h2>
          {student.data.certificates.map((c) => (
            <Link
              className="block text-primary underline"
              key={c.verification_id}
              to={`/certificates/${c.verification_id}`}
            >
              {c.book_title} · {c.score}
            </Link>
          ))}
          <form
            className="space-y-3 rounded border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await call(`/users/${loadedUser}/grants`, { examId, reason });
                await student.refetch();
              });
            }}
          >
            <Field label={w.examId}>
              <Input
                required
                value={examId}
                onChange={(e) => setExamId(e.target.value)}
              />
            </Field>
            <Field label={w.reason}>
              <Input
                required
                minLength={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <Button disabled={busy}>{w.grant}</Button>
          </form>
          {student.data.grants.map((g) => (
            <div key={g.id} className="flex items-center gap-3">
              <span>{g.reason}</span>
              <Button
                variant="outline"
                disabled={busy || !!g.revoked_at}
                onClick={() => {
                  if (window.confirm(w.confirm))
                    void run(async () => {
                      await call(`/grants/${g.id}/revoke`, {});
                      await student.refetch();
                    });
                }}
              >
                {w.revoke}
              </Button>
            </div>
          ))}
        </>
      )}
      {tab === "certificates" &&
        certificates.data?.map((c) => (
          <div key={c.verification_id} className="space-y-2 rounded border p-4">
            <p>
              {c.student_name} · {c.book_title} · {c.score}/100
            </p>
            <Link
              to={`/certificates/${c.verification_id}`}
              className="text-primary underline"
            >
              {w.verify}
            </Link>
            <Button
              variant="outline"
              disabled={busy || !!c.revoked_at}
              onClick={() =>
                void run(() => downloadCertificate(c.verification_id, true))
              }
            >
              {w.download}
            </Button>
            <Field label={w.reason}>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <Button
              variant="outline"
              disabled={busy || !!c.revoked_at || reason.length < 3}
              onClick={() => {
                if (window.confirm(w.confirm))
                  void run(async () => {
                    await call(`/certificates/${c.verification_id}/revoke`, {
                      reason,
                    });
                    await certificates.refetch();
                  });
              }}
            >
              {w.revoke}
            </Button>
          </div>
        ))}
      {tab === "payments" && (
        <>
          <p>{payments.data?.configured ? "✓" : w.notConfigured}</p>
          <pre className="overflow-x-auto rounded border p-4 text-xs">
            {JSON.stringify(payments.data?.plan, null, 2)}
          </pre>
          {payments.data?.transactions.map((p, i) => (
            <pre key={i} className="overflow-x-auto rounded border p-4 text-xs">
              {JSON.stringify(p, null, 2)}
            </pre>
          ))}
        </>
      )}
      {["payments", "certificates", "subscriptions", "users"].includes(tab) && (
        <div className="flex gap-3">
          <Button
            variant="outline"
            disabled={!offset}
            onClick={() => setOffset(Math.max(0, offset - 30))}
          >
            {w.back}
          </Button>
          <Button variant="outline" onClick={() => setOffset(offset + 30)}>
            {w.more}
          </Button>
        </div>
      )}
    </div>
  );
}
function ExamRow({
  exam,
  busy,
  onSave,
}: {
  exam: LearningExam;
  busy: boolean;
  onSave: (duration: number, published: boolean) => void;
}) {
  const w = useLearningWords();
  const [duration, setDuration] = useState(exam.duration_seconds);
  const [published, setPublished] = useState(exam.published);
  return (
    <form
      className="space-y-2 rounded border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(duration, published);
      }}
    >
      <h3>
        {w[exam.kind]} {exam.block_number ?? ""}
      </h3>
      <p className="break-all text-xs">{exam.id}</p>
      <Field label={w.duration}>
        <Input
          type="number"
          min={60}
          max={14400}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
        />
      </Field>
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={published}
          onChange={(e) => setPublished(e.target.checked)}
        />
        {w.published}
      </label>
      <Button size="sm" disabled={busy}>
        {w.save}
      </Button>
    </form>
  );
}
