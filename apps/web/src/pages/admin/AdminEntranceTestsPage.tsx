import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, Plus, Rocket, Trash2, Undo2 } from 'lucide-react';
import {
  ENTRANCE_QUESTIONS_PER_TEST,
  entranceTestInputSchema,
  formatDuration,
  type AdminEntranceTest,
  type Difficulty,
  type TranslationKey,
} from '@zerolax/shared';
import { useI18n } from '../../i18n/I18nProvider';
import { api, type EntranceTestInput } from '../../lib/api';
import { errorKey } from '../../lib/errors';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Dialog } from '../../components/ui/dialog';
import { Field, Input, Select, Textarea } from '../../components/ui/input';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback';

const STATUS_KEY = {
  draft: 'common.draft',
  published: 'common.published',
  archived: 'common.archived',
} as const;

const STATUS_VARIANT = {
  draft: 'default',
  published: 'success',
  archived: 'outline',
} as const;

interface CreateForm {
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

function emptyForm(): CreateForm {
  return {
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
  };
}

export function AdminEntranceTestsPage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(emptyForm);
  const [formError, setFormError] = useState<TranslationKey | null>(null);
  const [actionError, setActionError] = useState<TranslationKey | null>(null);
  const [message, setMessage] = useState<TranslationKey | null>(null);
  const [publishTarget, setPublishTarget] = useState<AdminEntranceTest | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminEntranceTest | null>(null);

