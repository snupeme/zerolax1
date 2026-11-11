import { Edit3, ListChecks, Trash2 } from 'lucide-react';
import type { AdminTestQuestion, Language } from '@zerolax/shared';
import { useI18n } from '../../i18n/I18nProvider';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

const DIFFICULTY_KEY = {
  easy: 'difficulty.easy',
  medium: 'difficulty.medium',
  hard: 'difficulty.hard',
} as const;

function localized(language: Language, uz: string, ru: string, en: string): string {
  if (language === 'ru') return ru || uz;
  if (language === 'en') return en || uz;
  return uz;
}

export function QuestionList({
  questions,
  onEdit,
  onDelete,
  emptyLabel,
}: {
  questions: AdminTestQuestion[];
  onEdit: (question: AdminTestQuestion) => void;
  onDelete: (question: AdminTestQuestion) => void;
  emptyLabel: string;
}) {
  const { t, language } = useI18n();

  if (questions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/60 px-4 py-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {questions.map((question) => {
        const text = localized(language, question.textUz, question.textRu, question.textEn);
        const correctOption = question.options.find(
          (option) => option.position === question.correctOptionIndex + 1,
        );
        const correctText = correctOption
          ? localized(language, correctOption.textUz, correctOption.textRu, correctOption.textEn)
          : '';
        return (
          <div key={question.id} className="rounded-xl border border-border bg-card p-3.5">
            <div className="flex items-start gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                {question.position}
              </span>
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-line text-sm font-semibold leading-snug">{text}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="success">
                    {t('admin.correctAnswer')}: {correctText}
                  </Badge>
                  <Badge variant="outline">
                    {t(DIFFICULTY_KEY[question.difficulty])}
                  </Badge>
                  <Badge variant="warning">
                    {question.coins} {t('common.coins')}
                  </Badge>
                </div>
                {question.explanationUz || question.explanationRu || question.explanationEn ? (
                  <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                    {localized(
                      language,
                      question.explanationUz ?? '',
                      question.explanationRu ?? '',
                      question.explanationEn ?? '',
                    )}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onEdit(question)}
                  aria-label={t('admin.editQuestion')}
                >
                  <Edit3 className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => onDelete(question)}
                  aria-label={t('admin.deleteQuestion')}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        );
      })}

      <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
        <ListChecks className="h-3.5 w-3.5" />
        {t('admin.questionsCount', { count: questions.length })}
      </p>
    </div>
  );
}
