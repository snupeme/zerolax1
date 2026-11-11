import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Layers, Sparkles } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { EdtechError, EdtechLoading, EdtechStat, SubjectPills } from "../components/edtech/EdtechBits";
import { useEdtechWords, useFlashcardDecks, subjectLabel } from "../lib/edtech";
import { useI18n } from "../i18n/I18nProvider";
import { cn } from "../lib/utils";

export function FlashcardsPage() {
  const w = useEdtechWords();
  const { language } = useI18n();
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState<number | null>(null);
  const decks = useFlashcardDecks(subject, grade);

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader title={w.flashcards} subtitle={w.subtitle} backTo="/progress" />

      {decks.data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <EdtechStat label={w.cards} value={decks.data.stats.totalCards} icon={<Layers className="h-5 w-5" />} />
          <EdtechStat label={w.due} value={decks.data.stats.dueNow} tone="gold" />
          <EdtechStat label={w.mastered} value={decks.data.stats.mastered} tone="navy" />
          <EdtechStat label={w.favorites} value={decks.data.stats.favorites} tone="danger" />
        </div>
      ) : null}

      <div className="space-y-2">
        <SubjectPills value={subject || "all"} onChange={(value) => setSubject(value === "all" ? "" : value)} />
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setGrade(null)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold",
              grade === null ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground",
            )}
          >
            {w.allSubjects}
          </button>
          {[5, 6, 7, 8, 9, 10, 11].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setGrade(value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold",
                grade === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {decks.isLoading ? <EdtechLoading /> : null}
      {decks.isError ? <EdtechError onRetry={() => void decks.refetch()} /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {decks.data?.decks.map((deck) => (
          <Link
            key={deck.id}
            to={`/flashcards/${deck.id}`}
            className="pressable group flex min-w-0 items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-soft transition-colors hover:border-primary/30"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Layers className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate font-display text-sm font-extrabold">{deck.title}</span>
                <Badge variant="outline" className="shrink-0">{subjectLabel(deck.subject, language)}</Badge>
              </span>
              <span className="mt-1 block line-clamp-2 text-[11px] text-muted-foreground">{deck.description}</span>
              <span className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold">
                <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                  {deck.cardCount} {w.cards}
                </span>
                {deck.dueCount > 0 ? (
                  <span className="rounded-full bg-gold/15 px-2 py-0.5 text-gold-deep">
                    {deck.dueCount} {w.due.toLowerCase()}
                  </span>
                ) : null}
                {deck.masteredCount > 0 ? (
                  <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">
                    {deck.masteredCount} {w.mastered.toLowerCase()}
                  </span>
                ) : null}
              </span>
            </span>
            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>

      {decks.data && decks.data.decks.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <Sparkles className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{w.empty}</p>
        </Card>
      ) : null}
    </div>
  );
}
