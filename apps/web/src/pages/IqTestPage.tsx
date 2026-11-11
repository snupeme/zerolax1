import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CheckCircle2, Send } from 'lucide-react';
import { formatDate } from '@zerolax/shared';
import { useI18n } from '../i18n/I18nProvider';
import { ApiError, api } from '../lib/api';
import { errorKey } from '../lib/errors';
import { cn } from '../lib/utils';
import { PageHeader } from '../components/PageHeader';
import { QuestionView } from '../components/QuestionView';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Dialog } from '../components/ui/dialog';
import { ErrorState, LoadingScreen, Progress } from '../components/ui/feedback';

interface SaveAnswerVariables {
  questionId: string;
  optionId: string;
  previous?: string;
}

export function IqTestPage() {
  const { testId } = useParams<{ testId: string }>();
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const started = useQuery({
    queryKey: ['iq-play', testId],
    queryFn: () => api.iq.start(testId!),
    enabled: Boolean(testId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    if (started.data) setAnswers(started.data.attempt.answers);
  }, [started.data]);

  const save = useMutation({
    mutationFn: (variables: SaveAnswerVariables) =>
      api.iq.answer(started.data!.attempt.id, variables.questionId, variables.optionId),
    onMutate: () => setSaveError(null),
    onError: (error, variables) => {
      setSaveError(errorKey(error));
      setAnswers((current) => {
        if (current[variables.questionId] !== variables.optionId) return current;
        const next = { ...current };
        if (variables.previous) next[variables.questionId] = variables.previous;
        else delete next[variables.questionId];
        return next;
      });
    },
  });

  const submit = useMutation({
    mutationFn: () => api.iq.submit(started.data!.attempt.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['iq-today'] }),
        queryClient.invalidateQueries({ queryKey: ['iq-history'] }),
        queryClient.invalidateQueries({ queryKey: ['history'] }),
        queryClient.invalidateQueries({ queryKey: ['me'] }),
      ]);
      navigate(`/iq/result/${testId}`, { replace: true });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'ALREADY_SUBMITTED') {
        navigate(`/iq/result/${testId}`, { replace: true });
        return;
      }
      setSubmitError(errorKey(error));
      setConfirmOpen(false);
    },
  });

  const data = started.data;
  const currentQuestion = data?.questions[index];
  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);

  if (!testId) {
    return <Navigate to="/iq" replace />;
  }

  if (started.isLoading) return <LoadingScreen label={t('common.loading')} />;

  if (started.isError || !data) {
    return (
      <div className="animate-fade-in">
        <PageHeader title={t('iq.title')} backTo="/iq" />
        <ErrorState
          title={t('common.errorTitle')}
          message={t(errorKey(started.error))}
          onRetry={() => void started.refetch()}
          retryLabel={t('common.retry')}
        />
      </div>
    );
  }

  if (data.attempt.status !== 'in_progress') {
    return <Navigate to={`/iq/result/${testId}`} replace />;
  }

  if (!currentQuestion) {
    return (
      <div className="animate-fade-in">
        <PageHeader title={data.test.title} backTo="/iq" />
        <ErrorState title={t('common.errorTitle')} message={t('common.noData')} />
      </div>
    );
  }

  const releaseLabel = data.test.releaseAt
    ? formatDate(data.test.releaseAt, language, { withTime: true })
    : t('common.tomorrow');

  const saving = save.isPending && save.variables?.questionId === currentQuestion.id;
  const isLast = index === data.questions.length - 1;

  function selectOption(optionId: string) {
    if (saving || !currentQuestion) return;
    const previous = answers[currentQuestion.id];
    setAnswers((current) => ({ ...current, [currentQuestion.id]: optionId }));
    save.mutate({ questionId: currentQuestion.id, optionId, previous });
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={data.test.title}
        subtitle={formatDate(data.test.testDate, language)}
        backTo="/iq"
        actions={
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
            {index + 1} / {data.questions.length}
          </span>
        }
      />

      <Card className="mb-4">
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
            <span>
              {t('iq.answeredCount', {
                answered: answeredCount,
                total: data.questions.length,
              })}
            </span>
            <span>{t('iq.progress')}</span>
          </div>
          <Progress value={(answeredCount / data.questions.length) * 100} />
        </CardContent>
      </Card>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {data.questions.map((question, questionIndex) => {
          const answered = Boolean(answers[question.id]);
          return (
            <button
              key={question.id}
              type="button"
              onClick={() => setIndex(questionIndex)}
              aria-label={`${t('common.question')} ${question.position}`}
              aria-current={questionIndex === index}
              className={cn(
                'grid h-8 w-8 place-items-center rounded-lg border text-xs font-bold transition-colors',
                questionIndex === index
                  ? 'border-primary bg-primary text-primary-foreground'
                  : answered
                    ? 'border-success/40 bg-success/10 text-success'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted',
              )}
            >
              {question.position}
            </button>
          );
        })}
      </div>

      <QuestionView
        question={currentQuestion}
        selectedOptionId={answers[currentQuestion.id] ?? null}
        onSelect={selectOption}
        disabled={saving}
        saving={saving}
      />

      {saveError ? (
        <p role="alert" className="mt-3 text-sm font-medium text-destructive">
          {t(saveError as Parameters<typeof t>[0])}
        </p>
      ) : null}

      {submitError ? (
        <p role="alert" className="mt-3 text-sm font-medium text-destructive">
          {t(submitError as Parameters<typeof t>[0])}
        </p>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          disabled={index === 0}
          leftIcon={<ArrowLeft className="h-4 w-4" />}
        >
          {t('common.previous')}
        </Button>

        {isLast ? (
          <Button
            onClick={() => setConfirmOpen(true)}
            leftIcon={<Send className="h-4 w-4" />}
            disabled={save.isPending}
          >
            {t('common.submit')}
          </Button>
        ) : (
          <Button
            onClick={() => setIndex((value) => Math.min(data.questions.length - 1, value + 1))}
            rightIcon={<ArrowRight className="h-4 w-4" />}
            disabled={save.isPending}
          >
            {t('common.next')}
          </Button>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">{t('iq.submittedText')}</p>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('iq.submitTitle')}
        description={t('iq.submitText', { release: releaseLabel })}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submit.isPending}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => submit.mutate()}
              loading={submit.isPending}
              leftIcon={<CheckCircle2 className="h-4 w-4" />}
            >
              {t('iq.submitConfirm')}
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm">
          <p className="font-medium">
            {t('iq.answeredCount', { answered: answeredCount, total: data.questions.length })}
          </p>
          {answeredCount < data.questions.length ? (
            <p className="rounded-lg bg-gold/10 px-3 py-2 text-xs font-medium text-gold-deep dark:text-gold-deep">
              {t('iq.unansweredWarning')}
            </p>
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}
