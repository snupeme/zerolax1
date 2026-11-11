import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { AlertCircle, ArrowRight, Send, ShieldAlert } from 'lucide-react';
import type { TranslationKey } from '@zerolax/shared';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/I18nProvider';
import { ApiError } from '../lib/api';
import { errorKey } from '../lib/errors';
import { Brand } from './Brand';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Field, Input } from './ui/input';
import { LoadingScreen } from './ui/feedback';
import { Badge } from './ui/badge';

const ERROR_TEXT: Record<string, TranslationKey> = {
  TELEGRAM_REQUIRED: 'auth.registrationRequiredText',
  BOT_NOT_CONFIGURED: 'errors.botNotConfigured',
  ACCOUNT_BLOCKED: 'errors.blocked',
  NETWORK_ERROR: 'errors.network',
  DEV_AUTH_DISABLED: 'errors.devDisabled',
};

export function AuthGate() {
  const { status } = useAuth();

  if (status === 'loading') {
    return <FullScreenShell><LoadingScreen /></FullScreenShell>;
  }
  if (status === 'authenticated') return <Outlet />;
  if (status === 'registration_required') return <RegistrationRequiredScreen />;
  if (status === 'error') return <AuthErrorScreen />;
  return <LoginScreen />;
}

function FullScreenShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative w-full max-w-md">{children}</div>
    </div>
  );
}

function LoginScreen() {
  const { t } = useI18n();
  const { signInWithDev, devEnabled, openBot, botUsername } = useAuth();
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<TranslationKey | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = nickname.trim();
    if (trimmed.length < 3) {
      setError('bot.nicknameInvalid');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signInWithDev({ nickname: trimmed });
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'NICKNAME_TAKEN') {
        setError('bot.nicknameTaken');
      } else {
        setError(errorKey(caught));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <FullScreenShell>
      <div className="mb-6 flex items-center justify-between">
        <Brand size="lg" showTagline />
        <LanguageSwitcher compact persist={false} />
      </div>

      <Card className="shadow-glow">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="primary">{t('common.devMode')}</Badge>
          </div>
          <CardTitle className="text-xl">{t('auth.devLoginTitle')}</CardTitle>
          <CardDescription>{t('auth.devLoginText')}</CardDescription>
        </CardHeader>
        <CardContent>
          {devEnabled ? (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <Field
                label={t('auth.nicknamePlaceholder')}
                htmlFor="dev-nickname"
                error={error ? t(error) : null}
                hint={t('settings.nicknameRules')}
              >
                <Input
                  id="dev-nickname"
                  value={nickname}
                  onChange={(event) => {
                    setNickname(event.target.value);
                    setError(null);
                  }}
                  placeholder={t('auth.nicknamePlaceholder')}
                  autoComplete="nickname"
                  maxLength={24}
                  autoFocus
                />
              </Field>
              <Button type="submit" fullWidth size="lg" loading={loading} rightIcon={<ArrowRight className="h-4 w-4" />}>
                {t('auth.continue')}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t('auth.registrationRequiredText')}</p>
              <Button fullWidth size="lg" onClick={openBot} leftIcon={<Send className="h-4 w-4" />}>
                {t('common.openInTelegram')}
              </Button>
              <p className="text-center text-xs text-muted-foreground">@{botUsername}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        {t('common.appName')} · {t('common.version')} 1.0.0
      </p>
    </FullScreenShell>
  );
}

function RegistrationRequiredScreen() {
  const { t } = useI18n();
  const { openBot, botUsername } = useAuth();
  return (
    <FullScreenShell>
      <div className="mb-6 flex justify-center">
        <Brand size="lg" />
      </div>
      <Card className="shadow-glow">
        <CardHeader className="items-center text-center">
          <div className="mb-2 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Send className="h-7 w-7" />
          </div>
          <CardTitle className="text-xl">{t('auth.registrationRequiredTitle')}</CardTitle>
          <CardDescription>{t('auth.registrationRequiredText')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button fullWidth size="lg" onClick={openBot} leftIcon={<Send className="h-4 w-4" />}>
            {t('auth.openBot')}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            @{botUsername} · {t('common.telegram')}
          </p>
        </CardContent>
      </Card>
      <div className="mt-6 flex justify-center">
        <LanguageSwitcher compact persist={false} />
      </div>
    </FullScreenShell>
  );
}

function AuthErrorScreen() {
  const { t } = useI18n();
  const { errorCode, retry, openBot, botUsername } = useAuth();
  const key = errorCode ? ERROR_TEXT[errorCode] : undefined;
  return (
    <FullScreenShell>
      <div className="mb-6 flex justify-center">
        <Brand size="lg" />
      </div>
      <Card className="shadow-glow">
        <CardHeader className="items-center text-center">
          <div className="mb-2 grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <CardTitle className="text-xl">{t('common.errorTitle')}</CardTitle>
          <CardDescription>{key ? t(key) : t('errors.generic')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button fullWidth onClick={retry} leftIcon={<AlertCircle className="h-4 w-4" />}>
            {t('common.retry')}
          </Button>
          <Button fullWidth variant="outline" onClick={openBot} leftIcon={<Send className="h-4 w-4" />}>
            {t('auth.openBot')}
          </Button>
          <p className="text-center text-xs text-muted-foreground">@{botUsername}</p>
        </CardContent>
      </Card>
      <div className="mt-6 flex justify-center">
        <LanguageSwitcher compact persist={false} />
      </div>
    </FullScreenShell>
  );
}

/** Redirect helper kept for routes that need an inline guard. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status !== 'authenticated') return <Navigate to="/" replace />;
  return <>{children}</>;
}
