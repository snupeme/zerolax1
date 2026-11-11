import type { QuestionPublic } from '@zerolax/shared';
import { Check } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { cn } from '../lib/utils';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

export function QuestionView({
  question,
  selectedOptionId,
  onSelect,
  disabled = false,
  saving = false,
}: {
  question: QuestionPublic;
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
  disabled?: boolean;
  saving?: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-widest text-primary">
          {t('common.question')} {question.position}
        </span>
        <span className={cn('text-xs text-muted-foreground', saving && 'animate-pulse')}>
          {saving ? t('common.saving') : t('iq.autoSaved')}
        </span>
      </div>

      <p className="mt-2 whitespace-pre-line text-base font-semibold leading-relaxed">{question.text}</p>

      {question.imageUrl ? (
        <img
          src={question.imageUrl}
          alt=""
          loading="lazy"
          className="mt-4 max-h-64 w-full rounded-xl border border-border object-contain"
        />
      ) : null}

      <p className="mb-2 mt-5 text-xs font-medium text-muted-foreground">{t('iq.selectAnswer')}</p>
      <div className="space-y-2">
        {question.options.map((option, index) => {
          const selected = option.id === selectedOptionId;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onSelect(option.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-70',
                selected
                  ? 'border-primary bg-primary/10 font-semibold text-primary'
                  : 'border-border bg-background hover:border-primary/40 hover:bg-muted/60',
              )}
            >
              <span
                className={cn(
                  'grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-xs font-bold',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground',
                )}
              >
                {selected ? <Check className="h-4 w-4" /> : OPTION_LETTERS[index] ?? index + 1}
              </span>
              <span className="min-w-0 flex-1 leading-snug">{option.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
