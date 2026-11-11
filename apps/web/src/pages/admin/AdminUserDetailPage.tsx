import { AdminTelegramCard } from '../../components/admin/AdminTelegramCard';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import {
  Ban,
  Brain,
  Coins,
  GraduationCap,
  ShieldCheck,
  Unlock,
  UserRound,
} from 'lucide-react';
import { coinAdjustmentSchema, formatDate, percentage } from '@zerolax/shared';
import type { TranslationKey } from '@zerolax/shared';
import { useI18n } from '../../i18n/I18nProvider';
import { api } from '../../lib/api';
import { errorKey } from '../../lib/errors';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Field, Input } from '../../components/ui/input';
import { Avatar, CoinAmount, StatCard } from '../../components/ui/misc';
import { ErrorState, LoadingScreen } from '../../components/ui/feedback';
import { UserControlDetails } from '../../components/admin/UserControlDetails';
import {useControlWords} from '../../lib/admin-control';

export function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, language } = useI18n();
  const controlWords=useControlWords();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<TranslationKey | null>(null);
  const [actionError, setActionError] = useState<TranslationKey | null>(null);
  const [newBalance, setNewBalance] = useState<number | null>(null);

  const user = useQuery({
    queryKey: ['admin-user', id],
    queryFn: () => api.admin.user(id!),
    enabled: Boolean(id),
  });

  const setStatus = useMutation({
    mutationFn: (status: 'active' | 'blocked') => api.admin.setUserStatus(id!, status),
    onSuccess: async () => {
      setActionError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-user', id] }),
        queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-overview'] }),
      ]);
    },
    onError: (error) => setActionError(errorKey(error)),
  });

  const adjustCoins = useMutation({
    mutationFn: (input: { amount: number; reason: string }) =>
      api.admin.adjustCoins(id!, input.amount, input.reason),
    onSuccess: async (data) => {
      setNewBalance(data.balance);
      setAmount('');
      setReason('');
      setFormError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-user', id] }),
        queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-audit'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-overview'] }),
      ]);
    },
    onError: (error) => {
      setNewBalance(null);
      setFormError(errorKey(error));
    },
  });

  if (user.isLoading) return <LoadingScreen label={t('common.loading')} />;

  if (user.isError) {
    return (
      <div>
        <PageHeader title={t('admin.userDetails')} backTo="/admin/users" />
        <ErrorState
          title={t('common.errorTitle')}
          message={t(errorKey(user.error))}
          onRetry={() => void user.refetch()}
          retryLabel={t('common.retry')}
        />
      </div>
    );
  }

  const data = user.data!;
  const { profile, stats } = data;
  const accuracy = percentage(stats.iqCorrect + stats.entranceCorrect, stats.iqQuestions + stats.entranceQuestions);

  function submitAdjustment() {
    setNewBalance(null);
    const parsed = coinAdjustmentSchema.safeParse({ amount: Number(amount), reason });
    if (!parsed.success) {
      setFormError('errors.validation');
      return;
    }
    if(window.confirm(controlWords.confirm))adjustCoins.mutate(parsed.data);
  }

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader title={t('admin.userDetails')} backTo="/admin/users" />

      <AdminTelegramCard userId={id!} />
      <UserControlDetails userId={id!}/>

      {actionError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {t(actionError)}
        </p>
      ) : null}

      <Card>
        <CardContent className="flex flex-wrap items-start gap-4 p-5">
          <Avatar name={profile.nickname} src={profile.avatarUrl} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold">{profile.nickname}</h2>
              <Badge variant={profile.status === 'active' ? 'success' : 'destructive'}>
                {profile.status === 'active' ? t('admin.statusActive') : t('admin.statusBlocked')}
              </Badge>
            </div>
            <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              <span>
                {t('admin.phone')}: <strong className="text-foreground">{data.phone ?? profile.phone ?? '—'}</strong>
              </span>
              <span>
                {t('common.language')}: <strong className="uppercase text-foreground">{profile.language}</strong>
              </span>
              <span>
                {t('admin.registeredAt')}:{' '}
                <strong className="text-foreground">
                  {formatDate(profile.registeredAt, language, { withTime: true })}
                </strong>
              </span>
            </div>
          </div>
          <Button
            variant={profile.status === 'active' ? 'destructive' : 'success'}
            loading={setStatus.isPending}
            onClick={() => {if(window.confirm(controlWords.confirm))setStatus.mutate(profile.status === 'active' ? 'blocked' : 'active');}}
            leftIcon={
              profile.status === 'active' ? <Ban className="h-4 w-4" /> : <Unlock className="h-4 w-4" />
            }
          >
            {profile.status === 'active' ? t('admin.block') : t('admin.unblock')}
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<Coins className="h-[18px] w-[18px]" />}
          label={t('admin.balance')}
          value={newBalance ?? profile.coinsBalance}
          accent="amber"
        />
        <StatCard
          icon={<Brain className="h-[18px] w-[18px]" />}
          label={t('admin.iq')}
          value={stats.iqCompleted}
          accent="primary"
          hint={`${stats.iqCorrect}/${stats.iqQuestions}`}
        />
        <StatCard
          icon={<GraduationCap className="h-[18px] w-[18px]" />}
          label={t('admin.entrance')}
          value={stats.entranceCompleted}
          accent="violet"
          hint={`${stats.entranceCorrect}/${stats.entranceQuestions}`}
        />
        <StatCard
          icon={<ShieldCheck className="h-[18px] w-[18px]" />}
          label={t('common.percent')}
          value={`${accuracy}%`}
          accent="success"
        />
      </div>

      {newBalance !== null ? (
        <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">
          {t('admin.coinsAdjusted')}: {newBalance}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-primary" />
              {t('admin.adjustCoins')}
            </CardTitle>
            <CardDescription>{t('admin.coinAdjustHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {formError ? (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                {t(formError)}
              </p>
            ) : null}
            <Field label={t('admin.amount')} htmlFor="coin-amount">
              <Input
                id="coin-amount"
                type="number"
                value={amount}
                placeholder="+10 / -5"
                onChange={(event) => {
                  setAmount(event.target.value);
                  setNewBalance(null);
                }}
              />
            </Field>
            <Field label={t('admin.reason')} htmlFor="coin-reason">
              <Input
                id="coin-reason"
                value={reason}
                maxLength={300}
                onChange={(event) => {
                  setReason(event.target.value);
                  setNewBalance(null);
                }}
              />
            </Field>
            <Button
              onClick={submitAdjustment}
              loading={adjustCoins.isPending}
              leftIcon={<Coins className="h-4 w-4" />}
            >
              {t('admin.apply')}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-primary" />
              {t('profile.achievements')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.achievements.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('profile.noAchievements')}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {stats.achievements.map((achievement) => (
                  <Badge key={achievement.code} variant="warning">
                    {achievement.icon} {achievement.title}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.coinHistory')}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.coinTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
          ) : (
            <div className="divide-y divide-border">
              {data.coinTransactions.map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between gap-3 py-2.5">
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
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('admin.iqTests')}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.iqHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('iq.noHistory')}</p>
            ) : (
              <div className="divide-y divide-border">
                {data.iqHistory.map((item) => (
                  <div key={item.attemptId} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(item.testDate, language)}</p>
                    </div>
                    <Badge variant={item.resultAvailable ? 'success' : 'warning'}>
                      {item.resultAvailable && item.totalCorrect !== null
                        ? `${item.totalCorrect}/${item.totalQuestions}`
                        : item.status === 'in_progress'
                          ? t('iq.resume')
                          : t('history.pending')}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('admin.entranceTests')}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.entranceHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('entrance.noHistory')}</p>
            ) : (
              <div className="divide-y divide-border">
                {data.entranceHistory.map((item) => (
                  <div key={item.attemptId} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.testTitle}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(item.attemptDate, language)}
                      </p>
                    </div>
                    <Badge variant={item.status === 'submitted' ? 'success' : 'warning'}>
                      {item.percent !== null
                        ? `${item.percent}%`
                        : item.status === 'in_progress'
                          ? t('entrance.resume')
                          : t('entrance.timeUp')}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
