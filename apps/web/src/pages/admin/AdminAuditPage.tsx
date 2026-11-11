import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, Search } from 'lucide-react';
import { formatDate } from '@zerolax/shared';
import { useI18n } from '../../i18n/I18nProvider';
import { api } from '../../lib/api';
import { errorKey } from '../../lib/errors';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/ui/badge';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback';

function detailsText(details: unknown): string {
  if (details === null || details === undefined) return '—';
  if (typeof details === 'string') return details;
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

export function AdminAuditPage() {
  const { t, language } = useI18n();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const audit = useQuery({ queryKey: ['admin-audit'], queryFn: api.admin.audit });

  const logs = (audit.data?.logs ?? []).filter((log) => {
    if (!deferredSearch) return true;
    return [log.action, log.entityType ?? '', log.adminEmail ?? '', log.entityId ?? '']
      .join(' ')
      .toLowerCase()
      .includes(deferredSearch);
  });

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title={t('admin.auditLog')}
        subtitle={t('admin.logs')}
        actions={<Badge variant="outline">{audit.data?.logs.length ?? 0}</Badge>}
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('common.search')}
          className="pl-9"
          aria-label={t('common.search')}
        />
      </div>

      {audit.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_value, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : audit.isError ? (
        <ErrorState
          title={t('common.errorTitle')}
          message={t(errorKey(audit.error))}
          onRetry={() => void audit.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : logs.length === 0 ? (
        <EmptyState icon={<ScrollText className="h-6 w-6" />} title={t('admin.noAudit')} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t('admin.auditDate')}</th>
                  <th className="px-4 py-3 font-medium">{t('admin.email')}</th>
                  <th className="px-4 py-3 font-medium">{t('admin.auditAction')}</th>
                  <th className="px-4 py-3 font-medium">{t('admin.auditEntity')}</th>
                  <th className="px-4 py-3 font-medium">{t('admin.auditDetails')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log) => (
                  <tr key={log.id} className="align-top hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {formatDate(log.createdAt, language, { withTime: true })}
                    </td>
                    <td className="px-4 py-3 text-xs">{log.adminEmail ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant="primary" className="font-mono text-[10px]">
                        {log.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {log.entityType ? (
                        <>
                          <span className="font-medium">{log.entityType}</span>
                          {log.entityId ? (
                            <span className="block max-w-[180px] truncate font-mono text-[10px] text-muted-foreground">
                              {log.entityId}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {detailsText(log.details) === '—' ? (
                        '—'
                      ) : (
                        <details className="group">
                          <summary className="cursor-pointer text-primary">
                            {detailsText(log.details).replace(/\s+/g, ' ').slice(0, 48)}
                            {detailsText(log.details).length > 48 ? '…' : ''}
                          </summary>
                          <pre className="mt-2 max-h-56 max-w-[360px] overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-2 text-[10px] leading-relaxed text-muted-foreground">
                            {detailsText(log.details)}
                          </pre>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