  const tests = useQuery({ queryKey: ['admin-entrance-tests'], queryFn: api.admin.entranceTests });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-entrance-tests'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] }),
    ]);
  };

  const create = useMutation({
    mutationFn: (input: EntranceTestInput) => api.admin.createEntranceTest(input),
    onSuccess: async (data) => {
      await refresh();
      setCreateOpen(false);
      setForm(emptyForm());
      setFormError(null);
      navigate(`/admin/entrance/${data.test.id}`);
    },
    onError: (error) => setFormError(errorKey(error)),
  });

  const publish = useMutation({
    mutationFn: (id: string) => api.admin.publishEntranceTest(id),
    onSuccess: async () => {
      setPublishTarget(null);
      setActionError(null);
      setMessage('admin.testPublished');
      await refresh();
    },
    onError: (error) => {
      setPublishTarget(null);
      setActionError(errorKey(error));
    },
  });

  const unpublish = useMutation({
    mutationFn: (id: string) => api.admin.unpublishEntranceTest(id),
    onSuccess: async () => {
      setActionError(null);
      setMessage('admin.testUpdated');
      await refresh();
    },
    onError: (error) => setActionError(errorKey(error)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.admin.deleteEntranceTest(id),
    onSuccess: async () => {
      setDeleteTarget(null);
      setActionError(null);
      setMessage('admin.testDeleted');
      await refresh();
    },
    onError: (error) => {
      setDeleteTarget(null);
      setActionError(errorKey(error));
    },
  });

  function submitCreate() {
    const input = {
      slug: form.slug,
      titleUz: form.titleUz,
      titleRu: form.titleRu,
      titleEn: form.titleEn,
      descriptionUz: form.descriptionUz.trim() || null,
      descriptionRu: form.descriptionRu.trim() || null,
      descriptionEn: form.descriptionEn.trim() || null,
      subject: form.subject,
      difficulty: form.difficulty,
      durationSeconds: Math.round(Number(form.durationMinutes) * 60),
    };
    const parsed = entranceTestInputSchema.safeParse(input);
    if (!parsed.success) {
      setFormError('admin.requiredFields');
      return;
    }
    setFormError(null);
    create.mutate(parsed.data as EntranceTestInput);
  }

  function title(test: AdminEntranceTest): string {
    if (language === 'ru') return test.titleRu || test.titleUz;
    if (language === 'en') return test.titleEn || test.titleUz;
    return test.titleUz;
  }

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title={t('admin.entranceTests')}
        subtitle={t('admin.testList')}
        actions={
          <Button
            onClick={() => {
              setForm(emptyForm());
              setFormError(null);
              setCreateOpen(true);
            }}
            leftIcon={<Plus className="h-4 w-4" />}
            size="sm"
          >
            {t('admin.createTest')}
          </Button>
        }
      />

      <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs font-medium text-muted-foreground">
        {t('admin.entranceNeeds20')}
      </p>

      {actionError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {t(actionError)}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">{t(message)}</p>
      ) : null}

      {tests.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_value, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : tests.isError ? (
        <ErrorState
          title={t('common.errorTitle')}
          message={t(errorKey(tests.error))}
          onRetry={() => void tests.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : tests.data!.tests.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-6 w-6" />}
          title={t('admin.noTests')}
          message={t('admin.createFirstTest')}
          action={
            <Button onClick={() => setCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
              {t('admin.createTest')}
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t('admin.testList')}</th>
                  <th className="px-4 py-3 font-medium">{t('admin.slug')}</th>
                  <th className="px-4 py-3 font-medium">{t('admin.subject')}</th>
                  <th className="px-4 py-3 font-medium">{t('admin.durationSeconds')}</th>
                  <th className="px-4 py-3 text-center font-medium">{t('admin.questions')}</th>
                  <th className="px-4 py-3 font-medium">{t('common.status')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tests.data!.tests.map((test) => {
                  const ready = test.questionCount === ENTRANCE_QUESTIONS_PER_TEST;
                  return (
                    <tr key={test.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{title(test)}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {t(`difficulty.${test.difficulty}` as TranslationKey)}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{test.slug}</td>
                      <td className="px-4 py-3 text-xs">{test.subject}</td>
                      <td className="px-4 py-3 text-xs">{formatDuration(test.durationSeconds, language, 'long')}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={ready ? 'font-bold text-success' : 'font-bold text-destructive'}>
                          {test.questionCount}
                        </span>
                        <span className="text-muted-foreground"> / {ENTRANCE_QUESTIONS_PER_TEST}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[test.status]}>{t(STATUS_KEY[test.status])}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            to={`/admin/entrance/${test.id}`}
                            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                          >
                            {t('admin.editTest')}
                          </Link>
                          {test.status === 'published' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => unpublish.mutate(test.id)}
                              loading={unpublish.isPending && unpublish.variables === test.id}
                              leftIcon={<Undo2 className="h-3.5 w-3.5" />}
                            >
                              {t('admin.unpublish')}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="success"
                              disabled={!ready}
                              title={!ready ? t('admin.entranceNeeds20') : undefined}
                              onClick={() => setPublishTarget(test)}
                              leftIcon={<Rocket className="h-3.5 w-3.5" />}
                            >
                              {t('admin.publishTest')}
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:bg-destructive/10"
                            aria-label={t('admin.deleteTest')}
                            onClick={() => setDeleteTarget(test)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('admin.createTest')}
        description={t('admin.entranceNeeds20')}
        className="sm:max-w-2xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={create.isPending}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submitCreate} loading={create.isPending} leftIcon={<Plus className="h-4 w-4" />}>
              {t('common.create')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {t(formError)}
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={t('admin.slug')} hint="a-z, 0-9, -">
              <Input
                value={form.slug}
                placeholder="matematika-2026"
                onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
              />
            </Field>
            <Field label={t('admin.subject')}>
              <Input
                value={form.subject}
                onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
              />
            </Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label={t('admin.titleUz')}>
              <Input
                value={form.titleUz}
                onChange={(event) => setForm((current) => ({ ...current, titleUz: event.target.value }))}
              />
            </Field>
            <Field label={t('admin.titleRu')}>
              <Input
                value={form.titleRu}
                onChange={(event) => setForm((current) => ({ ...current, titleRu: event.target.value }))}
              />
            </Field>
            <Field label={t('admin.titleEn')}>
              <Input
                value={form.titleEn}
                onChange={(event) => setForm((current) => ({ ...current, titleEn: event.target.value }))}
              />
            </Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label={t('admin.descriptionUz')}>
              <Textarea
                rows={2}
                value={form.descriptionUz}
                onChange={(event) =>
                  setForm((current) => ({ ...current, descriptionUz: event.target.value }))
                }
              />
            </Field>
            <Field label={t('admin.descriptionRu')}>
              <Textarea
                rows={2}
                value={form.descriptionRu}
                onChange={(event) =>
                  setForm((current) => ({ ...current, descriptionRu: event.target.value }))
                }
              />
            </Field>
            <Field label={t('admin.descriptionEn')}>
              <Textarea
                rows={2}
                value={form.descriptionEn}
                onChange={(event) =>
                  setForm((current) => ({ ...current, descriptionEn: event.target.value }))
                }
              />
            </Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={t('admin.difficulty')}>
              <Select
                value={form.difficulty}
                onChange={(event) =>
                  setForm((current) => ({ ...current, difficulty: event.target.value as Difficulty }))
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
                value={form.durationMinutes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, durationMinutes: event.target.value }))
                }
              />
            </Field>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(publishTarget)}
        onClose={() => setPublishTarget(null)}
        onConfirm={() => publishTarget && publish.mutate(publishTarget.id)}
        title={t('admin.publishConfirm')}
        description={publishTarget ? title(publishTarget) : undefined}
        confirmLabel={t('admin.publishTest')}
        loading={publish.isPending}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
        title={t('admin.deleteTest')}
        description={t('admin.deleteTestConfirm')}
        confirmLabel={t('admin.yesDelete')}
        loading={remove.isPending}
        destructive
      />
    </div>
  );
}
