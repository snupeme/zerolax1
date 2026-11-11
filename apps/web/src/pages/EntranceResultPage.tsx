import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { AlertTriangle, GraduationCap } from 'lucide-react';
import { formatDate } from '@zerolax/shared';
import { useI18n } from '../i18n/I18nProvider';
import { api } from '../lib/api';
import { errorKey } from '../lib/errors';
import { LinkButton } from '../components/LinkButton';
import { PageHeader } from '../components/PageHeader';
import { QuestionReview } from '../components/QuestionReview';
import { ResultSummary } from '../components/ResultSummary';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { ErrorState, LoadingScreen } from '../components/ui/feedback';

export function EntranceResultPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { t, language } = useI18n();

  const result = useQuery({
    queryKey: ['entrance-result', attemptId],
    queryFn: () => api.entrance.result(attemptId!),
    enabled: Boolean(attemptId),
    refetchOnWindowFocus: false,
  });

  if (result.isLoading) return <LoadingScreen label={t('common.loading')} />;

  if (result.isError) {
    return (
      <div className="animate-fade-in">
        <PageHeader title={t('entrance.resultTitle')} backTo="/entrance" />
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
        subtitle={`${formatDate(data.attemptDate, language)} · ${t('entrance.resultTitle')}`}
        backTo="/entrance"
        actions={
          <LinkButton to="/history" variant="ghost" size="sm">
            {t('common.history')}
          </LinkButton>
        }
      />

      {data.status === 'expired' ? (
        <Card className="mb-4 border-gold/30 bg-gold/5">
          <CardContent className="flex items-start gap-2.5 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold-deep dark:text-gold-deep" />
            <div>
              <p className="text-sm font-semibold">{t('entrance.autoSubmitted')}</p>
              <p className="text-xs text-muted-foreground">{t('entrance.timeUp')}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-5">
        <ResultSummary
          correct={data.totalCorrect}
          incorrect={data.totalIncorrect}
          unanswered={data.unanswered}
          total={data.totalQuestions}
          coins={data.coinsEarned}
          timeSpentSeconds={data.timeSpentSeconds}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success">
            {t('entrance.correctAnswers')}: {data.totalCorrect}
          </Badge>
          <Badge variant="destructive">
            {t('entrance.incorrectAnswers')}: {data.totalIncorrect}
          </Badge>
          <Badge variant="primary">
            {t('common.percent')}: {data.percent}%
          </Badge>
          <Badge variant="warning">
            {t('entrance.coinsEarned')}: {data.coinsEarned}
          </Badge>
        </div>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
            <GraduationCap className="h-4 w-4 text-primary" />
            {t('entrance.reviewTitle')}
          </h2>
          <QuestionReview questions={data.questions} />
        </section>

        <div className="flex flex-wrap gap-2">
          <LinkButton to="/entrance" variant="outline">
            {t('entrance.backToList')}
          </LinkButton>
          <LinkButton to="/history" variant="ghost">
            {t('common.history')}
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
