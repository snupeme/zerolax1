import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Brain, ChevronRight, Clock, History, Lock, Play, Sparkles } from 'lucide-react';
import { formatDate } from '@zerolax/shared';
import { useI18n } from '../i18n/I18nProvider';
import { api } from '../lib/api';
import { errorKey } from '../lib/errors';
import { LinkButton } from '../components/LinkButton';
import { PageHeader } from '../components/PageHeader';
import { Countdown } from '../components/Countdown';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/feedback';

export function IqPage() {
  const { t, language } = useI18n();
  const today = useQuery({ queryKey: ['iq-today'], queryFn: api.iq.today });

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('iq.title')}
        subtitle={t('iq.subtitle')}
        actions={
          <LinkButton to="/history" variant="ghost" size="sm" leftIcon={<History className="h-4 w-4" />}>
            {t('common.history')}
          </LinkButton>
        }
      />

      {today.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : today.isError ? (
        <ErrorState
          title={t('common.errorTitle')}
          message={t(errorKey(today.error))}
          onRetry={() => void today.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : !today.data?.test ? (
        <EmptyState
          icon={<Brain className="h-6 w-6" />}
          title={t('iq.noTestTitle')}
          message={t('iq.noTestText')}
        />
      ) : (
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="brand-gradient px-5 py-6 text-surface-ink">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge className="border-0 bg-surface-ink/20 text-surface-ink">
                    {formatDate(today.data.test.testDate, language, { short: true })}
                  </Badge>
                  <h2 className="mt-2 text-xl font-bold">{today.data.test.title}</h2>
                  <p className="mt-1 text-sm text-surface-ink/80">{t('iq.intro')}</p>
                </div>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface-ink/15">
                  <Brain className="h-6 w-6" />
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-surface-ink/15 px-2.5 py-1">
                  {t('iq.questionsCount', { count: today.data.test.questionCount })}
                </span>
                <span className="rounded-full bg-surface-ink/15 px-2.5 py-1">{t('common.coins')}</span>
                <span className="rounded-full bg-surface-ink/15 px-2.5 py-1">
                  {t('home.dailyIqSubtitle')}
                </span>
              </div>
            </div>

            <CardContent className="p-5">
              {today.data.attempt?.status === 'in_progress' ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {t('iq.answeredCount', {
                      answered: Object.keys(today.data.attempt.answers).length,
                      total: today.data.test.questionCount,
                    })}
                  </div>
                  <LinkButton
                    to={`/iq/play/${today.data.test.id}`}
                    rightIcon={<Play className="h-4 w-4" />}
                  >
                    {t('iq.resume')}
                  </LinkButton>
                </div>
              ) : today.data.attempt ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-lg bg-muted/60 p-3">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-semibold">{t('iq.submittedTitle')}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t('iq.submittedText')}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm">
                      {today.data.resultAvailable ? (
                        <Badge variant="success">{t('iq.resultReady')}</Badge>
                      ) : today.data.releaseAt ? (
                        <span className="inline-flex flex-wrap items-center gap-1.5 text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          {t('iq.releasePending')}:{' '}
                          <Countdown target={today.data.releaseAt} className="font-semibold text-foreground" />
                        </span>
                      ) : (
                        <Badge variant="warning">{t('iq.coinsPending')}</Badge>
                      )}
                    </div>
                    <LinkButton
                      to={`/iq/result/${today.data.test.id}`}
                      variant={today.data.resultAvailable ? 'primary' : 'outline'}
                      rightIcon={<ChevronRight className="h-4 w-4" />}
                    >
                      {today.data.resultAvailable ? t('home.viewResult') : t('iq.resultTitle')}
                    </LinkButton>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">{t('home.dailyIqReady')}</p>
                  <LinkButton
                    to={`/iq/play/${today.data.test.id}`}
                    leftIcon={<Sparkles className="h-4 w-4" />}
                  >
                    {t('iq.start')}
                  </LinkButton>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-3">
            <InfoTile icon={<Brain className="h-4 w-4" />} label={t('iq.questionsCount', { count: 10 })} />
            <InfoTile icon={<Clock className="h-4 w-4" />} label={t('home.dailyIqSubtitle')} />
            <InfoTile icon={<Lock className="h-4 w-4" />} label={t('iq.submittedText')} />
          </div>

          <div className="text-center">
            <Link
              to="/history"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              {t('iq.historyTitle')}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoTile({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
      <span className="mt-0.5 text-primary">{icon}</span>
      <span className="leading-snug">{label}</span>
    </div>
  );
}
