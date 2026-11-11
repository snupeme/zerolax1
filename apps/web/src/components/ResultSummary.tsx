import { Check, Coins, Minus, Target, X } from 'lucide-react';
import { formatDuration, percentage } from '@zerolax/shared';
import { useI18n } from '../i18n/I18nProvider';
import { ScoreRing, StatCard } from './ui/misc';

export function ResultSummary({
  correct,
  incorrect,
  unanswered,
  total,
  coins,
  timeSpentSeconds,
}: {
  correct: number;
  incorrect: number;
  unanswered: number;
  total: number;
  coins: number;
  timeSpentSeconds?: number;
}) {
  const { t, language } = useI18n();
  const percent = percentage(correct, total);

  return (
    <section className="space-y-4">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <ScoreRing percent={percent} label={t('common.percent')} />
        <div className="grid w-full grid-cols-2 gap-3 sm:max-w-md">
          <div className="rounded-xl bg-success/10 p-3 text-center">
            <p className="text-2xl font-bold text-success">{correct}</p>
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">{t('common.correct')}</p>
          </div>
          <div className="rounded-xl bg-destructive/10 p-3 text-center">
            <p className="text-2xl font-bold text-destructive">{incorrect}</p>
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">{t('common.incorrect')}</p>
          </div>
          <div className="rounded-xl bg-muted p-3 text-center">
            <p className="text-2xl font-bold">{total}</p>
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">{t('common.questions')}</p>
          </div>
          <div className="rounded-xl bg-gold/10 p-3 text-center">
            <p className="text-2xl font-bold text-gold-deep dark:text-gold-deep">+{coins}</p>
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">{t('common.coins')}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<Check className="h-[18px] w-[18px]" />}
          label={t('iq.totalCorrect')}
          value={correct}
          accent="success"
        />
        <StatCard
          icon={<X className="h-[18px] w-[18px]" />}
          label={t('iq.totalIncorrect')}
          value={incorrect}
          accent="primary"
        />
        <StatCard
          icon={<Minus className="h-[18px] w-[18px]" />}
          label={t('iq.unanswered')}
          value={unanswered}
        />
        <StatCard
          icon={<Coins className="h-[18px] w-[18px]" />}
          label={t('common.earned')}
          value={coins}
          accent="amber"
        />
      </div>

      {timeSpentSeconds !== undefined ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <Target className="h-4 w-4 text-primary" />
          <span>
            {t('entrance.timeSpent')}: <strong className="text-foreground">{formatDuration(timeSpentSeconds, language, 'long')}</strong>
          </span>
        </div>
      ) : null}
    </section>
  );
}
