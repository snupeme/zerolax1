import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Send } from 'lucide-react';
import { formatDate } from '@zerolax/shared';
import { useI18n } from '../i18n/I18nProvider';
import { ApiError, api } from '../lib/api';
import { errorKey } from '../lib/errors';
import { cn } from '../lib/utils';
import { PageHeader } from '../components/PageHeader';
import { QuestionView } from '../components/QuestionView';
import { TestTimer } from '../components/TestTimer';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Dialog } from '../components/ui/dialog';
import { ErrorState, LoadingScreen, Progress } from '../components/ui/feedback';

interface SaveAnswerVariables {
  questionId: string;
  optionId: string;
  previous?: string;
}

export function EntranceTestPage() {
  const { testId } = useParams<{ testId: string }>();
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const autoSubmitted = useRef(false);

  const session = useQuery({
    queryKey: ['entrance-session', testId],
    queryFn: () => api.entrance.start(testId!),
    enabled: Boolean(testId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    if (session.data) setAnswers(session.data.attempt.answers);
  }, [session.data]);

  const attemptId = session.data?.attempt.id;

  const save = useMutation({
    mutationFn: (variables: SaveAnswerVariables) =>
      api.entrance.answer(attemptId!, variables.questionId, variables.optionId),
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
    mutationFn: () => api.entrance.submit(attemptId!),
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['entrance-tests'] }),
        queryClient.invalidateQueries({ queryKey: ['entrance-history'] }),
        queryClient.invalidateQueries({ queryKey: ['history'] }),
        queryClient.invalidateQueries({ queryKey: ['me'] }),
      ]);
      navigate(`/entrance/result/${attemptId}`, { replace: true, state: { status: data.status } });
    },
    onError: (error) => {
      if (error instanceof ApiError && (error.code === 'ALREADY_SUBMITTED' || error.code === 'ATTEMPT_EXPIRED')) {
        navigate(`/entrance/result/${attemptId}`, { replace: true });
        return;
      }
      setSubmitError(errorKey(error));
      setConfirmOpen(false);
    },
  });

  const data = session.data;
  const currentQuestion = data?.questions[index];
  const answeredCount = Object.keys(answers).length;

  function handleExpire() {
    if (autoSubmitted.current || submit.isPending) return;
    autoSubmitted.current = true;
    setExpired(true);
    submit.mutate();
  }

  if (!testId) return <Navigate to="/entrance" replace />;

  if (session.isLoading) return <LoadingScreen label={t('common.loading')} />;

  if (session.isError || !data) {
    const isDailyLimit = session.error instanceof ApiError && session.error.code === 'DAILY_LIMIT';
    return (
      <div className="animate-fade-in">
        <PageHeader title={t('entrance.title')} backTo="/entrance" />
        <ErrorState
          title={t('common.errorTitle')}
          message={t(errorKey(session.error))}
          onRetry={isDailyLimit ? undefined : () => void session.refetch()}
          retryLabel={t('common.retry')}
        />
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="animate-fade-in">
        <PageHeader title={data.test.title} backTo="/entrance" />
        <ErrorState title={t('common.errorTitle')} message={t('common.noData')} />
      </div>
    );
  }

  const saving = save.isPending && save.variables?.questionId === currentQuestion.id;
  const isLast = index === data.questions.length - 1;
  const locked = expired || submit.isPending;

  function selectOption(optionId: string) {
    if (saving || locked || !currentQuestion) return;
    const previous = answers[currentQuestion.id];
    setAnswers((current) => ({ ...current, [currentQuestion.id]: optionId }));
    save.mutate({ questionId: currentQuestion.id, optionId, previous });
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={data.test.title}
        subtitle={formatDate(data.attempt.attemptDate, language)}
        backTo="/entrance"
        actions={
          <TestTimer
            expiresAt={data.attempt.expiresAt}
            serverTime={data.serverTime}
            onExpire={handleExpire}
          />
        }
      />

      <Card className="mb-4">
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
            <span>
              {t('entrance.answered')}: {answeredCount} / {data.questions.length}
            </span>
            <span className="inline-flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t('entrance.serverTimer')}
            </span>
          </div>
          <Progress value={(answeredCount / data.questions.length) * 100} />
          {expired ? (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
              {t('entrance.timeUp')}
            </p>
          ) : null}
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
              disabled={locked}
              aria-label={`${t('common.question')} ${question.position}`}
              aria-current={questionIndex === index}
              className={cn(
                'grid h-8 w-8 place-items-center rounded-lg border text-xs font-bold transition-colors disabled:opacity-60',
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
        disabled={saving || locked}
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

      {expired && submitError ? (
        <Button
          className="mt-3 w-full"
          onClick={() => submit.mutate()}
          loading={submit.isPending}
          leftIcon={<Send className="h-4 w-4" />}
        >
          {t('common.retry')}
        </Button>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          disabled={index === 0 || locked}
          leftIcon={<ArrowLeft className="h-4 w-4" />}
        >
          {t('common.previous')}
        </Button>

        {isLast ? (
          <Button
            onClick={() => setConfirmOpen(true)}
            leftIcon={<Send className="h-4 w-4" />}
            disabled={save.isPending || locked}
            loading={submit.isPending}
          >
            {t('common.submit')}
          </Button>
        ) : (
          <Button
            onClick={() => setIndex((value) => Math.min(data.questions.length - 1, value + 1))}
            rightIcon={<ArrowRight className="h-4 w-4" />}
            disabled={save.isPending || locked}
          >
            {t('common.next')}
          </Button>
        )}
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('entrance.submitTitle')}
        description={t('entrance.submitText')}
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
              {t('entrance.submitConfirm')}
            </Button>
          </>
        }
      >
        <p className="text-sm font-medium">
          {t('entrance.answered')}: {answeredCount} / {data.questions.length}
        </p>
        {answeredCount < data.questions.length ? (
          <p className="mt-2 rounded-lg bg-gold/10 px-3 py-2 text-xs font-medium text-gold-deep dark:text-gold-deep">
            {t('entrance.unansweredWarning')}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
