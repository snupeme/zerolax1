import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Card } from "../ui/card";
import { ErrorState, InlineLoading } from "../ui/feedback";
import { useEdtechWords, subjectLabel } from "../../lib/edtech";
import { useI18n } from "../../i18n/I18nProvider";

export function EdtechStat({
  label,
  value,
  hint,
  icon,
  tone = "primary",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "primary" | "gold" | "navy" | "danger";
}) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    gold: "bg-gold/15 text-gold-deep",
    navy: "bg-navy/10 text-navy dark:text-surface-ink",
    danger: "bg-destructive/10 text-destructive",
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1 font-display text-2xl font-extrabold leading-none tracking-tight">{value}</p>
          {hint ? <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p> : null}
        </div>
        {icon ? <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", tones[tone])}>{icon}</span> : null}
      </div>
    </Card>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="font-display text-sm font-extrabold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {action}
    </div>
  );
}

export function EdtechError({ onRetry }: { onRetry?: () => void }) {
  const w = useEdtechWords();
  return <ErrorState title={w.error} onRetry={onRetry} retryLabel={w.retry} />;
}

export function EdtechLoading() {
  const w = useEdtechWords();
  return <InlineLoading label={w.loading} />;
}

export function SubjectPills({
  value,
  onChange,
  includeAll = true,
}: {
  value: string;
  onChange: (value: string) => void;
  includeAll?: boolean;
}) {
  const { language } = useI18n();
  const subjects = includeAll
    ? ["all", "algebra", "geometry", "dtm", "sat", "english"]
    : ["algebra", "geometry", "dtm", "sat", "english"];
  return (
    <div className="flex flex-wrap gap-1.5">
      {subjects.map((subject) => (
        <button
          key={subject}
          type="button"
          aria-pressed={value === subject}
          onClick={() => onChange(subject)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
            value === subject
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-muted",
          )}
        >
          {subjectLabel(subject, language)}
        </button>
      ))}
    </div>
  );
}

export function MetricBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
