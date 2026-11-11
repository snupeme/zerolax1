import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  MessageSquare,
  Send,
  XCircle,
} from 'lucide-react';
import {
  formatDate,
  notificationInputSchema,
  type NotificationInput as NotificationPayload,
  type TranslationKey,
} from '@zerolax/shared';
import { useI18n } from '../../i18n/I18nProvider';
import { api, type NotificationInput } from '../../lib/api';
import { errorKey } from '../../lib/errors';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Field, Input, Select, Textarea } from '../../components/ui/input';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback';

const TARGET_KEY = {
  all: 'admin.targetAll',
  active: 'admin.targetActive',
  user: 'admin.targetUser',
} as const;

const STATUS_KEY = {
  draft: 'common.draft',
  scheduled: 'admin.statusScheduled',
  sending: 'common.loading',
  sent: 'admin.statusSent',
  failed: 'admin.statusFailed',
} as const;

const KIND_KEY = {
  daily_iq: 'notifications.dailyIqTitle',
  iq_result: 'notifications.resultTitle',
  announcement: 'notifications.announcementTitle',
} as const;

type Target = 'all' | 'active' | 'user';
type ScheduleMode = 'now' | 'later';

interface FormState {
  titleUz: string;
  titleRu: string;
  titleEn: string;
  bodyUz: string;
  bodyRu: string;
  bodyEn: string;
  target: Target;
  targetUserId: string;
  scheduleMode: ScheduleMode;
  scheduleValue: string;
}

function emptyForm(): FormState {
  return {
    titleUz: '',
    titleRu: '',
    titleEn: '',
    bodyUz: '',
    bodyRu: '',
    bodyEn: '',
    target: 'all',
    targetUserId: '',
    scheduleMode: 'now',
    scheduleValue: '',
  };
}

