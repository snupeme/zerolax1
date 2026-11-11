import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Award,
  Gamepad2,
  Bell,
  Brain,
  ChevronRight,
  Coins,
  Gift,
  GraduationCap,
  History,
  LifeBuoy,
  ScrollText,
  Settings,
  Target,
  Trophy,
} from 'lucide-react';
import type { TranslationKey } from '@zerolax/shared';
import { formatDate, percentage } from '@zerolax/shared';
import { useI18n } from '../i18n/I18nProvider';
import { api } from '../lib/api';
import { errorKey } from '../lib/errors';
import { LinkButton } from '../components/LinkButton';
import { PageHeader } from '../components/PageHeader';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Avatar, CoinAmount, SectionTitle, StatCard } from '../components/ui/misc';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/feedback';

const MENU: Array<{ to: string; label: TranslationKey; icon: typeof Settings }> = [
  {to:'/exams',label:'nav.exams',icon:GraduationCap},
  {to:'/certificates',label:'study.certificates',icon:Award},
  { to: '/settings', label: 'common.settings', icon: Settings },
  { to: '/gifts', label: 'common.gifts', icon: Gift },
  { to: '/history', label: 'common.history', icon: History },
  { to: '/notifications', label: 'common.notifications', icon: Bell },
  { to: '/offer', label: 'common.offer', icon: ScrollText },
  { to: '/support', label: 'common.support', icon: LifeBuoy },
];

