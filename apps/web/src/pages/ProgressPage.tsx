import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  BarChart3,
  CalendarCheck,
  ChevronRight,
  Flame,
  Layers,
  ListChecks,
  NotebookPen,
  Trophy,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Progress } from "../components/ui/feedback";
import { EdtechError, EdtechLoading, EdtechStat, SectionTitle } from "../components/edtech/EdtechBits";
import { edtechRequest, useEdtechDashboard, useEdtechWords } from "../lib/edtech";
import { cn } from "../lib/utils";

const links = [
  { to: "/missions", key: "missions", icon: ListChecks, tone: "bg-primary/10 text-primary" },
  { to: "/leaderboard", key: "leaderboard", icon: Trophy, tone: "bg-gold/15 text-gold-deep" },
  { to: "/flashcards", key: "flashcards", icon: Layers, tone: "bg-navy/10 text-navy dark:text-surface-ink" },
  { to: "/mistakes", key: "mistakes", icon: NotebookPen, tone: "bg-destructive/10 text-destructive" },
  { to: "/achievements", key: "achievements", icon: Award, tone: "bg-primary/10 text-primary" },
  { to: "/reports", key: "reports", icon: CalendarCheck, tone: "bg-gold/15 text-gold-deep" },
  { to: "/analytics", key: "analytics", icon: BarChart3, tone: "bg-navy/10 text-navy dark:text-surface-ink" },
] as const;

export function ProgressPage() {
  const w = useEdtechWords();
  const dashboard = useEdtechDashboard();
  const client = useQueryClient();
  const privacy = useQuery({
    queryKey: ["edtech-privacy"],
    queryFn: () => edtechRequest<{ leaderboardVisible: boolean }>("/profile/privacy"),
  });
  const togglePrivacy = useMutation({
    mutationFn: (leaderboardVisible: boolean) =>
      edtechRequest<{ leaderboardVisible: boolean }>("/profile/privacy", {
        method: "PATCH",
        body: { leaderboardVisible },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["edtech-privacy"] });
      void client.invalidateQueries({ queryKey: ["edtech-dashboard"] });
      void client.invalidateQueries({ queryKey: ["edtech-leaderboard"] });
    },
  });

  if (dashboard.isLoading) return <EdtechLoading />;
  if (dashboard.isError || !dashboard.data) return <EdtechError onRetry={() => void dashboard.refetch()} />;

  const data = dashboard.data;
  const missionPct = data.missions.total > 0 ? (data.missions.completed / data.missions.total) * 100 : 0;
  const nextMilestone = data.streak.milestones.find((m) => !m.claimed);

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader title={w.title} subtitle={w.subtitle} backTo="/" />

      <Card className="overflow-hidden border-primary/15">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gold/15 text-gold-deep">
              <Flame className="h-7 w-7" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{w.streak}</p>
              <p className="font-display text-3xl font-extrabold leading-none">
                {data.streak.current} <span className="text-base font-bold text-muted-foreground">{w.streakDays}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {w.longest}: {data.streak.longest}
                {nextMilestone ? ` · ${w.nextMilestone}: ${nextMilestone.milestone} (+${nextMilestone.reward})` : ""}
              </p>
            </div>
          </div>
          <div className="min-w-[160px] space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span>{w.missions}</span>
              <span className="text-muted-foreground">
                {data.missions.completed}/{data.missions.total}
              </span>
            </div>
            <Progress value={missionPct} />
            <Link to="/missions" className="inline-flex items-center gap-0.5 pt-1 text-[11px] font-bold text-primary hover:underline">
              {w.go} <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </CardContent>
      </Card>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <EdtechStat label={w.accuracy} value={`${data.weeklyReport.accuracy}%`} hint={w.weekly} />
        <EdtechStat label={w.due} value={data.flashcards.dueNow} hint={`${data.flashcards.mastered} ${w.mastered.toLowerCase()}`} tone="gold" />
        <EdtechStat label={w.openMistakes} value={data.mistakes.open} hint={data.mistakes.weakestTopic ?? w.empty} tone="danger" />
        <EdtechStat
          label={w.achievements}
          value={`${data.achievements.unlocked}/${data.achievements.total}`}
          hint={w.unlocked}
          tone="navy"
        />
      </section>

      <section>
        <SectionTitle title={w.recommendations} />
        <div className="space-y-2">
          {data.recommendations.map((item) => (
            <Link
              key={item.key}
              to={item.href}
              className="pressable flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-soft transition-colors hover:border-primary/30"
            >
              <span
                className={cn(
                  "h-9 w-1.5 shrink-0 rounded-full",
                  item.tone === "danger" ? "bg-destructive" : item.tone === "gold" ? "bg-gold" : "bg-primary",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{item.title}</span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{item.reason}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle title={w.progress} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {links.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="pressable flex items-center gap-2.5 rounded-xl border border-border bg-card p-3 shadow-soft transition-colors hover:border-primary/30"
            >
              <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", item.tone)}>
                <item.icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">{w[item.key]}</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </section>

      {data.achievements.recent.length > 0 ? (
        <section>
          <SectionTitle title={w.achievements} />
          <div className="grid gap-2 sm:grid-cols-2">
            {data.achievements.recent.map((achievement) => (
              <Card key={achievement.code} className="flex items-center gap-3 p-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold/15 text-gold-deep">
                  <Award className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{achievement.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{achievement.description}</p>
                </div>
                {achievement.coinReward > 0 ? <Badge variant="warning">+{achievement.coinReward}</Badge> : null}
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionTitle title={w.privacy} />
        <Card className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{w.showInLeaderboard}</p>
            <p className="text-[11px] text-muted-foreground">{w.hiddenNotice}</p>
          </div>
          <Button
            variant={privacy.data?.leaderboardVisible === false ? "outline" : "primary"}
            size="sm"
            loading={togglePrivacy.isPending}
            disabled={privacy.isLoading}
            onClick={() => togglePrivacy.mutate(privacy.data?.leaderboardVisible === false)}
          >
            {privacy.data?.leaderboardVisible === false ? w.locked : w.active}
          </Button>
        </Card>
      </section>
    </div>
  );
}
