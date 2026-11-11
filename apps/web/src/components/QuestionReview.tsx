import type { QuestionResult } from '@zerolax/shared';
import { Check, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { CoinAmount } from './ui/misc';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';

export function QuestionReview({ questions }: { questions: QuestionResult[] }) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      {questions.map((question) => {
        const selected = question.selectedOptionId;
        return (
          <div key={question.id} className="rounded-xl border border-border bg-card p-4 shadow-soft">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted text-xs font-bold">
                  {question.position}
                </span>
                <p className="text-sm font-semibold leading-snug">{question.text}</p>
              </div>
              {selected ? (
                <Badge variant={question.isCorrect ? 'success' : 'destructive'} className="shrink-0">
                  {question.isCorrect ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                  {question.isCorrect ? t('common.correct') : t('common.incorrect')}
                </Badge>
              ) : (
                <Badge variant="warning" className="shrink-0">
                  {t('iq.notAnswered')}
                </Badge>
              )}
            </div>

            {question.imageUrl ? (
              <img
                src={question.imageUrl}
                alt=""
                loading="lazy"
                className="mb-3 max-h-56 w-full rounded-lg border border-border object-contain"
              />
            ) : null}

            <div className="space-y-1.5">
              {question.options.map((option) => {
                const isCorrect = option.id === question.correctOptionId;
                const isSelected = option.id === selected;
                return (
                  <div
                    key={option.id}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm',
                      isCorrect
                        ? 'border-success/40 bg-success/10 font-medium text-success'
                        : isSelected
                          ? 'border-destructive/40 bg-destructive/10 text-destructive'
                          : 'border-border bg-background text-muted-foreground',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {isCorrect ? (
                        <Check className="h-4 w-4 shrink-0" />
                      ) : isSelected ? (
                        <X className="h-4 w-4 shrink-0" />
                      ) : (
                        <span className="h-4 w-4 shrink-0 rounded-full border border-border" />
                      )}
                      {option.text}
                    </span>
                    {isSelected ? (
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide opacity-70">
                        {t('iq.yourAnswer')}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {t('admin.coinsPerQuestion')}: <CoinAmount value={question.coins} className="text-xs" />
              </span>
            </div>

            {question.explanation ? (
              <div className="mt-2 rounded-lg bg-muted/70 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">{t('iq.explanation')}: </span>
                {question.explanation}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
