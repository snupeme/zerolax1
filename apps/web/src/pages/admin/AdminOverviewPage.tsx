import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Bell,
  Brain,
  Coins,
  GraduationCap,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import { formatDate } from '@zerolax/shared';
import { useI18n } from '../../i18n/I18nProvider';
import { api } from '../../lib/api';
import { errorKey } from '../../lib/errors';
import { PageHeader } from '../../components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { StatCard } from '../../components/ui/misc';
import { ErrorState, Skeleton } from '../../components/ui/feedback';

export function AdminOverviewPage() {
  const { t, language } = useI18n();
  const overview = useQuery({ queryKey: ['admin-overview'], queryFn: api.admin.overview });

  if (overview.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-56" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_value, index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (overview.isError) {
    return (
      <div>
        <PageHeader title={t('admin.overview')} />
        <ErrorState
          title={t('common.errorTitle')}
          message={t(errorKey(overview.error))}
          onRetry={() => void overview.refetch()}
          retryLabel={t('common.retry')}
        />
      </div>
    );
  }

  const data = overview.data!;
  const series = data.series.slice(-14);
  const maxValue = Math.max(1, ...series.flatMap((point) => [point.iq, point.entrance, point.users]));

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader title={t('admin.overview')} subtitle={t('admin.dashboard')} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard icon={<Users className="h-[18px] w-[18px]" />} label={t('admin.totalUsers')} value={data.totalUsers} />
        <StatCard
          icon={<UserPlus className="h-[18px] w-[18px]" />}
          label={t('admin.newUsersToday')}
          value={data.newUsersToday}
          accent="sky"
        />
        <StatCard
          icon={<Activity className="h-[18px] w-[18px]" />}
          label={t('admin.activeToday')}
          value={data.activeToday}
          accent="success"
        />
        <StatCard
          icon={<Brain className="h-[18px] w-[18px]" />}
          label={t('admin.iqToday')}
          value={data.iqToday}
          accent="primary"
        />
        <StatCard
          icon={<GraduationCap className="h-[18px] w-[18px]" />}
          label={t('admin.entranceToday')}
          value={data.entranceToday}
          accent="violet"
        />
        <StatCard
          icon={<Coins className="h-[18px] w-[18px]" />}
          label={t('admin.coinsDistributed')}
          value={data.coinsDistributed}
          accent="amber"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              {t('admin.participation')}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{t('admin.last14Days')}</p>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap items-center gap-3 text-xs font-medium">
              <Legend color="bg-primary" label={t('admin.iq')} />
              <Legend color="bg-copper" label={t('admin.entrance')} />
              <Legend color="bg-success" label={t('admin.activeToday')} />
            </div>
            <div className="flex h-44 items-end gap-1.5 overflow-x-auto pb-1">
              {series.map((point) => (
                <div key={point.date} className="flex min-w-[30px] flex-1 flex-col items-center gap-1">
                  <div className="flex h-36 w-full items-end justify-center gap-0.5">
                    <Bar value={point.iq} max={maxValue} className="bg-primary" title={`${t('admin.iq')}: ${point.iq}`} />
                    <Bar
                      value={point.entrance}
                      max={maxValue}
                      className="bg-copper"
                      title={`${t('admin.entrance')}: ${point.entrance}`}
                    />
                    <Bar value={point.users} max={maxValue} className="bg-success" title={`${t('admin.activeToday')}: ${point.users}`} />
                  </div>
                  <span className="text-[9px] leading-none text-muted-foreground">{point.date.slice(5)}</span>
                </div>
              ))}
            </div>
            {series.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('common.noData')}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              {t('admin.notificationsSent')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{data.notificationsSent}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('admin.notifications')}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('common.today')}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 font-medium">{t('common.date')}</th>
                <th className="pb-2 text-right font-medium">{t('admin.iq')}</th>
                <th className="pb-2 text-right font-medium">{t('admin.entrance')}</th>
                <th className="pb-2 text-right font-medium">{t('admin.activeToday')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {series.slice(-7).reverse().map((point) => (
                <tr key={point.date}>
                  <td className="py-2">{formatDate(point.date, language, { short: true })}</td>
                  <td className="py-2 text-right font-semibold">{point.iq}</td>
                  <td className="py-2 text-right font-semibold">{point.entrance}</td>
                  <td className="py-2 text-right font-semibold">{point.users}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Bar({
  value,
  max,
  className,
  title,
}: {
  value: number;
  max: number;
  className: string;
  title: string;
}) {
  return (
    <div
      title={title}
      className={`min-h-[3px] w-2 rounded-t ${className}`}
      style={{ height: `${Math.max(3, (value / max) * 100)}%` }}
    />
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  );
}
