import { Link } from "react-router-dom";
import { Calculator, ChevronRight, Shapes } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { useHomeWords } from "../lib/home";
import { useStudyBack } from "../lib/study";
import { Card, CardContent } from "../components/ui/card";
import { cn } from "../lib/utils";

export function SubjectsPage() {
  const words = useHomeWords();
  const back = useStudyBack("/");

  const subjects = [
    {
      to: "/algebra",
      icon: Calculator,
      title: words.algebra,
      text: words.algebraDesc,
      tone: "emerald" as const,
    },
    {
      to: "/geometry",
      icon: Shapes,
      title: words.geometry,
      text: words.geometryDesc,
      tone: "navy" as const,
    },
  ];

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader
        title={words.subjectsPageTitle}
        subtitle={words.subjectsPageText}
        onBack={back}
        backTo="/"
      />

      <div>
        <h2 className="mb-2.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
          {words.chooseSubject}
        </h2>
        <div className="space-y-3">
          {subjects.map((subject) => (
            <Link
              key={subject.to}
              to={subject.to}
              className="pressable group block rounded-2xl focus-visible:outline focus-visible:outline-primary"
            >
              <Card className="overflow-hidden border-border/80 bg-card shadow-soft transition-colors group-hover:border-primary/35">
                <CardContent className="flex items-center gap-4 p-4 sm:p-5">
                  <span
                    className={cn(
                      "grid h-14 w-14 shrink-0 place-items-center rounded-xl",
                      subject.tone === "emerald"
                        ? "bg-primary/10 text-primary"
                        : "bg-navy/5 text-navy dark:bg-surface-ink/10 dark:text-surface-ink",
                    )}
                  >
                    <subject.icon className="h-6 w-6" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-display text-lg font-extrabold tracking-tight">
                        {subject.title}
                      </span>
                      <span className="rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                        {words.gradeRange}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      {subject.text}
                    </span>
                    <span className="mt-2.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                      {words.openGrades}
                      <ChevronRight
                        className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </span>
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
