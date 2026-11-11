import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Lock, Trophy } from 'lucide-react';
import { formatDate } from '@zerolax/shared';
import { useI18n } from '../i18n/I18nProvider';
import { api } from '../lib/api';
import { errorKey } from '../lib/errors';
import { Countdown } from '../components/Countdown';
import { PageHeader } from '../components/PageHeader';
import { QuestionReview } from '../components/QuestionReview';
import { ResultSummary } from '../components/ResultSummary';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { EmptyState, ErrorState, LoadingScreen } from '../components/ui/feedback';

export function IqResultPage() {
  const { testId } = useParams<{ testId: string }>();
  const { t, language } = useI18n();

  const result = useQuery({
    queryKey: ['iq-result', testId],
    queryFn: () => api.iq.result(testId!),
    enabled: Boolean(testId),
    refetchOnWindowFocus: false,
  });

  if (result.isLoading) return <LoadingScreen label={t('common.loading')} />;

  if (result.isError) {
    return (
      <div className="animate-fade-in">
        <PageHeader title={t('iq.resultTitle')} backTo="/iq" />
        <ErrorState
          title={t('common.errorTitle')}
          message={t(errorKey(result.error))}
          onRetry={() => void result.refetch()}
          retryLabel={t('common.retry')}
        />
      </div>
    );
  }

  const data = result.data!;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={data.test.title}
        subtitle={`${formatDate(data.test.testDate, language)} · ${t('iq.resultTitle')}`}
        backTo="/iq"
      />

      {data.locked ? (
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="brand-gradient px-5 py-6 text-surface-ink">
              <div className="flex items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface-ink/15">
                  <Lock className="h-6 w-6" />
                </span>
                <div>
                  <h2 className="text-xl font-bold">{t('iq.lockedTitle')}</h2>
                  <p className="mt-1 text-sm text-surface-ink/80">{t('iq.submittedText')}</p>
                </div>
              </div>
            </div>
            <CardContent className="space-y-4 p-5">
              {data.releaseAt ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/60 p-4">
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {t('iq.releasePending')}
                  </span>
                  <Countdown target={data.releaseAt} className="text-lg font-bold text-foreground" />
                </div>
              ) : null}
              <p className="text-sm text-muted-foreground">
                {t('iq.lockedText', {
                  date: data.releaseAt
                    ? formatDate(data.releaseAt, language, { withTime: true })
                    : t('common.tomorrow'),
                })}
              </p>
              <Link to="/iq" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                <ArrowLeft className="h-4 w-4" />
                {t('common.back')}
              </Link>
            </CardContent>
          </Card>
        </div>
      ) : data.attemptId === null ? (
        <EmptyState
          icon={<Trophy className="h-6 w-6" />}
          title={t('iq.noHistory')}
          message={t('iq.noTestText')}
        />
      ) : (
        <div className="space-y-5">
          <ResultSummary
            correct={data.totalCorrect}
            incorrect={data.totalIncorrect}
            unanswered={data.unanswered}
            total={data.totalQuestions}
            coins={data.coinsEarned}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">
              {t('iq.totalCorrect')}: {data.totalCorrect}
            </Badge>
            <Badge variant="destructive">
              {t('iq.totalIncorrect')}: {data.totalIncorrect}
            </Badge>
            <Badge variant="warning">
              {t('common.percent')}: {data.percent}%
            </Badge>
            <Badge variant="primary">
              {t('iq.coinsEarned')}: {data.coinsEarned}
            </Badge>
          </div>

          <section>
            <h2 className="mb-3 text-base font-bold">{t('iq.reviewTitle')}</h2>
            <QuestionReview questions={data.questions} />
          </section>
        </div>
      )}
    </div>
  );
}
