import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Award,
  Brain,
  CheckCircle2,
  GraduationCap,
  Lightbulb,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { formatDate, percentage } from "@zerolax/shared";
import { PageHeader } from "../components/PageHeader";
import { Card, CardContent } from "../components/ui/card";
import { ScoreRing } from "../components/ui/misc";
import { buttonClassName } from "../components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "../components/ui/feedback";
import { useI18n } from "../i18n/I18nProvider";
import { useHomeWords } from "../lib/home";
import { useStudyBack } from "../lib/study";
import { learningRequest } from "../lib/learning";
import { api } from "../lib/api";
import { errorKey } from "../lib/errors";
import { cn } from "../lib/utils";

type Recommendation = {
  key: string;
  text: string;
  to: string;
  cta: string;
  tone: "emerald" | "gold";
};

export function AnalysisPage() {
  const { t, language } = useI18n();
  const w = useHomeWords();
  const back = useStudyBack("/");

  const me = useQuery({ queryKey: ["me"], queryFn: api.user.me });
  const history = useQuery({ queryKey: ["history"], queryFn: api.user.history });
  const premium = useQuery({
    queryKey: ["learning-me"],
    queryFn: () => learningRequest<{ premium: boolean }>("/me"),
    retry: false,
  });

  if (me.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  if (me.isError) {
    return (
      <ErrorState
        title={t("common.errorTitle")}
        message={t(errorKey(me.error))}
        onRetry={() => void me.refetch()}
        retryLabel={t("common.retry")}
      />
    );
  }

  const stats = me.data!.stats;
  const completed = stats.iqCompleted + stats.entranceCompleted;
  const iqAccuracy =
    stats.iqQuestions > 0
      ? Math.round((stats.iqCorrect / stats.iqQuestions) * 100)
      : null;
  const entranceAccuracy =
    stats.entranceQuestions > 0
      ? Math.round((stats.entranceCorrect / stats.entranceQuestions) * 100)
      : null;
  const overall = percentage(
    stats.iqCorrect + stats.entranceCorrect,
    stats.iqQuestions + stats.entranceQuestions,
  );
  const hasData = stats.iqQuestions + stats.entranceQuestions > 0;

  const accuracyItems: Array<{
    key: string;
    label: string;
    value: number | null;
  }> = [
    { key: "iq", label: w.iqLabel, value: iqAccuracy },
    { key: "entrance", label: w.entranceLabel, value: entranceAccuracy },
  ];
  const ranked = accuracyItems
    .filter(
      (item): item is { key: string; label: string; value: number } =>
        item.value !== null,
    )
    .sort((a, b) => b.value - a.value);

  const strongest = ranked[0] ?? null;
  const weakest = ranked.length > 1 ? ranked[ranked.length - 1] : null;

  const recommendations: Recommendation[] = [];
  if (iqAccuracy === null || iqAccuracy < 60) {
    recommendations.push({
      key: "iq",
      text: w.recIq,
      to: "/iq",
      cta: w.goToTests,
      tone: "emerald",
    });
  }
  if (entranceAccuracy === null || entranceAccuracy < 60) {
    recommendations.push({
      key: "entrance",
      text: w.recEntrance,
      to: "/entrance",
      cta: w.goToTests,
      tone: "emerald",
    });
  }
  if (hasData && overall >= 80) {
    recommendations.push({
      key: "keep",
      text: w.recKeep,
      to: "/iq",
      cta: w.goToTests,
      tone: "gold",
    });
  } else if (hasData) {
    recommendations.push({
      key: "review",
      text: w.recReview,
      to: "/history",
      cta: w.goToHistory,
      tone: "gold",
    });
  }
  if (premium.data && !premium.data.premium) {
    recommendations.push({
      key: "premium",
      text: w.recPremium,
      to: "/learning",
      cta: w.goToPremium,
      tone: "gold",
    });
  }
  if (completed > 0) {
    recommendations.push({
      key: "certificate",
      text: w.recCertificate,
      to: "/certificates",
      cta: w.goToCertificates,
      tone: "emerald",
    });
  }

  const iqPoints = (history.data?.iq ?? [])
    .filter((item) => item.resultAvailable && item.totalCorrect !== null)
    .map((item) => ({
      key: `iq-${item.attemptId}`,
      date: item.testDate,
      percent: Math.round(((item.totalCorrect ?? 0) / item.totalQuestions) * 100),
    }));
  const entrancePoints = (history.data?.entrance ?? [])
    .filter((item) => item.percent !== null)
    .map((item) => ({
      key: `entrance-${item.attemptId}`,
      date: item.attemptDate,
      percent: Math.round(item.percent ?? 0),
    }));
  const trend = [...iqPoints, ...entrancePoints]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-6);

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader
        title={w.analysisTitle}
        subtitle={w.analysisSubtitle}
        onBack={back}
        backTo="/"
      />

      <p className="flex items-start gap-2 rounded-xl border border-primary/15 bg-primary/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        {w.analysisIntro}
      </p>

      {!hasData ? (
        <EmptyState
          icon={<Target className="h-5 w-5" />}
          title={w.analysisEmptyTitle}
          message={w.analysisEmptyText}
          action={
            <Link to="/iq" className={buttonClassName({ size: "sm" })}>
              {w.analysisStart}
            </Link>
          }
        />
      ) : (
        <>
          <Card className="overflow-hidden border-primary/15 shadow-soft">
            <CardContent className="flex flex-col items-center gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-center sm:text-left">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
                  {w.overallAccuracy}
                </p>
                <p className="mt-1 font-display text-3xl font-extrabold tracking-tight">
                  {overall}%
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {w.totalTests}: {completed}
                </p>
              </div>
              <ScoreRing percent={overall} size={112} label={w.accuracy} />
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <AccuracyCard
              icon={<Brain className="h-4 w-4" />}
              label={w.iqAccuracy}
              value={iqAccuracy}
              empty={w.noData}
            />
            <AccuracyCard
              icon={<GraduationCap className="h-4 w-4" />}
              label={w.entranceAccuracy}
              value={entranceAccuracy}
              empty={w.noData}
              tone="gold"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <StrengthCard
              title={w.strongest}
              name={strongest?.label}
              value={strongest?.value}
              empty={w.noData}
              positive
            />
            <StrengthCard
              title={w.weakest}
              name={weakest?.label}
              value={weakest?.value}
              empty={w.recommendationEmpty}
            />
          </div>

          <section>
            <h2 className="mb-2.5 flex items-center gap-2 font-display text-[13px] font-extrabold uppercase tracking-[0.14em]">
              <Lightbulb className="h-4 w-4 text-gold-deep" aria-hidden />
              {w.recommendations}
            </h2>
            <div className="space-y-2">
              {recommendations.map((item) => (
                <Link
                  key={item.key}
                  to={item.to}
                  className="pressable flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-soft transition-colors hover:border-primary/30"
                >
                  <span
                    className={cn(
                      "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
                      item.tone === "emerald"
                        ? "bg-primary/10 text-primary"
                        : "bg-gold/15 text-gold-deep",
                    )}
                  >
                    {item.tone === "emerald" ? (
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                    ) : (
                      <Award className="h-4 w-4" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 text-xs leading-relaxed">
                    {item.text}
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                    {item.cta}
                    <ArrowRight className="h-3 w-3" aria-hidden />
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {trend.length > 1 ? (
            <section>
              <h2 className="mb-2.5 flex items-center gap-2 font-display text-[13px] font-extrabold uppercase tracking-[0.14em]">
                <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
                {w.recentTrend}
              </h2>
              <Card>
                <CardContent className="space-y-2.5 p-4">
                  {trend.map((point) => (
                    <div key={point.key} className="flex items-center gap-2.5">
                      <span className="w-16 shrink-0 text-[10px] font-semibold text-muted-foreground">
                        {formatDate(point.date, language, { short: true })}
                      </span>
                      <div
                        role="progressbar"
                        aria-label={w.accuracy}
                        aria-valuenow={point.percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                      >
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            point.percent >= 60 ? "bg-primary" : "bg-gold-deep",
                          )}
                          style={{ width: `${point.percent}%` }}
                        />
                      </div>
                      <span className="w-9 shrink-0 text-right text-xs font-extrabold">
                        {point.percent}%
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          ) : null}
        </>
      )}

      <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
        {w.analysisDisclaimer}
      </p>
    </div>
  );
}

function AccuracyCard({
  icon,
  label,
  value,
  empty,
  tone = "emerald",
}: {
  icon: ReactNode;
  label: string;
  value: number | null;
  empty: string;
  tone?: "emerald" | "gold";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <span
        className={cn(
          "grid h-8 w-8 place-items-center rounded-lg",
          tone === "emerald"
            ? "bg-primary/10 text-primary"
            : "bg-gold/15 text-gold-deep",
        )}
      >
        {icon}
      </span>
      <p className="mt-2.5 font-display text-xl font-extrabold leading-none tracking-tight">
        {value === null ? "—" : `${value}%`}
      </p>
      <p className="mt-1.5 text-[10px] font-bold uppercase leading-tight tracking-wider text-muted-foreground">
        {label}
      </p>
      {value === null ? (
        <p className="mt-1 text-[10px] text-muted-foreground">{empty}</p>
      ) : null}
    </div>
  );
}

function StrengthCard({
  title,
  name,
  value,
  empty,
  positive = false,
}: {
  title: string;
  name?: string;
  value?: number;
  empty: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </p>
      {name ? (
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <p className="truncate font-display text-sm font-extrabold">{name}</p>
          <p
            className={cn(
              "shrink-0 text-sm font-extrabold",
              positive ? "text-primary" : "text-gold-deep",
            )}
          >
            {value}%
          </p>
        </div>
      ) : (
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {empty}
        </p>
      )}
    </div>
  );
}
