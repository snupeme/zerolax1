import { Flame, Gift, Target } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { Progress } from "../components/ui/feedback";
import { EdtechError, EdtechLoading, EdtechStat, SectionTitle } from "../components/edtech/EdtechBits";
import { useEdtechWords, useMissions, useStreak } from "../lib/edtech";
import { cn } from "../lib/utils";

export function MissionsPage() {
  const w = useEdtechWords();
  const missions = useMissions();
  const streak = useStreak();

  if (missions.isLoading) return <EdtechLoading />;
  if (missions.isError || !missions.data) return <EdtechError onRetry={() => void missions.refetch()} />;

  const data = missions.data;
  const pct = data.total > 0 ? (data.completed / data.total) * 100 : 0;

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader title={w.missions} subtitle={`${w.today} · ${data.date}`} backTo="/progress" />

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
              <Target className="h-6 w-6" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{w.today}</p>
              <p className="font-display text-2xl font-extrabold leading-none">
                {data.completed}/{data.total}
              </p>
            </div>
          </div>
          <Badge variant={data.completed === data.total ? "success" : "primary"}>
            {data.completed === data.total ? w.unlocked : `${Math.round(pct)}%`}
          </Badge>
        </div>
        <Progress className="mt-4" value={pct} />
      </Card>

      <section className="space-y-2.5">
        <SectionTitle title={w.missions} />
        {data.missions.map((mission) => {
          const value = Math.min(100, Math.round((mission.progress / Math.max(1, mission.target)) * 100));
          return (
            <Card key={mission.id} className={cn("p-4", mission.completed && "border-primary/30")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{mission.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{mission.description}</p>
                </div>
                <Badge variant={mission.completed ? "success" : "default"}>
                  {mission.completed ? w.claimed : `${mission.progress}/${mission.target}`}
                </Badge>
              </div>
              <Progress className="mt-3" value={value} barClassName={mission.completed ? "bg-success" : undefined} />
              {mission.rewardCoins > 0 ? (
                <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-gold-deep">
                  <Gift className="h-3.5 w-3.5" /> +{mission.rewardCoins} coin
                </p>
              ) : null}
            </Card>
          );
        })}
      </section>

      {streak.data ? (
        <section>
          <SectionTitle title={w.streak} />
          <div className="mb-3 grid grid-cols-2 gap-3">
            <EdtechStat
              label={w.streak}
              value={`${streak.data.current} ${w.streakDays}`}
              hint={`${w.longest}: ${streak.data.longest}`}
              icon={<Flame className="h-5 w-5" />}
              tone="gold"
            />
            <EdtechStat
              label={w.nextMilestone}
              value={streak.data.nextMilestone ?? "—"}
              hint={streak.data.nextMilestone ? `${w.reward}: +coin` : w.unlocked}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {streak.data.milestones.map((milestone) => (
              <div
                key={milestone.milestone}
                className={cn(
                  "rounded-xl border p-3 text-center",
                  milestone.claimed
                    ? "border-success/40 bg-success/5"
                    : milestone.reached
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-card",
                )}
              >
                <p className="font-display text-lg font-extrabold">{milestone.milestone}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{w.streakDays}</p>
                <p className="mt-1 text-[10px] font-bold text-gold-deep">+{milestone.reward}</p>
                <p className="mt-0.5 text-[9px] text-muted-foreground">{milestone.claimed ? w.claimed : milestone.reached ? w.review : w.locked}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
