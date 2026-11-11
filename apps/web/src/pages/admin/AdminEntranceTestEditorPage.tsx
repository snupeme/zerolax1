import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ListChecks, Plus, Rocket, Save, Undo2 } from 'lucide-react';
import {
  ENTRANCE_QUESTIONS_PER_TEST,
  entranceTestInputSchema,
  formatDate,
  formatDuration,
  type AdminTestQuestion,
  type Difficulty,
  type TranslationKey,
} from '@zerolax/shared';
import { useI18n } from '../../i18n/I18nProvider';
import { api, type EntranceTestInput } from '../../lib/api';
import { errorKey } from '../../lib/errors';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { QuestionEditorDialog } from '../../components/admin/QuestionEditorDialog';
import { QuestionList } from '../../components/admin/QuestionList';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Field, Input, Select, Textarea } from '../../components/ui/input';
import { ErrorState, LoadingScreen } from '../../components/ui/feedback';

interface SettingsForm {
  slug: string;
  titleUz: string;
  titleRu: string;
  titleEn: string;
  descriptionUz: string;
  descriptionRu: string;
  descriptionEn: string;
  subject: string;
  difficulty: Difficulty;
  durationMinutes: string;
}

export function AdminEntranceTestEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [settings, setSettings] = useState<SettingsForm>({
    slug: '',
    titleUz: '',
    titleRu: '',
    titleEn: '',
    descriptionUz: '',
    descriptionRu: '',
    descriptionEn: '',
    subject: '',
    difficulty: 'medium',
    durationMinutes: '30',
  });
  const [settingsError, setSettingsError] = useState<TranslationKey | null>(null);
  const [message, setMessage] = useState<TranslationKey | null>(null);
  const [actionError, setActionError] = useState<TranslationKey | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<AdminTestQuestion | null>(null);
  const [questionError, setQuestionError] = useState<TranslationKey | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminTestQuestion | null>(null);

  const detail = useQuery({
    queryKey: ['admin-entrance-test', id],
    queryFn: () => api.admin.entranceTest(id!),
    enabled: Boolean(id),
  });

  useEffect(() => {
    const test = detail.data?.test;
    if (!test) return;
    setSettings({
      slug: test.slug,
      titleUz: test.titleUz,
      titleRu: test.titleRu,
      titleEn: test.titleEn,
      descriptionUz: test.descriptionUz ?? '',
      descriptionRu: test.descriptionRu ?? '',
      descriptionEn: test.descriptionEn ?? '',
      subject: test.subject,
      difficulty: test.difficulty,
      durationMinutes: String(Math.round(test.durationSeconds / 60)),
    });
  }, [detail.data?.test.id]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-entrance-test', id] }),
      queryClient.invalidateQueries({ queryKey: ['admin-entrance-tests'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] }),
    ]);
  };

  const saveSettings = useMutation({
    mutationFn: (input: EntranceTestInput) => api.admin.updateEntranceTest(id!, input),
    onSuccess: async (data) => {
      setSettings({
        slug: data.test.slug,
        titleUz: data.test.titleUz,
        titleRu: data.test.titleRu,
        titleEn: data.test.titleEn,
        descriptionUz: data.test.descriptionUz ?? '',
        descriptionRu: data.test.descriptionRu ?? '',
        descriptionEn: data.test.descriptionEn ?? '',
        subject: data.test.subject,
        difficulty: data.test.difficulty,
        durationMinutes: String(Math.round(data.test.durationSeconds / 60)),
      });
      setSettingsError(null);
      setMessage('admin.testUpdated');
      await refresh();
    },
    onError: (error) => {
      setMessage(null);
      setSettingsError(errorKey(error));
    },
  });

  const publish = useMutation({
    mutationFn: () => api.admin.publishEntranceTest(id!),
    onSuccess: async () => {
      setPublishOpen(false);
      setActionError(null);
      setMessage('admin.testPublished');
      await refresh();
    },
    onError: (error) => {
      setPublishOpen(false);
      setActionError(errorKey(error));
    },
  });

  const unpublish = useMutation({
    mutationFn: () => api.admin.unpublishEntranceTest(id!),
    onSuccess: async () => {
      setUnpublishOpen(false);
      setActionError(null);
      setMessage('admin.testUpdated');
      await refresh();
    },
    onError: (error) => {
      setUnpublishOpen(false);
      setActionError(errorKey(error));
    },
  });

  const saveQuestion = useMutation({
    mutationFn: (input: Parameters<typeof api.admin.addEntranceQuestion>[1]) =>
      editingQuestion
        ? api.admin.updateEntranceQuestion(editingQuestion.id, input)
        : api.admin.addEntranceQuestion(id!, input),
    onSuccess: async () => {
      setEditorOpen(false);
      setEditingQuestion(null);
      setQuestionError(null);
      setMessage('admin.questionSaved');
      await refresh();
    },
    onError: (error) => setQuestionError(errorKey(error)),
  });

  const deleteQuestion = useMutation({
    mutationFn: (questionId: string) => api.admin.deleteEntranceQuestion(questionId),
    onSuccess: async () => {
      setDeleteTarget(null);
      setMessage('admin.questionDeleted');
      await refresh();
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
        <PageHeader title={t('admin.editTest')} backTo="/admin/entrance" />
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
  const ready = data.questions.length === ENTRANCE_QUESTIONS_PER_TEST;

  function submitSettings() {
    const input = {
      slug: settings.slug,
      titleUz: settings.titleUz,
      titleRu: settings.titleRu,
      titleEn: settings.titleEn,
      descriptionUz: settings.descriptionUz.trim() || null,
      descriptionRu: settings.descriptionRu.trim() || null,
      descriptionEn: settings.descriptionEn.trim() || null,
      subject: settings.subject,
      difficulty: settings.difficulty,
      durationSeconds: Math.round(Number(settings.durationMinutes) * 60),
    };
    const parsed = entranceTestInputSchema.safeParse(input);
    if (!parsed.success) {
      setSettingsError('admin.requiredFields');
      return;
    }
    setSettingsError(null);
    setMessage(null);
    saveSettings.mutate(parsed.data as EntranceTestInput);
  }

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title={testTitle}
        subtitle={`${t('admin.slug')}: ${data.test.slug} · ${formatDuration(
          data.test.durationSeconds,
          language,
          'long',
        )}`}
        backTo="/admin/entrance"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/admin/entrance')}
            leftIcon={<ArrowLeft className="h-4 w-4" />}
          >
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
              {data.test.publishedAt
                ? `${t('common.published')}: ${formatDate(data.test.publishedAt, language, {
                    withTime: true,
                  })}`
                : t('common.draft')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {settingsError ? (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                {t(settingsError)}
              </p>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label={t('admin.slug')} htmlFor="entrance-slug" hint="a-z, 0-9, -">
                <Input
                  id="entrance-slug"
                  value={settings.slug}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, slug: event.target.value }))
                  }
                />
              </Field>
              <Field label={t('admin.subject')} htmlFor="entrance-subject">
                <Input
                  id="entrance-subject"
                  value={settings.subject}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, subject: event.target.value }))
                  }
                />
              </Field>
            </div>
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
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label={t('admin.descriptionUz')}>
                <Textarea
                  rows={2}
                  value={settings.descriptionUz}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, descriptionUz: event.target.value }))
                  }
                />
              </Field>
              <Field label={t('admin.descriptionRu')}>
                <Textarea
                  rows={2}
                  value={settings.descriptionRu}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, descriptionRu: event.target.value }))
                  }
                />
              </Field>
              <Field label={t('admin.descriptionEn')}>
                <Textarea
                  rows={2}
                  value={settings.descriptionEn}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, descriptionEn: event.target.value }))
                  }
                />
              </Field>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label={t('admin.difficulty')}>
                <Select
                  value={settings.difficulty}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      difficulty: event.target.value as Difficulty,
                    }))
                  }
                >
                  <option value="easy">{t('difficulty.easy')}</option>
                  <option value="medium">{t('difficulty.medium')}</option>
                  <option value="hard">{t('difficulty.hard')}</option>
                </Select>
              </Field>
              <Field label={t('admin.durationSeconds')} hint={t('common.minutes')}>
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={settings.durationMinutes}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      durationMinutes: event.target.value,
                    }))
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
              {data.test.status === 'published' ? t('admin.unpublish') : t('admin.publishTest')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">{t('admin.questions')}</span>
              <Badge variant={ready ? 'success' : 'warning'}>
                {data.questions.length} / {ENTRANCE_QUESTIONS_PER_TEST}
              </Badge>
            </div>
            <Badge
              variant={
                data.test.status === 'published'
                  ? 'success'
                  : data.test.status === 'archived'
                    ? 'outline'
                    : 'default'
              }
            >
              {data.test.status === 'published'
                ? t('common.published')
                : data.test.status === 'archived'
                  ? t('common.archived')
                  : t('common.draft')}
            </Badge>
            <p className="text-xs text-muted-foreground">{t('admin.entranceNeeds20')}</p>
            {data.test.status === 'published' ? (
              <Button
                className="w-full"
                variant="outline"
                onClick={() => setUnpublishOpen(true)}
                leftIcon={<Undo2 className="h-4 w-4" />}
              >
                {t('admin.unpublish')}
              </Button>
            ) : (
              <Button
                className="w-full"
                variant="success"
                disabled={!ready}
                onClick={() => setPublishOpen(true)}
                leftIcon={<Rocket className="h-4 w-4" />}
              >
                {t('admin.publishTest')}
              </Button>
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
            <CardDescription>{t('admin.entranceNeeds20')}</CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditingQuestion(null);
              setQuestionError(null);
              setEditorOpen(true);
            }}
            disabled={data.questions.length >= ENTRANCE_QUESTIONS_PER_TEST}
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
        open={unpublishOpen}
        onClose={() => setUnpublishOpen(false)}
        onConfirm={() => unpublish.mutate()}
        title={t('admin.unpublish')}
        description={testTitle}
        confirmLabel={t('admin.unpublish')}
        loading={unpublish.isPending}
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
