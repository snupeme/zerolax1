import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Brain, Plus, Rocket, Trash2 } from 'lucide-react';
import {
  IQ_QUESTIONS_PER_TEST,
  formatDate,
  iqTestInputSchema,
  tashkentDateString,
  type AdminIqTest,
  type TranslationKey,
} from '@zerolax/shared';
import { useI18n } from '../../i18n/I18nProvider';
import { api } from '../../lib/api';
import { errorKey } from '../../lib/errors';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Dialog } from '../../components/ui/dialog';
import { Field, Input } from '../../components/ui/input';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback';

const STATUS_KEY = {
  draft: 'common.draft',
  scheduled: 'common.scheduled',
  published: 'common.published',
  archived: 'common.archived',
} as const;

const STATUS_VARIANT = {
  draft: 'default',
  scheduled: 'warning',
  published: 'success',
  archived: 'outline',
} as const;

interface CreateForm {
  testDate: string;
  titleUz: string;
  titleRu: string;
  titleEn: string;
}

function emptyForm(): CreateForm {
  return { testDate: tashkentDateString(), titleUz: '', titleRu: '', titleEn: '' };
}

export function AdminIqTestsPage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(emptyForm);
  const [formError, setFormError] = useState<TranslationKey | null>(null);
  const [actionError, setActionError] = useState<TranslationKey | null>(null);
  const [message, setMessage] = useState<TranslationKey | null>(null);
  const [publishTarget, setPublishTarget] = useState<AdminIqTest | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminIqTest | null>(null);

  const tests = useQuery({ queryKey: ['admin-iq-tests'], queryFn: api.admin.iqTests });

  const create = useMutation({
    mutationFn: (input: CreateForm) => api.admin.createIqTest(input),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['admin-iq-tests'] });
      setCreateOpen(false);
      setForm(emptyForm());
      setFormError(null);
      navigate(`/admin/iq/${data.test.id}`);
    },
    onError: (error) => setFormError(errorKey(error)),
  });

  const publish = useMutation({
    mutationFn: (id: string) => api.admin.publishIqTest(id),
    onSuccess: async () => {
      setPublishTarget(null);
      setActionError(null);
      setMessage('admin.testPublished');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-iq-tests'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-overview'] }),
      ]);
    },
    onError: (error) => {
      setPublishTarget(null);
      setActionError(errorKey(error));
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.admin.deleteIqTest(id),
    onSuccess: async () => {
      setDeleteTarget(null);
      setActionError(null);
      setMessage('admin.testDeleted');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-iq-tests'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-overview'] }),
      ]);
    },
    onError: (error) => {
      setDeleteTarget(null);
      setActionError(errorKey(error));
    },
  });

  function submitCreate() {
    const parsed = iqTestInputSchema.safeParse(form);
    if (!parsed.success) {
      setFormError('admin.requiredFields');
      return;
    }
    setFormError(null);
    create.mutate(parsed.data);
  }

  function title(test: AdminIqTest): string {
    if (language === 'ru') return test.titleRu || test.titleUz;
    if (language === 'en') return test.titleEn || test.titleUz;
    return test.titleUz;
  }

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title={t('admin.iqTests')}
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
        {t('admin.iqNeeds10')}
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
          {Array.from({ length: 5 }).map((_value, index) => (
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
          icon={<Brain className="h-6 w-6" />}
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
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t('admin.testDate')}</th>
                  <th className="px-4 py-3 font-medium">{t('admin.testList')}</th>
                  <th className="px-4 py-3 text-center font-medium">{t('admin.questions')}</th>
                  <th className="px-4 py-3 font-medium">{t('common.status')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tests.data!.tests.map((test) => {
                  const ready = test.questionCount === IQ_QUESTIONS_PER_TEST;
                  return (
                    <tr key={test.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-xs font-medium">
                        {formatDate(test.testDate, language, { short: true })}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{title(test)}</p>
                        {test.releaseAt ? (
                          <p className="text-[11px] text-muted-foreground">
                            {t('iq.releaseAt', {
                              date: formatDate(test.releaseAt, language, { withTime: true }),
                            })}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={ready ? 'font-bold text-success' : 'font-bold text-destructive'}>
                          {test.questionCount}
                        </span>
                        <span className="text-muted-foreground"> / {IQ_QUESTIONS_PER_TEST}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[test.status]}>{t(STATUS_KEY[test.status])}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            to={`/admin/iq/${test.id}`}
                            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                          >
                            {t('admin.editTest')}
                          </Link>
                          {test.status !== 'published' && test.status !== 'archived' ? (
                            <Button
                              size="sm"
                              variant="success"
                              disabled={!ready}
                              title={!ready ? t('admin.iqNeeds10') : undefined}
                              onClick={() => setPublishTarget(test)}
                              leftIcon={<Rocket className="h-3.5 w-3.5" />}
                            >
                              {t('admin.publishTest')}
                            </Button>
                          ) : null}
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
        description={t('admin.iqNeeds10')}
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
          <Field label={t('admin.testDate')} htmlFor="iq-date">
            <Input
              id="iq-date"
              type="date"
              value={form.testDate}
              onChange={(event) => setForm((current) => ({ ...current, testDate: event.target.value }))}
            />
          </Field>
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
