import { Award, Lock, Sparkles } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { EdtechError, EdtechLoading, EdtechStat } from "../components/edtech/EdtechBits";
import { useAchievements, useEdtechWords } from "../lib/edtech";
import { cn } from "../lib/utils";

export function AchievementsPage() {
  const w = useEdtechWords();
  const achievements = useAchievements();

  if (achievements.isLoading) return <EdtechLoading />;
  if (achievements.isError || !achievements.data) return <EdtechError onRetry={() => void achievements.refetch()} />;

  const data = achievements.data;
  const pct = data.total > 0 ? Math.round((data.unlocked / data.total) * 100) : 0;

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader title={w.achievements} subtitle={`${data.unlocked} / ${data.total}`} backTo="/progress" />

      <div className="grid grid-cols-2 gap-3">
        <EdtechStat label={w.unlocked} value={data.unlocked} icon={<Award className="h-5 w-5" />} tone="gold" />
        <EdtechStat label={w.total} value={`${pct}%`} icon={<Sparkles className="h-5 w-5" />} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {data.achievements.map((achievement) => {
          const criteria = achievement.criteria as { type?: string; value?: number };
          return (
            <Card
              key={achievement.code}
              className={cn(
                "flex items-start gap-3 p-4",
                achievement.unlocked ? "border-gold/40 bg-gold/5" : "opacity-80",
              )}
            >
              <span
                className={cn(
                  "grid h-12 w-12 shrink-0 place-items-center rounded-full",
                  achievement.unlocked ? "bg-gold/20 text-gold-deep" : "bg-muted text-muted-foreground",
                )}
              >
                {achievement.unlocked ? <Award className="h-6 w-6" /> : <Lock className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{achievement.title}</p>
                  <Badge variant={achievement.unlocked ? "success" : "default"}>
                    {achievement.unlocked ? w.unlocked : w.locked}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{achievement.description}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                  {achievement.coinReward > 0 ? (
                    <span className="rounded-full bg-gold/15 px-2 py-0.5 font-bold text-gold-deep">
                      +{achievement.coinReward} coin
                    </span>
                  ) : null}
                  {criteria.type ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                      {criteria.type}: {criteria.value}
                    </span>
                  ) : null}
                  {achievement.awardedAt ? (
                    <span className="text-muted-foreground">{new Date(achievement.awardedAt).toLocaleDateString()}</span>
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
