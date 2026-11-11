import { BarChart3, CalendarCheck, TrendingUp } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { EdtechError, EdtechLoading, EdtechStat, MetricBar, SectionTitle } from "../components/edtech/EdtechBits";
import { useEdtechWords, useWeeklyReport, subjectLabel } from "../lib/edtech";
import { useI18n } from "../i18n/I18nProvider";
import { cn } from "../lib/utils";

export function ReportsPage() {
  const w = useEdtechWords();
  const { language } = useI18n();
  const report = useWeeklyReport();

  if (report.isLoading) return <EdtechLoading />;
  if (report.isError || !report.data) return <EdtechError onRetry={() => void report.refetch()} />;

  const data = report.data;
  const maxDaily = Math.max(1, ...data.daily.map((day) => day.questions));

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader
        title={w.reports}
        subtitle={`${data.weekStart} — ${data.weekEnd}`}
        backTo="/progress"
        actions={
          <Badge variant={data.growth >= 0 ? "success" : "destructive"}>
            {data.growth >= 0 ? "+" : ""}
            {data.growth}%
          </Badge>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <EdtechStat label={w.accuracy} value={`${data.accuracy}%`} hint={`${data.correct}/${data.questions}`} icon={<BarChart3 className="h-5 w-5" />} />
        <EdtechStat label={w.daysActive} value={data.daysActive} icon={<CalendarCheck className="h-5 w-5" />} tone="gold" />
        <EdtechStat label={w.score} value={data.score} hint={`${w.growth}: ${data.previousScore}`} />
        <EdtechStat
          label={w.rank}
          value={data.rank ?? "—"}
          hint={data.rankChange === null ? w.empty : `${w.rankChange}: ${data.rankChange > 0 ? "+" : ""}${data.rankChange}`}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="navy"
        />
      </div>

      <section>
        <SectionTitle title={w.topics} />
        <Card className="p-4">
          {data.daily.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{w.empty}</p>
          ) : (
            <div className="flex h-36 items-end gap-1.5">
              {data.daily.map((day) => (
                <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <span className="text-[9px] font-bold text-muted-foreground">{day.questions}</span>
                  <div
                    className={cn("w-full rounded-t-md", day.correct === day.questions && day.questions > 0 ? "bg-success" : "bg-primary")}
                    style={{ height: `${Math.max(4, (day.questions / maxDaily) * 100)}%` }}
                    title={`${day.date}: ${day.correct}/${day.questions}`}
                  />
                  <span className="text-[9px] text-muted-foreground">{day.date.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Card className="space-y-3 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{w.questions}</p>
          <MetricBar label={w.topicsLearned} value={data.topicsLearned} max={Math.max(1, data.topicsLearned)} />
          <MetricBar label={w.flashcardsReviewed} value={data.flashcards} max={Math.max(1, data.flashcards)} />
          <MetricBar label={w.mistakes} value={data.mistakes} max={Math.max(1, data.mistakes)} />
          <MetricBar label={w.mistakesReviewed} value={data.mistakesReviewed} max={Math.max(1, data.mistakesReviewed)} />
        </Card>
        <Card className="space-y-3 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{w.subject}</p>
          {data.subjects.length === 0 ? <p className="text-sm text-muted-foreground">{w.empty}</p> : null}
          {data.subjects.map((subject) => (
            <MetricBar key={subject.subject} label={`${subjectLabel(subject.subject, language)} · ${subject.accuracy}%`} value={subject.correct} max={Math.max(1, subject.total)} />
          ))}
        </Card>
      </section>
    </div>
  );
}
