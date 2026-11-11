import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import {
  Brain,
  Coins,
  GraduationCap,
  Trophy,
} from "lucide-react";
import { formatDate, percentage } from "@zerolax/shared";
import { BannerStrip } from "../components/BannerStrip";
import { useI18n } from "../i18n/I18nProvider";
import { api } from "../lib/api";
import { learningRequest } from "../lib/learning";
import { useHomeWords } from "../lib/home";
import { errorKey } from "../lib/errors";
import {
  FeatureCards,
  HomeHeader,
  ExamsBanner,
  PremiumBanner,
  QuickAccess,
  ResultRow,
  SectionHeading,
  SubjectsGrid,
} from "../components/home/HomeSections";
import { EmptyState, ErrorState, Skeleton } from "../components/ui/feedback";

export function HomePage() {
  const { t, language } = useI18n();
  const words = useHomeWords();

  const me = useQuery({ queryKey: ["me"], queryFn: api.user.me });
  const premium = useQuery({
    queryKey: ["learning-me"],
    queryFn: () => learningRequest<{ premium: boolean }>("/me"),
    retry: false,
    staleTime: 60_000,
  });

  if (me.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
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

  const data = me.data!;
  const stats = data.stats;
  const profile = data.profile;
  const name = profile.nickname;
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? words.morning : hour < 18 ? words.day : words.evening;

  const recent = [
    ...data.recentIq.map((item) => ({
      key: `iq-${item.attemptId}`,
      date: item.testDate,
      to:
        item.status === "in_progress"
          ? `/iq/play/${item.testId}`
          : item.resultAvailable
            ? `/iq/result/${item.testId}`
            : "/history",
      icon: <Brain className="h-4 w-4" />,
      iconClass: "bg-primary/10 text-primary",
      title: item.title,
      subtitle: formatDate(item.testDate, language, { short: true }),
      value:
        item.resultAvailable && item.totalCorrect !== null
          ? `${item.totalCorrect}/${item.totalQuestions}`
          : item.status === "in_progress"
            ? t("iq.resume")
            : words.pending,
    })),
    ...data.recentEntrance.map((item) => ({
      key: `entrance-${item.attemptId}`,
      date: item.attemptDate,
      to:
        item.status === "in_progress"
          ? "/entrance"
          : `/entrance/result/${item.attemptId}`,
      icon: <GraduationCap className="h-4 w-4" />,
      iconClass: "bg-gold/15 text-gold-deep",
      title: item.testTitle,
      subtitle: formatDate(item.attemptDate, language, { short: true }),
      value:
        item.status === "in_progress"
          ? t("entrance.resume")
          : item.percent !== null
            ? `${item.percent}%`
            : words.pending,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 4);

  const accuracy = percentage(
    stats.iqCorrect + stats.entranceCorrect,
    stats.iqQuestions + stats.entranceQuestions,
  );

  return (
    <div className="animate-fade-in space-y-6 pb-2">
      <HomeHeader
        name={name}
        avatarUrl={profile.avatarUrl}
        coins={profile.coinsBalance}
        greeting={greeting}
        words={words}
      />

      <PremiumBanner premium={premium.data?.premium === true} words={words} />

      <ExamsBanner />

      <QuickAccess words={words} />

      <section>
        <SectionHeading
          title={words.subjectsTitle}
          subtitle={words.subjectsSubtitle}
          action={
            <Link
              to="/subjects"
              className="inline-flex items-center gap-0.5 text-[11px] font-bold text-primary hover:underline"
            >
              {words.subjectsAll}
            </Link>
          }
        />
        <SubjectsGrid words={words} />
      </section>

      <FeatureCards words={words} />

      <section className="grid grid-cols-3 gap-2">
        <MiniStat
          label={words.completed}
          value={stats.iqCompleted + stats.entranceCompleted}
        />
        <MiniStat label={words.accuracy} value={`${accuracy}%`} />
        <MiniStat
          label={t("common.earned")}
          value={stats.coinsEarned}
          icon={<Coins className="h-3.5 w-3.5 text-gold-deep" aria-hidden />}
        />
      </section>

      <section>
        <SectionHeading
          title={words.resultsTitle}
          action={
            <Link
              to="/history"
              className="inline-flex items-center gap-0.5 text-[11px] font-bold text-primary hover:underline"
            >
              {words.resultsAll}
            </Link>
          }
        />
        {recent.length === 0 ? (
          <EmptyState
            icon={<Trophy className="h-5 w-5" />}
            title={words.noResults}
            message={t("home.dailyIqReady")}
          />
        ) : (
          <div className="space-y-2">
            {recent.map((item) => (
              <ResultRow
                key={item.key}
                to={item.to}
                icon={item.icon}
                iconClass={item.iconClass}
                title={item.title}
                subtitle={item.subtitle}
                value={item.value}
              />
            ))}
          </div>
        )}
      </section>

      {stats.achievements.length > 0 ? (
        <section>
          <SectionHeading title={words.achievementsTitle} />
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {stats.achievements.map((achievement) => (
              <div
                key={achievement.code}
                className="flex min-w-[150px] flex-col gap-1 rounded-xl border border-border bg-card p-3 shadow-soft"
              >
                <span className="text-xl" aria-hidden>
                  {achievement.icon}
                </span>
                <p className="text-xs font-semibold leading-tight">
                  {achievement.title}
                </p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {achievement.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <BannerStrip />
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-2.5 py-3 text-center shadow-soft">
      <p className="flex items-center justify-center gap-1 font-display text-lg font-extrabold leading-none tracking-tight">
        {icon}
        {value}
      </p>
      <p className="mt-1.5 text-[9px] font-bold uppercase leading-tight tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
