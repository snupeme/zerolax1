import { BarChart3, BookOpen, CircleCheck, CircleAlert, CircleDot } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { EdtechError, EdtechLoading, EdtechStat, MetricBar, SectionTitle } from "../components/edtech/EdtechBits";
import { useEdtechWords, useLearningMap, subjectLabel } from "../lib/edtech";
import { useI18n } from "../i18n/I18nProvider";

const statusTone: Record<string, "success" | "warning" | "primary"> = {
  mastered: "success",
  needs_review: "warning",
  in_progress: "primary",
};

export function AnalyticsPage() {
  const w = useEdtechWords();
  const { language } = useI18n();
  const map = useLearningMap();

  if (map.isLoading) return <EdtechLoading />;
  if (map.isError || !map.data) return <EdtechError onRetry={() => void map.refetch()} />;

  const subjects = map.data.subjects;
  const totals = subjects.reduce(
    (acc, subject) => ({
      mastered: acc.mastered + subject.mastered,
      needsReview: acc.needsReview + subject.needsReview,
      inProgress: acc.inProgress + subject.inProgress,
    }),
    { mastered: 0, needsReview: 0, inProgress: 0 },
  );

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader title={w.analytics} subtitle={w.subtitle} backTo="/progress" />

      <div className="grid grid-cols-3 gap-3">
        <EdtechStat label={w.mastered} value={totals.mastered} icon={<CircleCheck className="h-5 w-5" />} tone="primary" />
        <EdtechStat label={w.needsReview} value={totals.needsReview} icon={<CircleAlert className="h-5 w-5" />} tone="gold" />
        <EdtechStat label={w.inProgress} value={totals.inProgress} icon={<CircleDot className="h-5 w-5" />} tone="navy" />
      </div>

      {subjects.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <BarChart3 className="h-7 w-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{w.noAnalytics}</p>
        </Card>
      ) : null}

      {subjects.map((subject) => (
        <section key={subject.subject}>
          <SectionTitle
            title={subjectLabel(subject.subject, language)}
            action={<Badge variant="outline">{subject.accuracy}% {w.accuracy.toLowerCase()}</Badge>}
          />
          <Card className="space-y-3 p-4">
            <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
              <div className="rounded-lg bg-primary/5 p-2">
                <p className="font-display text-base font-extrabold text-primary">{subject.mastered}</p>
                <p className="text-muted-foreground">{w.mastered}</p>
              </div>
              <div className="rounded-lg bg-gold/10 p-2">
                <p className="font-display text-base font-extrabold text-gold-deep">{subject.needsReview}</p>
                <p className="text-muted-foreground">{w.needsReview}</p>
              </div>
              <div className="rounded-lg bg-navy/5 p-2 dark:bg-surface-ink/10">
                <p className="font-display text-base font-extrabold">{subject.inProgress}</p>
                <p className="text-muted-foreground">{w.inProgress}</p>
              </div>
            </div>
            <MetricBar label={w.accuracy} value={subject.accuracy} max={100} />
            <div className="space-y-1.5 pt-1">
              {subject.topics.map((topic) => (
                <div key={topic.topicKey} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                  <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{topic.topic}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {topic.correct}/{topic.total} · {topic.attempts} ×
                    </p>
                  </div>
                  <Badge variant={statusTone[topic.status] ?? "primary"}>
                    {topic.status === "mastered" ? w.mastered : topic.status === "needs_review" ? w.needsReview : w.inProgress}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </section>
      ))}
    </div>
  );
}
