import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Brain, ChevronRight, Clock, GraduationCap, History as HistoryIcon } from 'lucide-react';
import type { EntranceHistoryItem, IqHistoryItem } from '@zerolax/shared';
import { formatDate } from '@zerolax/shared';
import { useI18n } from '../i18n/I18nProvider';
import { api } from '../lib/api';
import { errorKey } from '../lib/errors';
import { cn } from '../lib/utils';
import { Countdown } from '../components/Countdown';
import { PageHeader } from '../components/PageHeader';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/feedback';

type Tab = 'all' | 'iq' | 'entrance';

export function HistoryPage() {
  const { t, language } = useI18n();
  const [tab, setTab] = useState<Tab>('all');
  const history = useQuery({ queryKey: ['history'], queryFn: api.user.history });

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'all', label: t('history.tabAll') },
    { key: 'iq', label: t('history.tabIq') },
    { key: 'entrance', label: t('history.tabEntrance') },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title={t('common.history')} subtitle={t('history.subtitle')} />

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 no-scrollbar">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              'flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
              tab === item.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {history.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_value, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : history.isError ? (
        <ErrorState
          title={t('common.errorTitle')}
          message={t(errorKey(history.error))}
          onRetry={() => void history.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : (
        <div className="space-y-6">
          {tab !== 'entrance' ? (
            <section>
              {tab === 'all' ? (
                <h2 className="mb-2.5 flex items-center gap-2 text-sm font-bold">
                  <Brain className="h-4 w-4 text-primary" />
                  {t('history.tabIq')}
                </h2>
              ) : null}
              {history.data!.iq.length === 0 ? (
                <EmptyState
                  icon={<HistoryIcon className="h-5 w-5" />}
                  title={t('history.emptyIq')}
                  message={t('iq.noTestText')}
                />
              ) : (
                <div className="space-y-2">
                  {history.data!.iq.map((item) => (
                    <IqRow key={item.attemptId} item={item} language={language} />
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {tab !== 'iq' ? (
            <section>
              {tab === 'all' ? (
                <h2 className="mb-2.5 flex items-center gap-2 text-sm font-bold">
                  <GraduationCap className="h-4 w-4 text-navy dark:text-surface-ink" />
                  {t('history.tabEntrance')}
                </h2>
              ) : null}
              {history.data!.entrance.length === 0 ? (
                <EmptyState
                  icon={<HistoryIcon className="h-5 w-5" />}
                  title={t('history.emptyEntrance')}
                  message={t('entrance.noTestsText')}
                />
              ) : (
                <div className="space-y-2">
                  {history.data!.entrance.map((item) => (
                    <EntranceRow key={item.attemptId} item={item} language={language} />
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function IqRow({
  item,
  language,
}: {
  item: IqHistoryItem;
  language: 'uz' | 'ru' | 'en';
}) {
  const { t } = useI18n();
  const to =
    item.status === 'in_progress'
      ? `/iq/play/${item.testId}`
      : item.resultAvailable
        ? `/iq/result/${item.testId}`
        : null;

  const statusBadge =
    item.status === 'in_progress' ? (
      <Badge variant="primary">{t('iq.resume')}</Badge>
    ) : item.resultAvailable ? (
      <Badge variant="success">{t('iq.resultReady')}</Badge>
    ) : (
      <Badge variant="warning">{t('history.pending')}</Badge>
    );

  const body = (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Brain className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold">{item.title}</p>
          {statusBadge}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(item.testDate, language)}</p>
        {!item.resultAvailable && item.releaseAt && item.status !== 'in_progress' ? (
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {t('iq.releasePending')}: <Countdown target={item.releaseAt} className="font-semibold" />
          </p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold">
          {item.resultAvailable && item.totalCorrect !== null
            ? `${item.totalCorrect}/${item.totalQuestions}`
            : item.status === 'in_progress'
              ? t('iq.resume')
              : '—'}
        </p>
        {item.resultAvailable && item.coinsEarned !== null ? (
          <p className="text-[11px] font-semibold text-gold-deep dark:text-gold-deep">
            +{item.coinsEarned} {t('common.coins')}
          </p>
        ) : null}
      </div>
      {to ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
    </>
  );

  return to ? (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 transition-colors hover:bg-muted/60"
    >
      {body}
    </Link>
  ) : (
    <Card className="flex items-center gap-3 px-3.5 py-3">{body}</Card>
  );
}

function EntranceRow({
  item,
  language,
}: {
  item: EntranceHistoryItem;
  language: 'uz' | 'ru' | 'en';
}) {
  const { t } = useI18n();
  const to =
    item.status === 'in_progress' ? '/entrance' : `/entrance/result/${item.attemptId}`;
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 transition-colors hover:bg-muted/60"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy/10 text-navy dark:text-surface-ink">
        <GraduationCap className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold">{item.testTitle}</p>
          {item.status === 'in_progress' ? (
            <Badge variant="primary">{t('entrance.resume')}</Badge>
          ) : item.status === 'expired' ? (
            <Badge variant="warning">{t('entrance.timeUp')}</Badge>
          ) : (
            <Badge variant="success">{t('entrance.submitted')}</Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(item.attemptDate, language)}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold">
          {item.status === 'in_progress' ? t('entrance.resume') : item.percent !== null ? `${item.percent}%` : '—'}
        </p>
        {item.coinsEarned !== null ? (
          <p className="text-[11px] font-semibold text-gold-deep dark:text-gold-deep">
            +{item.coinsEarned} {t('common.coins')}
          </p>
        ) : null}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
