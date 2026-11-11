import { entranceCategory, useExamWords } from '../lib/exams';
import { useStudyBack } from '../lib/study';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Clock, GraduationCap, Play, RefreshCw, Trophy } from 'lucide-react';
import { formatDuration } from '@zerolax/shared';
import type { TranslationKey } from '@zerolax/shared';
import { useI18n } from '../i18n/I18nProvider';
import { ApiError, api } from '../lib/api';
import { errorKey } from '../lib/errors';
import { LinkButton } from '../components/LinkButton';
import { PageHeader } from '../components/PageHeader';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/feedback';

const DIFFICULTY_VARIANT = {
  easy: 'success',
  medium: 'warning',
  hard: 'destructive',
} as const;

export function EntranceListPage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const [params]=useSearchParams();
  const category=params.get('category');
  const examWords=useExamWords();
  const back=useStudyBack('/exams',true);
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<TranslationKey | null>(null);

  const tests = useQuery({
    queryKey: ['entrance-tests'],
    queryFn: api.entrance.tests,
  });

  const start = useMutation({
    mutationFn: (testId: string) => api.entrance.start(testId),
    onSuccess: async (data, testId) => {
      queryClient.setQueryData(['entrance-session', testId], data);
      await queryClient.invalidateQueries({ queryKey: ['entrance-tests'] });
      navigate(`/entrance/play/${testId}`);
    },
    onError: async (error) => {
      setActionError(errorKey(error));
      if (error instanceof ApiError && error.code === 'DAILY_LIMIT' && error.details) {
        const details = error.details as { attemptId?: string };
        if (details.attemptId) {
          await queryClient.invalidateQueries({ queryKey: ['entrance-tests'] });
        }
      }
    },
  });

  const visibleTests=tests.data?.tests.filter(test=>!['dtm','sat'].includes(category??'')||entranceCategory(test)===category)??[];
  const todayAttempt = tests.data?.todayAttempt ?? null;
  const blockedByDailyLimit = Boolean(todayAttempt && todayAttempt.status !== 'in_progress');

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={category==='sat'?examWords.sat:category==='dtm'?examWords.dtm:t('entrance.title')}
        backTo="/exams" onBack={back}
        subtitle={t('entrance.subtitle')}
        actions={
          <LinkButton to="/history" variant="ghost" size="sm" leftIcon={<Clock className="h-4 w-4" />}>
            {t('common.history')}
          </LinkButton>
        }
      />

      <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
        <p className="font-semibold text-primary">{t('entrance.intro')}</p>
        <p className="mt-1 text-muted-foreground">{t('entrance.dailyLimitText')}</p>
      </div>

      {todayAttempt ? (
        <Card className="mb-4 border-gold/30 bg-gold/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold-deep dark:text-gold-deep" />
              <div>
                <p className="text-sm font-semibold">{t('entrance.dailyLimitTitle')}</p>
                <p className="text-xs text-muted-foreground">
                  {todayAttempt.status === 'in_progress'
                    ? t('entrance.activeAttempt')
                    : t('entrance.dailyLimitText')}
                </p>
              </div>
            </div>
            {todayAttempt.status === 'in_progress' ? (
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDuration(todayAttempt.remainingSeconds, language, 'clock')}
                </span>
                <LinkButton
                  to={`/entrance/play/${todayAttempt.testId}`}
                  size="sm"
                  leftIcon={<Play className="h-3.5 w-3.5" />}
                >
                  {t('entrance.resume')}
                </LinkButton>
              </div>
            ) : (
              <LinkButton
                to={`/entrance/result/${todayAttempt.attemptId}`}
                size="sm"
                variant="outline"
                leftIcon={<Trophy className="h-3.5 w-3.5" />}
              >
                {t('common.results')}
              </LinkButton>
            )}
          </CardContent>
        </Card>
      ) : null}

      {actionError ? (
        <p role="alert" className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {t(actionError)}
        </p>
      ) : null}

      {tests.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_value, index) => (
            <Skeleton key={index} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : tests.isError ? (
        <ErrorState
          title={t('common.errorTitle')}
          message={t(errorKey(tests.error))}
          onRetry={() => void tests.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : visibleTests.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-6 w-6" />}
          title={t('entrance.noTests')}
          message={t('entrance.noTestsText')}
          action={
            <Button variant="outline" onClick={() => void tests.refetch()} leftIcon={<RefreshCw className="h-4 w-4" />}>
              {t('common.refresh')}
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {visibleTests.map((test) => {
            const isActiveAttempt = todayAttempt?.testId === test.id && todayAttempt.status === 'in_progress';
            const disabled = blockedByDailyLimit || (Boolean(todayAttempt) && !isActiveAttempt);
            const pending = start.isPending && start.variables === test.id;

            return (
              <Card key={test.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex items-start gap-3 p-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-navy/10 text-navy dark:text-surface-ink">
                      <GraduationCap className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-bold leading-tight">{test.title}</h2>
                        <Badge variant={DIFFICULTY_VARIANT[test.difficulty]}>
                          {t(`difficulty.${test.difficulty}` as TranslationKey)}
                        </Badge>
                      </div>
                      {test.description ? (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{test.description}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <GraduationCap className="h-3.5 w-3.5" />
                          {t('entrance.subject')}: {test.subject}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDuration(test.durationSeconds, language, 'long')}
                        </span>
                        <span>
                          {t('entrance.questionsCount').replace('{count}', String(test.questionCount))}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-4 py-3">
                    <span className="text-xs font-medium text-muted-foreground">
                      {isActiveAttempt ? t('entrance.activeAttempt') : t('entrance.start')}
                    </span>
                    <Button
                      size="sm"
                      variant={isActiveAttempt ? 'primary' : 'outline'}
                      loading={pending}
                      disabled={disabled || start.isPending}
                      onClick={() => {
                        setActionError(null);
                        start.mutate(test.id);
                      }}
                      leftIcon={isActiveAttempt ? <Play className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
                    >
                      {isActiveAttempt ? t('entrance.resume') : t('entrance.start')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-center text-xs text-muted-foreground">
        {blockedByDailyLimit ? t('entrance.dailyLimitText') : t('entrance.intro')}
      </p>
    </div>
  );
}