export function ProfilePage() {
  const { t, language } = useI18n();
  const me = useQuery({ queryKey: ['me'], queryFn: api.user.me });
  const coins = useQuery({ queryKey: ['my-coins'], queryFn: api.user.coins });

  if (me.isLoading) {
    return (
      <div className="animate-fade-in space-y-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    );
  }

  if (me.isError) {
    return (
      <div className="animate-fade-in">
        <PageHeader title={t('profile.title')} />
        <ErrorState
          title={t('common.errorTitle')}
          message={t(errorKey(me.error))}
          onRetry={() => void me.refetch()}
          retryLabel={t('common.retry')}
        />
      </div>
    );
  }

  const { profile, stats, recentIq, recentEntrance } = me.data!;
  const accuracy = percentage(stats.iqCorrect + stats.entranceCorrect, stats.iqQuestions + stats.entranceQuestions);

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title={t('profile.title')}
        actions={
          <LinkButton
            to="/settings"
            variant="ghost"
            size="sm"
            leftIcon={<Settings className="h-4 w-4" />}
          >
            {t('common.settings')}
          </LinkButton>
        }
      />

      <Card className="overflow-hidden">
        <div className="brand-gradient px-5 pb-6 pt-5 text-surface-ink">
          <div className="flex items-center gap-4">
            <Avatar name={profile.nickname} src={profile.avatarUrl} size="xl" className="ring-4 ring-surface-ink/20" />
            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold">{profile.nickname}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-surface-ink/15 px-2 py-0.5 text-[11px] font-semibold">
                  {profile.status === 'active' ? t('profile.statusActive') : t('profile.statusBlocked')}
                </span>
                <span className="rounded-full bg-surface-ink/15 px-2 py-0.5 text-[11px] font-semibold">
                  {t('profile.memberSince')}: {formatDate(profile.registeredAt, language)}
                </span>
              </div>
            </div>
          </div>
        </div>
        <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <div className="rounded-xl bg-gold/10 p-3 text-center">
            <Coins className="mx-auto h-4 w-4 text-gold-deep dark:text-gold-deep" />
            <p className="mt-1 text-xl font-bold text-gold-deep dark:text-gold-deep">
              {profile.coinsBalance}
            </p>
            <p className="text-[11px] font-medium text-muted-foreground">{t('profile.coinBalance')}</p>
          </div>
          <div className="rounded-xl bg-primary/10 p-3 text-center">
            <Brain className="mx-auto h-4 w-4 text-primary" />
            <p className="mt-1 text-xl font-bold text-primary">{stats.iqCompleted}</p>
            <p className="text-[11px] font-medium text-muted-foreground">{t('profile.iqTests')}</p>
          </div>
          <div className="rounded-xl bg-navy/10 p-3 text-center">
            <GraduationCap className="mx-auto h-4 w-4 text-navy dark:text-surface-ink" />
            <p className="mt-1 text-xl font-bold text-navy dark:text-surface-ink">
              {stats.entranceCompleted}
            </p>
            <p className="text-[11px] font-medium text-muted-foreground">{t('profile.entranceTests')}</p>
          </div>
          <div className="rounded-xl bg-success/10 p-3 text-center">
            <Target className="mx-auto h-4 w-4 text-success" />
            <p className="mt-1 text-xl font-bold text-success">{accuracy}%</p>
            <p className="text-[11px] font-medium text-muted-foreground">{t('common.percent')}</p>
          </div>
        </CardContent>
      </Card>

      <section>
        <SectionTitle title={t('profile.account')} icon={<Trophy className="h-4 w-4" />} />
        <Card>
          <CardContent className="divide-y divide-border p-0">
            <InfoRow label={t('common.language')} value={profile.language.toUpperCase()} />
            <InfoRow label={t('profile.registered')} value={formatDate(profile.registeredAt, language, { withTime: true })} />
          </CardContent>
        </Card>
      </section>

      <section>
        <SectionTitle title={t('profile.statistics')} icon={<Target className="h-4 w-4" />} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={<Brain className="h-[18px] w-[18px]" />}
            label={t('iq.totalCorrect')}
            value={stats.iqCorrect}
            accent="primary"
          />
          <StatCard
            icon={<Brain className="h-[18px] w-[18px]" />}
            label={t('common.questions')}
            value={stats.iqQuestions}
          />
          <StatCard
            icon={<GraduationCap className="h-[18px] w-[18px]" />}
            label={t('entrance.correctAnswers')}
            value={stats.entranceCorrect}
            accent="violet"
          />
          <StatCard
            icon={<Coins className="h-[18px] w-[18px]" />}
            label={t('common.earned')}
            value={stats.coinsEarned}
            accent="amber"
          />
        </div>
      </section>

      <section>
        <SectionTitle title={t('profile.achievements')} icon={<Award className="h-4 w-4" />} />
        {stats.achievements.length === 0 ? (
          <EmptyState
            icon={<Award className="h-5 w-5" />}
            title={t('profile.noAchievements')}
            message={t('profile.noTestsYet')}
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {stats.achievements.map((achievement) => (
              <div
                key={achievement.code}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold/10 text-lg">
                  {achievement.icon}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{achievement.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{achievement.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle title={t('profile.recentTests')} icon={<History className="h-4 w-4" />} />
        {recentIq.length === 0 && recentEntrance.length === 0 ? (
          <EmptyState
            icon={<History className="h-5 w-5" />}
            title={t('profile.noTestsYet')}
            message={t('common.noData')}
            action={
              <LinkButton to="/iq" size="sm">
                {t('iq.start')}
              </LinkButton>
            }
          />
        ) : (
          <div className="space-y-2">
            {recentIq.map((item) => (
              <Link
                key={item.attemptId}
                to={
                  item.status === 'in_progress'
                    ? `/iq/play/${item.testId}`
                    : item.resultAvailable
                      ? `/iq/result/${item.testId}`
                      : '/history'
                }
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 transition-colors hover:bg-muted/60"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Brain className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(item.testDate, language)}</p>
                </div>
                {item.resultAvailable && item.totalCorrect !== null ? (
                  <Badge variant="success">
                    {item.totalCorrect}/{item.totalQuestions}
                  </Badge>
                ) : (
                  <Badge variant="warning">{t('history.pending')}</Badge>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
            {recentEntrance.map((item) => (
              <Link
                key={item.attemptId}
                to={item.status === 'in_progress' ? '/entrance' : `/entrance/result/${item.attemptId}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 transition-colors hover:bg-muted/60"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-navy/10 text-navy dark:text-surface-ink">
                  <GraduationCap className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.testTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(item.attemptDate, language)}
                  </p>
                </div>
                {item.percent !== null ? (
                  <Badge variant="primary">{item.percent}%</Badge>
                ) : (
                  <Badge variant="warning">{t('entrance.resume')}</Badge>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle
          title={t('profile.coinHistory')}
          icon={<Coins className="h-4 w-4" />}
          action={
            coins.data ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-gold-deep dark:text-gold-deep">
                <Coins className="h-3.5 w-3.5" />
                {profile.coinsBalance}
              </span>
            ) : null
          }
        />
        {coins.isLoading ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : coins.isError ? (
          <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            {t(errorKey(coins.error))}
          </p>
        ) : coins.data!.transactions.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            {t('profile.noCoins')}
          </p>
        ) : (
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {coins.data!.transactions.slice(0, 12).map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {transaction.description ?? transaction.type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(transaction.createdAt, language, { withTime: true })}
                    </p>
                  </div>
                  <CoinAmount
                    value={transaction.amount > 0 ? `+${transaction.amount}` : String(transaction.amount)}
                    className={transaction.amount > 0 ? 'text-success' : 'text-destructive'}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      <section>
        <SectionTitle title={t('profile.menu')} icon={<Settings className="h-4 w-4" />} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MENU.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-3 text-sm font-medium transition-colors hover:bg-muted/60"
            >
              <item.icon className="h-4 w-4 text-primary" />
              <span className="truncate">{t(item.label)}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="truncate text-sm font-medium">{value}</span>
    </div>
  );
}
