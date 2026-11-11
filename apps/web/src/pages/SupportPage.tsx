import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, LifeBuoy, MessageSquare, Send } from 'lucide-react';
import { formatDate, supportRequestSchema } from '@zerolax/shared';
import type { TranslationKey } from '@zerolax/shared';
import { useI18n } from '../i18n/I18nProvider';
import { api } from '../lib/api';
import { errorKey } from '../lib/errors';
import { PageHeader } from '../components/PageHeader';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Field, Input, Textarea } from '../components/ui/input';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/feedback';

const STATUS_VARIANT = {
  open: 'warning',
  in_progress: 'primary',
  closed: 'success',
} as const;

const STATUS_KEY: Record<'open' | 'in_progress' | 'closed', TranslationKey> = {
  open: 'support.statusOpen',
  in_progress: 'support.statusInProgress',
  closed: 'support.statusClosed',
};

export function SupportPage() {
  const { t, language } = useI18n();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<TranslationKey | null>(null);
  const [sent, setSent] = useState(false);

  const requests = useQuery({ queryKey: ['support'], queryFn: api.user.supportRequests });

  const create = useMutation({
    mutationFn: (input: { subject: string; message: string }) => api.user.createSupportRequest(input),
    onSuccess: async () => {
      setSubject('');
      setMessage('');
      setError(null);
      setSent(true);
      await queryClient.invalidateQueries({ queryKey: ['support'] });
    },
    onError: (mutationError) => {
      setSent(false);
      setError(errorKey(mutationError));
    },
  });

  function submit() {
    setSent(false);
    const parsed = supportRequestSchema.safeParse({ subject, message });
    if (!parsed.success) {
      setError('errors.validation');
      return;
    }
    create.mutate(parsed.data);
  }

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader title={t('support.title')} subtitle={t('support.subtitle')} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            {t('support.newRequest')}
          </CardTitle>
          <CardDescription>{t('support.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sent ? (
            <p className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">
              <CheckCircle2 className="h-4 w-4" />
              {t('support.sent')}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {t(error)}
            </p>
          ) : null}

          <Field label={t('support.subject')} htmlFor="support-subject">
            <Input
              id="support-subject"
              value={subject}
              maxLength={140}
              placeholder={t('support.subjectPlaceholder')}
              onChange={(event) => {
                setSubject(event.target.value);
                setSent(false);
              }}
            />
          </Field>
          <Field label={t('support.message')} htmlFor="support-message">
            <Textarea
              id="support-message"
              value={message}
              maxLength={4000}
              placeholder={t('support.messagePlaceholder')}
              onChange={(event) => {
                setMessage(event.target.value);
                setSent(false);
              }}
            />
          </Field>
          <Button
            onClick={submit}
            loading={create.isPending}
            leftIcon={<Send className="h-4 w-4" />}
          >
            {t('support.send')}
          </Button>
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
          <LifeBuoy className="h-4 w-4 text-primary" />
          {t('support.myRequests')}
        </h2>

        {requests.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_value, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : requests.isError ? (
          <ErrorState
            title={t('common.errorTitle')}
            message={t(errorKey(requests.error))}
            onRetry={() => void requests.refetch()}
            retryLabel={t('common.retry')}
          />
        ) : requests.data!.requests.length === 0 ? (
          <EmptyState
            icon={<LifeBuoy className="h-5 w-5" />}
            title={t('support.noRequests')}
            message={t('support.subtitle')}
          />
        ) : (
          <div className="space-y-2">
            {requests.data!.requests.map((request) => (
              <Card key={request.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-sm font-bold">{request.subject}</h3>
                    <Badge variant={STATUS_VARIANT[request.status]}>{t(STATUS_KEY[request.status])}</Badge>
                  </div>
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{request.message}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatDate(request.createdAt, language, { withTime: true })}
                  </p>
                  {request.adminReply ? (
                    <div className="rounded-lg bg-primary/5 p-3">
                      <p className="mb-1 text-xs font-semibold text-primary">{t('support.reply')}</p>
                      <p className="whitespace-pre-line text-sm">{request.adminReply}</p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
