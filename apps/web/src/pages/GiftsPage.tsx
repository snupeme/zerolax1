import { useQuery } from '@tanstack/react-query';
import { Gift, Info } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { api } from '../lib/api';
import { errorKey } from '../lib/errors';
import { PageHeader } from '../components/PageHeader';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { CoinAmount } from '../components/ui/misc';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/feedback';

export function GiftsPage() {
  const { t } = useI18n();
  const gifts = useQuery({ queryKey: ['gifts'], queryFn: api.user.gifts });

  return (
    <div className="animate-fade-in">
      <PageHeader title={t('gifts.title')} subtitle={t('gifts.subtitle')} />

      <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary dark:text-primary" />
        <p className="text-sm text-muted-foreground">{t('gifts.note')}</p>
      </div>

      {gifts.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_value, index) => (
            <Skeleton key={index} className="h-52 w-full rounded-xl" />
          ))}
        </div>
      ) : gifts.isError ? (
        <ErrorState
          title={t('common.errorTitle')}
          message={t(errorKey(gifts.error))}
          onRetry={() => void gifts.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : gifts.data!.gifts.length === 0 ? (
        <EmptyState
          icon={<Gift className="h-6 w-6" />}
          title={t('gifts.noGifts')}
          message={t('common.comingSoon')}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {gifts.data!.gifts.map((gift) => (
            <Card key={gift.id} className="overflow-hidden">
              {gift.imageUrl ? (
                <img
                  src={gift.imageUrl}
                  alt={gift.title}
                  loading="lazy"
                  className="h-36 w-full object-cover"
                />
              ) : (
                <div className="grid h-36 w-full place-items-center bg-gradient-to-br from-primary/15 via-navy/10 to-gold/10">
                  <Gift className="h-10 w-10 text-primary" />
                </div>
              )}
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm font-bold leading-snug">{gift.title}</h2>
                  <Badge variant={gift.status === 'active' ? 'success' : 'default'}>
                    {gift.status === 'active' ? t('common.active') : t('common.soon')}
                  </Badge>
                </div>
                {gift.description ? (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{gift.description}</p>
                ) : null}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <CoinAmount value={gift.price} className="text-sm text-gold-deep dark:text-gold-deep" />
                  <Button size="sm" variant="outline" disabled leftIcon={<Gift className="h-3.5 w-3.5" />}>
                    {t('gifts.redeemSoon')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
