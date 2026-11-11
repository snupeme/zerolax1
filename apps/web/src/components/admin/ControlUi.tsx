import {
  useState,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { Button } from "../ui/button";
import { useControlWords, toast, uploadImage } from "../../lib/admin-control";
import { useLearningWords } from "../../lib/learning";
import { useI18n } from "../../i18n/I18nProvider";
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1 text-sm font-medium">
      <span>{label}</span>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ "aria-label"?: string }>, {
            "aria-label": label,
          })
        : children}
    </label>
  );
}
export const selectClass =
  "h-11 w-full rounded-lg border border-border bg-card px-3 text-sm";
export function DataTable({
  rows,
  onSelect,
}: {
  rows: Record<string, unknown>[];
  onSelect?: (row: Record<string, unknown>) => void;
}) {
  const w = useControlWords();
  const l = useLearningWords();
  const { language } = useI18n();
  const extra = {
    uz: {
      provider: "Provayder",
      currency: "Valyuta",
      amount_minor: "Summa (kichik birlik)",
      action: "Amal",
      details: "Tafsilotlar",
      row: "Qator",
      message: "Xabar",
      attempt_number: "Urinish",
      passed: "O‘tganlar",
      failed: "O‘tmaganlar",
      pass_rate: "O‘tish foizi",
      missed: "Xato javoblar",
      source: "Manba",
    },
    ru: {
      provider: "Провайдер",
      currency: "Валюта",
      amount_minor: "Сумма (младшие единицы)",
      action: "Действие",
      details: "Подробности",
      row: "Строка",
      message: "Сообщение",
      attempt_number: "Попытка",
      passed: "Сдали",
      failed: "Не сдали",
      pass_rate: "Процент сдачи",
      missed: "Ошибки",
      source: "Источник",
    },
    en: {
      provider: "Provider",
      currency: "Currency",
      amount_minor: "Amount (minor units)",
      action: "Action",
      details: "Details",
      row: "Row",
      message: "Message",
      attempt_number: "Attempt",
      passed: "Passed",
      failed: "Failed",
      pass_rate: "Pass rate",
      missed: "Missed answers",
      source: "Source",
    },
  }[language];
  const headings: Record<string, string> = {
    ...extra,
    id: "ID",
    user_id: w.users,
    verification_id: "ID",
    nickname: w.name,
    telegram_id: "Telegram ID",
    telegram_username: "Telegram",
    full_name: w.fullName,
    student_name: w.fullName,
    book_title: l.book,
    topic: l.topic,
    book: l.book,
    title: w.title,
    grade: w.grade,
    age: w.age,
    city: w.city,
    district: w.district,
    status: w.status,
    coins_balance: w.balance,
    balance_after: w.balance,
    registered_at: w.registered,
    completed_topics: w.progress,
    premium: w.premium,
    subject: w.subjects,
    exams: w.exams,
    average: w.average,
    average_score: w.average,
    users: w.users,
    score: l.score,
    text: l.question,
    question: l.question,
    options: l.options,
    correct: l.correct,
    selected: w.reply,
    explanation: l.explanation,
    attempts: w.exams,
    count: w.completed,
    amount: w.coins,
    type: w.status,
    description: w.description,
    starts_at: w.starts,
    expires_at: w.ends,
    created_at: w.registered,
    completed_at: w.completed,
    finished_at: w.completed,
    submitted_at: w.completed,
    started_at: w.starts,
    revoked_at: l.revoked,
    verified_at: w.revenue,
    body: w.note,
    admin: w.name,
    admin_email: w.email,
    entity_type: w.catalog,
    entity_id: "ID",
    phone: "Telefon",
    reason: l.reason,
    tags: "#",
    difficulty: w.exams,
    average_seconds: l.duration,
    seconds_spent: l.duration,
  };
  if (!rows.length)
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        {w.empty}
      </p>
    );
  const columns = Object.keys(rows[0]);
  const display = (v: unknown) =>
    v == null
      ? "—"
      : typeof v === "boolean"
        ? v
          ? "✓"
          : "—"
        : typeof v === "object"
          ? JSON.stringify(v)
          : String(v);
  return (
    <div className="max-w-full overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50">
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                className="whitespace-nowrap p-3 text-xs font-semibold"
              >
                {headings[c] ?? c.replaceAll("_", " ")}
              </th>
            ))}
            {onSelect && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={String(r.id ?? r.key ?? i)}
              className="border-t hover:bg-muted/30"
            >
              {columns.map((c) => (
                <td key={c} className="max-w-xs break-words p-3 align-top">
                  <span className="line-clamp-3" title={display(r[c])}>
                    {display(r[c])}
                  </span>
                </td>
              ))}
              {onSelect && (
                <td className="p-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onSelect(r)}
                  >
                    {w.load}
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Pager({
  offset,
  setOffset,
  hasMore = true,
}: {
  offset: number;
  setOffset: (n: number) => void;
  hasMore?: boolean;
}) {
  const w = useControlWords();
  return (
    <div className="flex items-center justify-between gap-3">
      <Button
        variant="outline"
        disabled={!offset}
        onClick={() => setOffset(Math.max(0, offset - 20))}
      >
        {w.back}
      </Button>
      <span className="text-xs text-muted-foreground">
        {offset + 1}–{offset + 20}
      </span>
      <Button
        variant="outline"
        disabled={!hasMore}
        onClick={() => setOffset(offset + 20)}
      >
        {w.next}
      </Button>
    </div>
  );
}
export function ImageUpload({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const w = useControlWords();
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      {value && (
        <img
          src={value}
          alt={w.preview}
          className="max-h-40 max-w-full rounded-lg object-contain"
        />
      )}
      <input
        aria-label={w.upload}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          try {
            onChange(await uploadImage(file));
          } catch (error) {
            toast((error as Error).message, true);
          } finally {
            setBusy(false);
          }
        }}
      />
      {busy && <p>…</p>}
    </div>
  );
}
export function MiniChart({
  rows,
  series,
}: {
  rows: Array<Record<string, unknown>>;
  series: Array<{ key: string; label: string }>;
}) {
  const [metric, setMetric] = useState(series[0]?.key ?? "");
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(1, ...rows.map((r) => Number(r[metric] ?? 0)));
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap gap-2">
        {series.map((s) => (
          <Button
            key={s.key}
            size="sm"
            variant={metric === s.key ? "primary" : "outline"}
            onClick={() => setMetric(s.key)}
          >
            {s.label}
          </Button>
        ))}
      </div>
      <div
        className="flex h-44 items-end gap-1"
        role="img"
        aria-label={series.find((s) => s.key === metric)?.label}
      >
        {rows.map((r, i) => (
          <button
            key={i}
            type="button"
            className="min-w-0 flex-1 rounded-t bg-primary/70 transition hover:bg-primary focus:bg-primary"
            style={{
              height: Math.max(2, (Number(r[metric] ?? 0) / max) * 100) + "%",
            }}
            aria-label={`${String(r.date)}: ${r[metric] ?? 0}`}
            title={`${String(r.date)}: ${r[metric] ?? 0}`}
            onClick={() => setSelected(i)}
          />
        ))}
      </div>
      <p className="min-h-5 text-xs text-muted-foreground">
        {selected === null
          ? `${String(rows[0]?.date ?? "").slice(0, 10)} — ${String(rows.at(-1)?.date ?? "").slice(0, 10)}`
          : `${String(rows[selected]?.date).slice(0, 10)} · ${rows[selected]?.[metric] ?? 0}`}
      </p>
    </section>
  );
}
