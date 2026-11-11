import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Circle } from 'lucide-react';
import { formatDate } from '@zerolax/shared';
import { useI18n } from '../i18n/I18nProvider';
import { api } from '../lib/api';
import { errorKey } from '../lib/errors';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/feedback';

export function NotificationsPage() {
  const { t, language } = useI18n();
  const queryClient = useQueryClient();

  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: api.user.notifications,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['me'] }),
    ]);
  };

  const markRead = useMutation({
    mutationFn: (id: string) => api.user.markRead(id),
    onSuccess: refresh,
  });

  const markAll = useMutation({
    mutationFn: () => api.user.markAllRead(),
    onSuccess: refresh,
  });

  const unread = notifications.data?.unread ?? 0;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('notifications.title')}
        subtitle={unread > 0 ? t('notifications.unreadCount', { count: unread }) : undefined}
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => markAll.mutate()}
            loading={markAll.isPending}
            disabled={unread === 0}
            leftIcon={<CheckCheck className="h-4 w-4" />}
          >
            {t('common.markAllRead')}
          </Button>
        }
      />

      {markAll.isSuccess ? (
        <p className="mb-3 rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">
          {t('notifications.allRead')}
        </p>
      ) : null}

      {notifications.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_value, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-xl" />
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
          icon={<Bell className="h-6 w-6" />}
          title={t('notifications.empty')}
          message={t('notifications.emptyText')}
        />
      ) : (
        <div className="space-y-2">
          {notifications.data!.notifications.map((notification) => {
            const isUnread = notification.readAt === null;
            return (
              <Card
                key={notification.id}
                className={isUnread ? 'border-primary/30 bg-primary/[0.03]' : undefined}
              >
                <div className="flex items-start gap-3 p-4">
                  <span
                    className={
                      isUnread
                        ? 'mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary'
                        : 'mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground'
                    }
                  >
                    <Bell className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isUnread ? (
                        <Circle className="h-2 w-2 fill-primary text-primary" aria-label={t('common.unread')} />
                      ) : null}
                      <h2 className="text-sm font-bold leading-snug">{notification.title}</h2>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                      {notification.body}
                    </p>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {formatDate(notification.createdAt, language, { withTime: true })}
                      {notification.readAt ? ` · ${t('notifications.read')}` : ''}
                    </p>
                  </div>
                  {isUnread ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => markRead.mutate(notification.id)}
                      loading={markRead.isPending && markRead.variables === notification.id}
                    >
                      {t('common.markAllRead')}
                    </Button>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
