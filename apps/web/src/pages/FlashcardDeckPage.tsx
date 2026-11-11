import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Heart, RotateCcw, Sparkles } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { EdtechError, EdtechLoading } from "../components/edtech/EdtechBits";
import {
  edtechRequest,
  useEdtechWords,
  useFlashcardDeck,
  type FlashcardRating,
  type FlashcardView,
} from "../lib/edtech";
import { cn } from "../lib/utils";

export function FlashcardDeckPage() {
  const { deckId = "" } = useParams();
  const w = useEdtechWords();
  const [dueOnly, setDueOnly] = useState(false);
  const [favorites, setFavorites] = useState(false);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const deck = useFlashcardDeck(deckId, dueOnly, favorites);
  const client = useQueryClient();

  const review = useMutation({
    mutationFn: ({ cardId, rating }: { cardId: string; rating: FlashcardRating }) =>
      edtechRequest<{ intervalDays: number; box: number; dueAt: string }>(`/flashcards/${cardId}/review`, {
        method: "POST",
        body: { rating },
      }),
    onSuccess: () => {
      setRevealed(false);
      setIndex((value) => value + 1);
      void client.invalidateQueries({ queryKey: ["edtech-deck"] });
      void client.invalidateQueries({ queryKey: ["edtech-decks"] });
      void client.invalidateQueries({ queryKey: ["edtech-dashboard"] });
      void client.invalidateQueries({ queryKey: ["edtech-missions"] });
    },
  });

  const favorite = useMutation({
    mutationFn: (cardId: string) =>
      edtechRequest<{ favorite: boolean }>(`/flashcards/${cardId}/favorite`, { method: "POST" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["edtech-deck"] });
      void client.invalidateQueries({ queryKey: ["edtech-decks"] });
    },
  });

  const cards = deck.data?.cards ?? [];
  const card: FlashcardView | undefined = useMemo(() => cards[index], [cards, index]);

  useEffect(() => {
    setIndex(0);
    setRevealed(false);
  }, [dueOnly, favorites, deckId]);

  if (deck.isLoading) return <EdtechLoading />;
  if (deck.isError || !deck.data) return <EdtechError onRetry={() => void deck.refetch()} />;

  const current = deck.data.deck;
  const done = !card;

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title={current.title}
        subtitle={`${current.cardCount} ${w.cards} · ${current.dueCount} ${w.due.toLowerCase()}`}
        backTo="/flashcards"
        actions={
          <Link to="/flashcards" className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted">
            {w.decks}
          </Link>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          aria-pressed={dueOnly}
          onClick={() => setDueOnly((value) => !value)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-semibold",
            dueOnly ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground",
          )}
        >
          {w.due}
        </button>
        <button
          type="button"
          aria-pressed={favorites}
          onClick={() => setFavorites((value) => !value)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-semibold",
            favorites ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground",
          )}
        >
          {w.favorites}
        </button>
      </div>

      {done ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <Sparkles className="h-7 w-7 text-gold-deep" />
          <p className="font-display text-lg font-extrabold">{cards.length === 0 ? w.noCards : w.saved}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIndex(0);
                setRevealed(false);
              }}
            >
              {w.review}
            </Button>
            <Link to="/flashcards">
              <Button variant="primary">{w.decks}</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {index + 1} / {cards.length}
            </span>
            <span className="flex items-center gap-2">
              {card!.box >= 3 ? <Badge variant="success">{w.mastered}</Badge> : <Badge variant="outline">{w.reviewed}: {card!.reviewCount}</Badge>}
              <button
                type="button"
                aria-label={card!.favorite ? w.unfavorite : w.favorite}
                aria-pressed={card!.favorite}
                onClick={() => favorite.mutate(card!.id)}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-full border transition-colors",
                  card!.favorite ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                <Heart className={cn("h-4 w-4", card!.favorite && "fill-current")} />
              </button>
            </span>
          </div>

          <Card className="flex min-h-[240px] flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{w.front}</p>
            <p className="font-display text-xl font-extrabold leading-snug">{card!.front}</p>
            {revealed ? (
              <div className="w-full space-y-2 border-t border-border pt-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{w.backSide}</p>
                <p className="text-base font-semibold">{card!.back}</p>
                {card!.explanation ? <p className="text-xs text-muted-foreground">{card!.explanation}</p> : null}
                {card!.example ? (
                  <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{card!.example}</p>
                ) : null}
              </div>
            ) : (
              <Button variant="outline" onClick={() => setRevealed(true)}>
                {w.showAnswer}
              </Button>
            )}
          </Card>

          {revealed ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  { rating: "again", label: w.again, tone: "border-destructive/40 text-destructive" },
                  { rating: "hard", label: w.hard, tone: "border-gold/50 text-gold-deep" },
                  { rating: "good", label: w.good, tone: "border-primary/40 text-primary" },
                  { rating: "easy", label: w.easy, tone: "border-success/40 text-success" },
                ] as const
              ).map((item) => (
                <button
                  key={item.rating}
                  type="button"
                  disabled={review.isPending}
                  onClick={() => review.mutate({ cardId: card!.id, rating: item.rating })}
                  className={cn("rounded-xl border-2 bg-card px-3 py-3 text-sm font-bold transition-colors hover:bg-muted disabled:opacity-50", item.tone)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<ChevronLeft className="h-4 w-4" />}
              disabled={index === 0}
              onClick={() => {
                setIndex((value) => Math.max(0, value - 1));
                setRevealed(false);
              }}
            >
              {w.back}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              rightIcon={<ChevronRight className="h-4 w-4" />}
              disabled={index >= cards.length - 1}
              onClick={() => {
                setIndex((value) => Math.min(cards.length - 1, value + 1));
                setRevealed(false);
              }}
            >
              {w.review}
            </Button>
          </div>
        </>
      )}

      {review.isError ? <EdtechError onRetry={() => review.reset()} /> : null}
      <p className="text-center text-[11px] text-muted-foreground">
        <RotateCcw className="mr-1 inline h-3 w-3" />
        {current.description}
      </p>
    </div>
  );
}
