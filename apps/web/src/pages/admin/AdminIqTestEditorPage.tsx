import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ListChecks, Plus, Rocket, Save } from 'lucide-react';
import {
  IQ_QUESTIONS_PER_TEST,
  formatDate,
  iqTestInputSchema,
  type AdminTestQuestion,
  type TranslationKey,
} from '@zerolax/shared';
import { useI18n } from '../../i18n/I18nProvider';
import { api, type QuestionInput } from '../../lib/api';
import { errorKey } from '../../lib/errors';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { QuestionEditorDialog } from '../../components/admin/QuestionEditorDialog';
import { QuestionList } from '../../components/admin/QuestionList';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Field, Input } from '../../components/ui/input';
import { ErrorState, LoadingScreen } from '../../components/ui/feedback';

interface SettingsForm {
  testDate: string;
  titleUz: string;
  titleRu: string;
  titleEn: string;
}

export function AdminIqTestEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [settings, setSettings] = useState<SettingsForm>({
    testDate: '',
    titleUz: '',
    titleRu: '',
    titleEn: '',
  });
  const [settingsError, setSettingsError] = useState<TranslationKey | null>(null);
  const [message, setMessage] = useState<TranslationKey | null>(null);
  const [actionError, setActionError] = useState<TranslationKey | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<AdminTestQuestion | null>(null);
  const [questionError, setQuestionError] = useState<TranslationKey | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminTestQuestion | null>(null);

  const detail = useQuery({
    queryKey: ['admin-iq-test', id],
    queryFn: () => api.admin.iqTest(id!),
    enabled: Boolean(id),
  });

  useEffect(() => {
    const test = detail.data?.test;
    if (!test) return;
    setSettings({
      testDate: test.testDate,
      titleUz: test.titleUz,
      titleRu: test.titleRu,
      titleEn: test.titleEn,
    });
  }, [detail.data?.test.id]);

  const saveSettings = useMutation({
    mutationFn: (input: SettingsForm) => api.admin.updateIqTest(id!, input),
    onSuccess: async (data) => {
      setSettings({
        testDate: data.test.testDate,
        titleUz: data.test.titleUz,
        titleRu: data.test.titleRu,
        titleEn: data.test.titleEn,
      });
      setSettingsError(null);
      setMessage('admin.testUpdated');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-iq-test', id] }),
        queryClient.invalidateQueries({ queryKey: ['admin-iq-tests'] }),
      ]);
    },
    onError: (error) => {
      setMessage(null);
      setSettingsError(errorKey(error));
    },
  });

  const publish = useMutation({
    mutationFn: () => api.admin.publishIqTest(id!),
    onSuccess: async () => {
      setPublishOpen(false);
      setActionError(null);
      setMessage('admin.testPublished');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-iq-test', id] }),
        queryClient.invalidateQueries({ queryKey: ['admin-iq-tests'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-overview'] }),
      ]);
    },
    onError: (error) => {
      setPublishOpen(false);
      setActionError(errorKey(error));
    },
  });

  const saveQuestion = useMutation({
    mutationFn: (input: QuestionInput) =>
      editingQuestion
        ? api.admin.updateIqQuestion(editingQuestion.id, input)
        : api.admin.addIqQuestion(id!, input),
    onSuccess: async () => {
      setEditorOpen(false);
      setEditingQuestion(null);
      setQuestionError(null);
      setMessage('admin.questionSaved');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-iq-test', id] }),
        queryClient.invalidateQueries({ queryKey: ['admin-iq-tests'] }),
      ]);
    },
    onError: (error) => setQuestionError(errorKey(error)),
  });

  const deleteQuestion = useMutation({
    mutationFn: (questionId: string) => api.admin.deleteIqQuestion(questionId),
    onSuccess: async () => {
      setDeleteTarget(null);
      setMessage('admin.questionDeleted');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-iq-test', id] }),
        queryClient.invalidateQueries({ queryKey: ['admin-iq-tests'] }),
      ]);
    },
    onError: (error) => {
      setDeleteTarget(null);
      setActionError(errorKey(error));
    },
  });

  if (detail.isLoading) return <LoadingScreen label={t('common.loading')} />;

  if (detail.isError) {
    return (
      <div>
        <PageHeader title={t('admin.editTest')} backTo="/admin/iq" />
        <ErrorState
          title={t('common.errorTitle')}
          message={t(errorKey(detail.error))}
          onRetry={() => void detail.refetch()}
          retryLabel={t('common.retry')}
        />
      </div>
    );
  }

  const data = detail.data!;
  const testTitle =
    language === 'ru'
      ? data.test.titleRu
      : language === 'en'
        ? data.test.titleEn
        : data.test.titleUz;
  const ready = data.questions.length === IQ_QUESTIONS_PER_TEST;

  function submitSettings() {
    const parsed = iqTestInputSchema.safeParse(settings);
    if (!parsed.success) {
      setSettingsError('admin.requiredFields');
      return;
    }
    setSettingsError(null);
    setMessage(null);
    saveSettings.mutate(parsed.data);
  }

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title={testTitle}
        subtitle={`${formatDate(data.test.testDate, language)} · ${t('admin.editTest')}`}
        backTo="/admin/iq"
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/iq')} leftIcon={<ArrowLeft className="h-4 w-4" />}>
            {t('common.back')}
          </Button>
        }
      />

      {actionError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {t(actionError)}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">{t(message)}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Save className="h-4 w-4 text-primary" />
              {t('admin.editTest')}
            </CardTitle>
            <CardDescription>
              {t('admin.testDate')}: {formatDate(data.test.testDate, language)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {settingsError ? (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                {t(settingsError)}
              </p>
            ) : null}
            <Field label={t('admin.testDate')} htmlFor="iq-test-date">
              <Input
                id="iq-test-date"
                type="date"
                value={settings.testDate}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, testDate: event.target.value }))
                }
              />
            </Field>
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label={t('admin.titleUz')}>
                <Input
                  value={settings.titleUz}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, titleUz: event.target.value }))
                  }
                />
              </Field>
              <Field label={t('admin.titleRu')}>
                <Input
                  value={settings.titleRu}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, titleRu: event.target.value }))
                  }
                />
              </Field>
              <Field label={t('admin.titleEn')}>
                <Input
                  value={settings.titleEn}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, titleEn: event.target.value }))
                  }
                />
              </Field>
            </div>
            <Button
              onClick={submitSettings}
              loading={saveSettings.isPending}
              leftIcon={<Save className="h-4 w-4" />}
            >
              {t('common.save')}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-primary" />
              {t('admin.publishTest')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">{t('admin.questions')}</span>
              <Badge variant={ready ? 'success' : 'warning'}>
                {data.questions.length} / {IQ_QUESTIONS_PER_TEST}
              </Badge>
            </div>
            <Badge variant={data.test.status === 'published' ? 'success' : 'default'}>
              {data.test.status === 'published'
                ? t('common.published')
                : data.test.status === 'scheduled'
                  ? t('common.scheduled')
                  : data.test.status === 'archived'
                    ? t('common.archived')
                    : t('common.draft')}
            </Badge>
            {data.test.status === 'published' ? (
              <p className="text-xs text-muted-foreground">
                {data.test.releaseAt
                  ? t('iq.releaseAt', {
                      date: formatDate(data.test.releaseAt, language, { withTime: true }),
                    })
                  : t('iq.submittedText')}
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">{t('admin.iqNeeds10')}</p>
                <Button
                  className="w-full"
                  variant="success"
                  disabled={!ready}
                  onClick={() => setPublishOpen(true)}
                  leftIcon={<Rocket className="h-4 w-4" />}
                >
                  {t('admin.publishTest')}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              {t('admin.questions')}
            </CardTitle>
            <CardDescription>{t('admin.iqNeeds10')}</CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditingQuestion(null);
              setQuestionError(null);
              setEditorOpen(true);
            }}
            disabled={data.questions.length >= IQ_QUESTIONS_PER_TEST}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            {t('admin.addQuestion')}
          </Button>
        </CardHeader>
        <CardContent>
          <QuestionList
            questions={data.questions}
            emptyLabel={t('admin.addQuestionsFirst')}
            onEdit={(question) => {
              setEditingQuestion(question);
              setQuestionError(null);
              setEditorOpen(true);
            }}
            onDelete={(question) => setDeleteTarget(question)}
          />
        </CardContent>
      </Card>

      <QuestionEditorDialog
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditingQuestion(null);
        }}
        initial={editingQuestion}
        onSubmit={(input) => saveQuestion.mutate(input)}
        saving={saveQuestion.isPending}
        error={questionError}
      />

      <ConfirmDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onConfirm={() => publish.mutate()}
        title={t('admin.publishConfirm')}
        description={t('admin.publishTest')}
        confirmLabel={t('admin.publishTest')}
        loading={publish.isPending}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteQuestion.mutate(deleteTarget.id)}
        title={t('admin.deleteQuestion')}
        description={t('admin.deleteConfirm')}
        confirmLabel={t('admin.yesDelete')}
        loading={deleteQuestion.isPending}
        destructive
      />
    </div>
  );
}
