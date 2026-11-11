import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  control,
  useControlWords,
  toast,
  useUnsaved,
} from "../../lib/admin-control";
import { learningRequest } from "../../lib/learning";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { DataTable, Field, Pager } from "./ControlUi";
export function UserControlDetails({ userId }: { userId: string }) {
  const w = useControlWords();
  const [tab, setTab] = useState("personal");
  const [offset, setOffset] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  useUnsaved(!!draft);
  const [attempt, setAttempt] = useState<Record<string, unknown>[] | null>(
    null,
  );
  const me = useQuery({
    queryKey: ["control-permissions"],
    queryFn: () => control<{ permissions: string[] }>("/me"),
  });
  const can = (p: string) => me.data?.permissions.includes(p);
  const details = useQuery({
    queryKey: ["control-user-details", userId, offset],
    queryFn: () =>
      control<{
        personal: Record<string, unknown>;
        progress: Record<string, unknown>[];
        notes: Record<string, unknown>[];
        activity: Record<string, unknown>[];
        payments: Record<string, unknown>[] | null;
        subscriptions: Record<string, unknown>[] | null;
      }>(`/users/${userId}/details?offset=${offset}`),
  });
  const learning = useQuery({
    queryKey: ["control-user-learning", userId, offset],
    queryFn: () =>
      learningRequest<{
        attempts: Record<string, unknown>[];
        certificates: Record<string, unknown>[];
        grants: Record<string, unknown>[];
      }>(`/users/${userId}?offset=${offset}`, undefined, "GET", true),
  });
  const personal = draft ?? details.data?.personal ?? {};
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      toast(w.saved);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  const tabs = [
    { key: "personal", label: w.personal },
    { key: "progress", label: w.progress },
    { key: "algebra", label: w.algebra },
    { key: "geometry", label: w.geometry },
    { key: "history", label: w.history },
    { key: "certificates", label: w.certificates },
    { key: "subscriptions", label: w.subscriptions },
    { key: "payments", label: w.payments },
    { key: "notes", label: w.notes },
    { key: "activity", label: w.audit },
  ];
  const rows =
    tab === "history"
      ? learning.data?.attempts
      : tab === "certificates"
        ? learning.data?.certificates
        : tab === "progress"
          ? details.data?.progress
          : tab === "algebra" || tab === "geometry"
            ? details.data?.progress.filter((p) => p.subject === tab)
            : tab === "notes"
              ? details.data?.notes
              : tab === "activity"
                ? details.data?.activity
                : tab === "subscriptions"
                  ? details.data?.subscriptions
                  : tab === "payments"
                    ? details.data?.payments
                    : [];
  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      {(can("exams.write") || can("premium.write")) && (
        <Link
          className="text-primary underline"
          to={`/admin/learning?userId=${userId}`}
        >
          {w.exams} · {w.premium}
        </Link>
      )}
      <nav className="flex flex-wrap gap-2">
        {tabs
          .filter((t) => t.key !== "payments" || can("payments.read"))
          .filter((t) => t.key !== "subscriptions" || can("premium.read"))
          .map((t) => (
            <Button
              key={t.key}
              size="sm"
              variant={tab === t.key ? "primary" : "outline"}
              onClick={() => {
                setTab(t.key);
                setAttempt(null);
                setOffset(0);
              }}
            >
              {t.label}
            </Button>
          ))}
      </nav>
      {(details.error || learning.error) && (
        <p className="text-destructive">
          {details.error?.message ?? learning.error?.message}
        </p>
      )}
      {tab === "personal" ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await control(
                `/users/${userId}`,
                {
                  ...(can("users.private") ? { firstName: String(personal.first_name ?? ""), lastName: String(personal.last_name ?? "") } : {}),
                  age: personal.age == null ? null : Number(personal.age),
                  city: String(personal.city ?? ""),
                  district: String(personal.district ?? ""),
                  fullName: String(personal.full_name ?? ""),
                  grade: Number(personal.grade ?? 5),
                },
                "PATCH",
              );
              setDraft(null);
              await details.refetch();
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { key: "full_name", label: w.fullName },
              { key: "first_name", label: w.name },
              { key: "last_name", label: w.name },
              { key: "age", label: w.age },
              { key: "grade", label: w.grade },
              { key: "city", label: w.city },
              { key: "district", label: w.district },
            ].filter(f => can("users.private") || !["first_name","last_name"].includes(f.key)).map((f) => (
              <Field key={f.key} label={f.label}>
                <Input
                  disabled={!can("users.write")}
                  type={
                    f.key === "age" || f.key === "grade" ? "number" : "text"
                  }
                  value={String(personal[f.key] ?? "")}
                  onChange={(e) =>
                    setDraft({ ...personal, [f.key]: e.target.value || null })
                  }
                />
              </Field>
            ))}
          </div>
          {Boolean(personal.phone) && <p>{String(personal.phone)}</p>}
          {can("users.write") && (
            <div className="flex gap-2">
              <Button disabled={busy || !draft}>{w.save}</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDraft(null)}
              >
                {w.cancel}
              </Button>
            </div>
          )}
        </form>
      ) : (
        <DataTable
          rows={rows ?? []}
          onSelect={
            tab === "history" && can("exams.read")
              ? (r) =>
                  void run(async () => {
                    const response = await control<{
                      attempt: Record<string, unknown>;
                      questions: Record<string, unknown>[];
                    }>(`/attempts/${r.id}`);
                    setAttempt(
                      response.questions.map((q) => {
                        const snapshot = q.snapshot as {
                          text: string;
                          options: string[];
                          correctIndex: number;
                        };
                        const answers = response.attempt.answers as Record<
                          string,
                          number
                        >;
                        const selected = answers[String(q.question_id)];
                        return {
                          question: snapshot.text,
                          options: snapshot.options,
                          correct: snapshot.options[snapshot.correctIndex],
                          selected:
                            selected === undefined
                              ? "—"
                              : snapshot.options[selected],
                          result:
                            selected === snapshot.correctIndex ? "✓" : "×",
                        };
                      }),
                    );
                  })
              : undefined
          }
        />
      )}
      {attempt && <DataTable rows={attempt} />}
      {tab === "notes" && can("support.write") && (
        <form
          className="flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await control(`/users/${userId}/notes`, { body: note });
              setNote("");
              await details.refetch();
            });
          }}
        >
          <Input
            required
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label={w.note}
          />
          <Button disabled={busy}>{w.save}</Button>
        </form>
      )}
      {tab !== "personal" && (
        <Pager
          offset={offset}
          setOffset={setOffset}
          hasMore={rows?.length === 20}
        />
      )}
    </section>
  );
}