export function AdminNotificationsPage() {
  const { t, language } = useI18n();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<TranslationKey | null>(null);
  const [message, setMessage] = useState<TranslationKey | null>(null);
  const [delivery, setDelivery] = useState<{ sent: number; failed: number } | null>(null);

  const notifications = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: api.admin.notifications,
  });
  const logs = useQuery({ queryKey: ['admin-logs'], queryFn: api.admin.logs });

  const create = useMutation({
    mutationFn: (input: NotificationInput) => api.admin.createNotification(input),
    onSuccess: async (data) => {
      setDelivery(data.delivery);
      setMessage(data.delivery ? 'admin.notificationSent' : 'admin.statusScheduled');
      setFormError(null);
      setForm(emptyForm());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-notifications'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-logs'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-audit'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-overview'] }),
      ]);
    },
    onError: (error) => {
      setDelivery(null);
      setMessage(null);
      setFormError(errorKey(error));
    },
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage(null);
    setFormError(null);
    setDelivery(null);
  }

  function submit() {
    setMessage(null);
    setDelivery(null);
    if (form.target === 'user' && !form.targetUserId.trim()) {
      setFormError('admin.targetRequired');
      return;
    }

    let scheduledAt: string | null = null;
    if (form.scheduleMode === 'later') {
      const date = new Date(form.scheduleValue);
      if (!form.scheduleValue || Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
        setFormError('admin.scheduleFuture');
        return;
      }
      scheduledAt = date.toISOString();
    }

    const input = {
      titleUz: form.titleUz,
      titleRu: form.titleRu,
      titleEn: form.titleEn,
      bodyUz: form.bodyUz,
      bodyRu: form.bodyRu,
      bodyEn: form.bodyEn,
      target: form.target,
      targetUserId: form.target === 'user' ? form.targetUserId.trim() : null,
      scheduledAt,
    };
    const parsed = notificationInputSchema.safeParse(input);
    if (!parsed.success) {
      setFormError('admin.requiredFields');
      return;
    }
    create.mutate(parsed.data as NotificationPayload as NotificationInput);
  }

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader title={t('admin.notifications')} subtitle={t('admin.sendNotification')} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            {t('admin.sendNotification')}
          </CardTitle>
          <CardDescription>{t('admin.scheduleHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {formError ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {t(formError)}
            </p>
          ) : null}
          {message ? (
            <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">
              {t(message)}
            </p>
          ) : null}
          {delivery ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="success">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                {t('admin.statusSent')}: {delivery.sent}
              </Badge>
              <Badge variant={delivery.failed > 0 ? 'destructive' : 'outline'}>
                <XCircle className="mr-1 h-3 w-3" />
                {t('admin.statusFailed')}: {delivery.failed}
              </Badge>
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={t('admin.notificationTarget')} htmlFor="notification-target">
              <Select
                id="notification-target"
                value={form.target}
                onChange={(event) => update('target', event.target.value as Target)}
              >
                <option value="all">{t('admin.targetAll')}</option>
                <option value="active">{t('admin.targetActive')}</option>
                <option value="user">{t('admin.targetUser')}</option>
              </Select>
            </Field>
            {form.target === 'user' ? (
              <Field label={t('admin.targetUser')} htmlFor="notification-user">
                <Input
                  id="notification-user"
                  value={form.targetUserId}
                  placeholder={t('admin.targetUserPlaceholder')}
                  onChange={(event) => update('targetUserId', event.target.value)}
                />
              </Field>
            ) : (
              <Field label={t('admin.scheduleAt')} htmlFor="notification-schedule-mode">
                <Select
                  id="notification-schedule-mode"
                  value={form.scheduleMode}
                  onChange={(event) => update('scheduleMode', event.target.value as ScheduleMode)}
                >
                  <option value="now">{t('admin.sendNow')}</option>
                  <option value="later">{t('admin.sendLater')}</option>
                </Select>
              </Field>
            )}
          </div>

          {form.target === 'user' || form.scheduleMode === 'later' ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {form.target === 'user' ? (
                <Field label={t('admin.scheduleAt')} htmlFor="notification-schedule-mode-user">
                  <Select
                    id="notification-schedule-mode-user"
                    value={form.scheduleMode}
                    onChange={(event) =>
                      update('scheduleMode', event.target.value as ScheduleMode)
                    }
                  >
                    <option value="now">{t('admin.sendNow')}</option>
                    <option value="later">{t('admin.sendLater')}</option>
                  </Select>
                </Field>
              ) : null}
              {form.scheduleMode === 'later' ? (
                <Field label={t('admin.scheduleAt')} htmlFor="notification-schedule">
                  <Input
                    id="notification-schedule"
                    type="datetime-local"
                    value={form.scheduleValue}
                    onChange={(event) => update('scheduleValue', event.target.value)}
                  />
                </Field>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-3">
            <Field label={t('admin.titleUz')}>
              <Input
                value={form.titleUz}
                maxLength={160}
                onChange={(event) => update('titleUz', event.target.value)}
              />
            </Field>
            <Field label={t('admin.titleRu')}>
              <Input
                value={form.titleRu}
                maxLength={160}
                onChange={(event) => update('titleRu', event.target.value)}
              />
            </Field>
            <Field label={t('admin.titleEn')}>
              <Input
                value={form.titleEn}
                maxLength={160}
                onChange={(event) => update('titleEn', event.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label={`${t('admin.message')} (UZ)`}>
              <Textarea
                rows={3}
                value={form.bodyUz}
                maxLength={2000}
                onChange={(event) => update('bodyUz', event.target.value)}
              />
            </Field>
            <Field label={`${t('admin.message')} (RU)`}>
              <Textarea
                rows={3}
                value={form.bodyRu}
                maxLength={2000}
                onChange={(event) => update('bodyRu', event.target.value)}
              />
            </Field>
            <Field label={`${t('admin.message')} (EN)`}>
              <Textarea
                rows={3}
                value={form.bodyEn}
                maxLength={2000}
                onChange={(event) => update('bodyEn', event.target.value)}
              />
            </Field>
          </div>

          <Button onClick={submit} loading={create.isPending} leftIcon={<Send className="h-4 w-4" />}>
            {form.scheduleMode === 'later' ? t('admin.sendLater') : t('admin.sendNotification')}
          </Button>
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
          <Bell className="h-4 w-4 text-primary" />
          {t('admin.notifications')}
        </h2>
        {notifications.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_value, index) => (
              <Skeleton key={index} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : notifications.isError ? (
          <ErrorState
            title={t('common.errorTitle')}
            message={t(errorKey(notifications.error))}
            onRetry={() => void notifications.refetch()}
            retryLabel={t('common.retry')}
          />
        ) : notifications.data!.notifications.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-5 w-5" />}
            title={t('common.noData')}
            message={t('admin.notifications')}
          />
        ) : (
          <div className="space-y-2">
            {notifications.data!.notifications.map((notification) => (
              <Card key={notification.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold">{notification.title}</h3>
                      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                        {notification.body}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline">
                        {t(TARGET_KEY[notification.target as Target] ?? 'admin.targetAll')}
                      </Badge>
                      <Badge
                        variant={
                          notification.status === 'failed'
                            ? 'destructive'
                            : notification.status === 'sent'
                              ? 'success'
                              : 'warning'
                        }
                      >
                        {t(
                          STATUS_KEY[notification.status as keyof typeof STATUS_KEY] ??
                            'admin.statusScheduled',
                        )}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <span>
                      {t('common.date')}:{' '}
                      {formatDate(notification.createdAt, language, { withTime: true })}
                    </span>
                    {notification.scheduledAt ? (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" />
                        {formatDate(notification.scheduledAt, language, { withTime: true })}
                      </span>
                    ) : null}
                    <span className="text-success">
                      {t('admin.statusSent')}: {notification.sentCount}
                    </span>
                    <span className="text-destructive">
                      {t('admin.statusFailed')}: {notification.failedCount}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
          <MessageSquare className="h-4 w-4 text-primary" />
          {t('admin.deliveryLogs')}
        </h2>
        {logs.isLoading ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : logs.isError ? (
          <ErrorState
            title={t('common.errorTitle')}
            message={t(errorKey(logs.error))}
            onRetry={() => void logs.refetch()}
            retryLabel={t('common.retry')}
          />
        ) : logs.data!.logs.length === 0 ? (
          <EmptyState icon={<MessageSquare className="h-5 w-5" />} title={t('admin.noLogs')} />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">{t('admin.nickname')}</th>
                    {logs.data!.logs.some(l=>l.telegramId!==undefined) && <th className="px-4 py-2.5 font-medium">{t('admin.telegramId')}</th>}
                    <th className="px-4 py-2.5 font-medium">{t('admin.notifications')}</th>
                    <th className="px-4 py-2.5 font-medium">{t('common.status')}</th>
                    <th className="px-4 py-2.5 font-medium">{t('common.date')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.data!.logs.slice(0, 50).map((log) => (
                    <tr key={log.id}>
                      <td className="px-4 py-2.5">{log.nickname ?? '—'}</td>
                      {logs.data!.logs.some(l=>l.telegramId!==undefined) && <td className="px-4 py-2.5 font-mono text-xs">{log.telegramId}</td>}
                      <td className="px-4 py-2.5 text-xs">
                        {t(
                          KIND_KEY[log.kind as keyof typeof KIND_KEY] ??
                            'notifications.announcementTitle',
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={log.status === 'sent' ? 'success' : 'destructive'}>
                          {log.status === 'sent'
                            ? t('admin.statusSent')
                            : t('admin.statusFailed')}
                        </Badge>
                        {log.error ? (
                          <p className="mt-1 max-w-[240px] truncate text-[10px] text-destructive">
                            {log.error}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {formatDate(log.createdAt, language, { withTime: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}
