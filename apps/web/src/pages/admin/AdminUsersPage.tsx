import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search, Users } from 'lucide-react';
import { formatDate } from '@zerolax/shared';
import { useI18n } from '../../i18n/I18nProvider';
import { api } from '../../lib/api';
import { errorKey } from '../../lib/errors';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback';

const PAGE_SIZE = 20;

export function AdminUsersPage() {
  const { t, language } = useI18n();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search.trim());

  const users = useQuery({
    queryKey: ['admin-users', deferredSearch, page],
    queryFn: () => api.admin.users({ search: deferredSearch || undefined, page, limit: PAGE_SIZE }),
  });

  const total = users.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title={t('admin.users')}
        subtitle={t('admin.allUsers')}
        actions={<Badge variant="outline">{total}</Badge>}
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder={t('admin.searchUsers')}
          className="pl-9"
          aria-label={t('admin.searchUsers')}
        />
      </div>

      {users.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_value, index) => (
            <Skeleton key={index} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : users.isError ? (
        <ErrorState
          title={t('common.errorTitle')}
          message={t(errorKey(users.error))}
          onRetry={() => void users.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : users.data!.users.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title={t('admin.noUsers')}
          message={t('common.noResults')}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t('admin.nickname')}</th>
                  {users.data?.users.some(u=>u.telegramId!==undefined) && <th className="px-4 py-3 font-medium">{t('admin.telegramId')}</th>}
                  <th className="px-4 py-3 text-right font-medium">{t('admin.coins')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('admin.testsCompleted')}</th>
                  <th className="px-4 py-3 font-medium">{t('common.status')}</th>
                  <th className="px-4 py-3 font-medium">{t('admin.registeredAt')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.data!.users.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{user.nickname}</p>
                      <p className="text-xs uppercase text-muted-foreground">{user.language}</p>
                    </td>
                    {users.data?.users.some(u=>u.telegramId!==undefined) && <td className="px-4 py-3 font-mono text-xs">{user.telegramId}</td>}
                    <td className="px-4 py-3 text-right font-semibold">{user.coinsBalance}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold">{user.iqCompleted}</span>
                      <span className="text-muted-foreground"> / {user.entranceCompleted}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={user.status === 'active' ? 'success' : 'destructive'}>
                        {user.status === 'active' ? t('admin.statusActive') : t('admin.statusBlocked')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDate(user.registeredAt, language, { short: true })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/admin/users/${user.id}`}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        {t('admin.viewDetails')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            leftIcon={<ChevronLeft className="h-4 w-4" />}
          >
            {t('common.previous')}
          </Button>
          <span className="text-xs font-medium text-muted-foreground">
            {t('common.page')} {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            rightIcon={<ChevronRight className="h-4 w-4" />}
          >
            {t('common.next')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
