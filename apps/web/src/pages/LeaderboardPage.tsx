import { useState } from "react";
import { EyeOff, Trophy, TrendingUp } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { EdtechError, EdtechLoading, EdtechStat, SubjectPills } from "../components/edtech/EdtechBits";
import { useEdtechWords, useLeaderboard, type LeaderboardPeriod } from "../lib/edtech";
import { cn } from "../lib/utils";

export function LeaderboardPage() {
  const w = useEdtechWords();
  const [period, setPeriod] = useState<LeaderboardPeriod>("weekly");
  const [subject, setSubject] = useState("all");
  const board = useLeaderboard(period, subject);

  const periods: Array<{ value: LeaderboardPeriod; label: string }> = [
    { value: "weekly", label: w.weekly },
    { value: "monthly", label: w.monthly },
    { value: "all", label: w.allTime },
  ];

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader title={w.leaderboard} subtitle={`${w.participants}: ${board.data?.participants ?? 0}`} backTo="/progress" />

      <div className="flex gap-1.5 rounded-xl border border-border bg-card p-1">
        {periods.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={period === item.value}
            onClick={() => setPeriod(item.value)}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-colors",
              period === item.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <SubjectPills value={subject} onChange={setSubject} />

      {board.isLoading ? <EdtechLoading /> : null}
      {board.isError ? <EdtechError onRetry={() => void board.refetch()} /> : null}

      {board.data ? (
        <>
          {board.data.hidden ? (
            <div className="flex items-start gap-2 rounded-xl border border-gold/30 bg-gold/10 p-3 text-xs text-gold-deep">
              <EyeOff className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{w.hiddenNotice}</p>
            </div>
          ) : null}

          {board.data.currentUser ? (
            <Card className="border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground font-display font-extrabold">
                  {board.data.currentUser.rank ?? "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {board.data.currentUser.nickname} · {w.you}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {w.score}: {board.data.currentUser.score} · {w.questions}: {board.data.currentUser.questions}
                  </p>
                </div>
                <Badge variant={board.data.currentUser.growth >= 0 ? "success" : "destructive"}>
                  {board.data.currentUser.growth >= 0 ? "+" : ""}
                  {board.data.currentUser.growth}
                </Badge>
              </div>
            </Card>
          ) : null}

          <div className="grid grid-cols-3 gap-2">
            <EdtechStat label={w.rank} value={board.data.currentUser?.rank ?? "—"} icon={<Trophy className="h-5 w-5" />} tone="gold" />
            <EdtechStat label={w.score} value={board.data.currentUser?.score ?? 0} />
            <EdtechStat
              label={w.growth}
              value={`${(board.data.currentUser?.growth ?? 0) >= 0 ? "+" : ""}${board.data.currentUser?.growth ?? 0}`}
              icon={<TrendingUp className="h-5 w-5" />}
              tone="navy"
            />
          </div>

          <div className="space-y-1.5">
            {board.data.rows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{w.empty}</p>
            ) : null}
            {board.data.rows.map((row) => (
              <div
                key={row.userId}
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5",
                  row.isCurrentUser && "border-primary/40 bg-primary/5",
                )}
              >
                <span
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-extrabold",
                    row.rank === 1
                      ? "bg-gold text-surface-ink"
                      : row.rank === 2
                        ? "bg-muted text-foreground"
                        : row.rank === 3
                          ? "bg-gold/20 text-gold-deep"
                          : "bg-muted text-muted-foreground",
                  )}
                >
                  {row.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{row.nickname}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {row.questions} {w.questions.toLowerCase()} · {row.growth >= 0 ? "+" : ""}
                    {row.growth}
                  </p>
                </div>
                <span className="font-display text-sm font-extrabold text-primary">{row.score}</span>
              </div>
            ))}
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            {board.data.range.start} — {board.data.range.end}
          </p>
        </>
      ) : null}
    </div>
  );
}
