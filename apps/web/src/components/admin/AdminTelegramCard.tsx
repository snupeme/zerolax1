import { useQuery } from '@tanstack/react-query';
import { useAdminAuth } from '../../auth/AdminAuthProvider';
import { useI18n } from '../../i18n/I18nProvider';
import { api } from '../../lib/api';
import { control } from '../../lib/admin-control';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

/** Identity is fetched only from the dedicated, permission-checked admin endpoint. */
export function AdminTelegramCard({ userId }: { userId: string }) {
  const { t } = useI18n();
  const { session } = useAdminAuth();
  const permissions = useQuery({
    queryKey: ['control-permissions', session?.admin.id],
    queryFn: () => control<{ permissions: string[] }>('/me'),
    staleTime: 0,
  });
  const allowed = permissions.data?.permissions.includes('users.read') && permissions.data.permissions.includes('users.private');
  const telegram = useQuery({
    queryKey: ['admin-telegram-identity', session?.admin.id, userId],
    queryFn: () => api.admin.userTelegram(userId),
    enabled: !!allowed,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  if (!allowed) return null;
  if (telegram.isError) return <p role="alert" className="text-destructive">{t('common.errorTitle')}</p>;
  if (!telegram.data) return <div aria-busy="true" className="h-24 animate-pulse rounded-xl bg-muted" />;
  const identity = telegram.data;
  const fields = [
    [t('admin.telegramId'), identity.telegramId],
    [t('admin.telegramUsername'), identity.username ? `@${identity.username}` : t('profile.notSet')],
    [t('admin.telegramFirstName'), identity.firstName ?? t('profile.notSet')],
    [t('admin.telegramLastName'), identity.lastName ?? t('profile.notSet')],
    [t('admin.telegramLinked'), identity.linked ? t('admin.telegramConnected') : t('admin.telegramDisconnected')],
  ];
  return <Card><CardHeader><CardTitle>{t('admin.telegramAccount')}</CardTitle></CardHeader><CardContent><dl className="grid gap-3 text-sm sm:grid-cols-2">{fields.map(([label,value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-words font-semibold">{value}</dd></div>)}</dl></CardContent></Card>;
}
