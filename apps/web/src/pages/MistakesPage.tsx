import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Lightbulb, NotebookPen, Search, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { EdtechError, EdtechLoading, EdtechStat, SectionTitle } from "../components/edtech/EdtechBits";
import {
  edtechRequest,
  useEdtechWords,
  useMistakeAnalysis,
  useMistakes,
  type MistakeView,
} from "../lib/edtech";
import { useI18n } from "../i18n/I18nProvider";
import { subjectLabel } from "../lib/edtech";
import { cn } from "../lib/utils";

interface ReviewResult {
  correct: boolean;
  correctIndex: number;
  explanation: string;
  resolved: boolean;
}

export function MistakesPage() {
  const w = useEdtechWords();
  const { language } = useI18n();
  const [subject, setSubject] = useState("");
  const [resolved, setResolved] = useState("");
  const [search, setSearch] = useState("");
  const mistakes = useMistakes({ subject, resolved, search });
  const analysis = useMistakeAnalysis();

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader title={w.mistakes} subtitle={w.subtitle} backTo="/progress" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <EdtechStat label={w.openMistakes} value={mistakes.data?.open ?? 0} icon={<NotebookPen className="h-5 w-5" />} tone="danger" />
        <EdtechStat label={w.total} value={mistakes.data?.total ?? 0} />
        <EdtechStat label={w.weakness} value={analysis.data?.weakestSubject ? subjectLabel(analysis.data.weakestSubject, language) : "—"} tone="gold" />
        <EdtechStat label={w.advice} value={analysis.data?.topics[0]?.wrong ?? 0} hint={analysis.data?.weakestTopic ?? w.empty} tone="navy" />
      </div>

      {analysis.data?.advice ? (
        <div className="flex items-start gap-2 rounded-xl border border-gold/30 bg-gold/10 p-3 text-xs text-gold-deep">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{analysis.data.advice[language]}</p>
        </div>
      ) : null}

      {analysis.data && analysis.data.topics.length > 0 ? (
        <section>
          <SectionTitle title={w.weakness} />
          <div className="flex flex-wrap gap-1.5">
            {analysis.data.topics.slice(0, 8).map((topic) => (
              <button
                key={`${topic.subject}-${topic.topic}`}
                type="button"
                onClick={() => {
                  setSubject(topic.subject);
                  setSearch(topic.topic);
                }}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:border-destructive/40 hover:text-destructive"
              >
                {topic.topic} · {topic.wrong}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={w.search}
            aria-label={w.search}
            className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {[
            { value: "", label: w.allMistakes },
            { value: "false", label: w.openMistakes },
            { value: "true", label: w.resolved },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={resolved === item.value}
              onClick={() => setResolved(item.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold",
                resolved === item.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
          {["", "algebra", "geometry", "iq", "games", "entrance"].map((value) => (
            <button
              key={value || "all-subjects"}
              type="button"
              aria-pressed={subject === value}
              onClick={() => setSubject(value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold",
                subject === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground",
              )}
            >
              {value ? subjectLabel(value, language) : w.allSubjects}
            </button>
          ))}
        </div>
      </div>

      {mistakes.isLoading ? <EdtechLoading /> : null}
      {mistakes.isError ? <EdtechError onRetry={() => void mistakes.refetch()} /> : null}

      <div className="space-y-2.5">
        {mistakes.data?.mistakes.map((mistake) => <MistakeCard key={mistake.id} mistake={mistake} />)}
        {mistakes.data && mistakes.data.mistakes.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">{w.noMistakes}</Card>
        ) : null}
      </div>
    </div>
  );
}

function MistakeCard({ mistake }: { mistake: MistakeView }) {
  const w = useEdtechWords();
  const { language } = useI18n();
  const client = useQueryClient();
  const [result, setResult] = useState<ReviewResult | null>(null);
  const review = useMutation({
    mutationFn: (selectedIndex: number) =>
      edtechRequest<ReviewResult>(`/mistakes/${mistake.id}/review`, { method: "POST", body: { selectedIndex } }),
    onSuccess: (data) => {
      setResult(data);
      void client.invalidateQueries({ queryKey: ["edtech-mistakes"] });
      void client.invalidateQueries({ queryKey: ["edtech-mistake-analysis"] });
      void client.invalidateQueries({ queryKey: ["edtech-dashboard"] });
    },
  });

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={mistake.resolved ? "success" : "destructive"}>
          {mistake.resolved ? w.resolved : w.openMistakes}
        </Badge>
        <Badge variant="outline">{subjectLabel(mistake.subject, language)}</Badge>
        {mistake.topic ? <span className="truncate text-[11px] text-muted-foreground">{mistake.topic}</span> : null}
        <span className="ml-auto text-[11px] font-semibold text-destructive">
          {mistake.timesWrong} {w.wrongTimes}
        </span>
      </div>
      <p className="font-display text-sm font-extrabold leading-snug">{mistake.question.text}</p>
      <div className="grid gap-1.5">
        {mistake.question.options.map((option, index) => {
          const isCorrect = result ? index === result.correctIndex : false;
          const isChosenWrong = result && !result.correct && mistake.question.options[index] === mistake.selectedAnswer;
          return (
            <button
              key={`${mistake.id}-${index}`}
              type="button"
              disabled={review.isPending}
              onClick={() => review.mutate(index)}
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                isCorrect
                  ? "border-success/50 bg-success/10 text-success"
                  : isChosenWrong
                    ? "border-destructive/50 bg-destructive/10 text-destructive"
                    : "border-border bg-background hover:bg-muted",
              )}
            >
              <span>{option}</span>
              {isCorrect ? <Check className="h-4 w-4 shrink-0" /> : null}
              {isChosenWrong ? <X className="h-4 w-4 shrink-0" /> : null}
            </button>
          );
        })}
      </div>
      {result ? (
        <div className="space-y-1 rounded-lg bg-muted px-3 py-2 text-[11px]">
          <p className="font-bold">
            {result.correct ? w.correct : w.incorrect} · {w.correctAnswer}: {mistake.question.options[result.correctIndex]}
          </p>
          {result.explanation ? <p className="text-muted-foreground">{result.explanation}</p> : null}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">{w.retryMistake}</p>
      )}
      {review.isError ? <p className="text-[11px] text-destructive">{w.error}</p> : null}
    </Card>
  );
}
