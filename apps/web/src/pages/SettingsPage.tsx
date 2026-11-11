import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Globe2, LogOut, Save, ShieldCheck, UserRound } from 'lucide-react';
import {
  LANGUAGES,
  LANGUAGE_FLAGS,
  LANGUAGE_LABELS,
  nicknameSchema,
  type Language,
  type NotificationPrefs,
  type TranslationKey,
} from '@zerolax/shared';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/I18nProvider';
import { api } from '../lib/api';
import { errorKey } from '../lib/errors';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Field, Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';

export function SettingsPage() {
  const { t, language, setLanguage } = useI18n();
  const { profile, setProfile, signOut } = useAuth();
  const queryClient = useQueryClient();

  const [nickname, setNickname] = useState(profile?.nickname ?? '');
  const [prefs, setPrefs] = useState<NotificationPrefs>(
    profile?.notificationPrefs ?? { dailyIq: true, results: true, announcements: true },
  );
  const [error, setError] = useState<TranslationKey | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setNickname(profile.nickname);
    setPrefs(profile.notificationPrefs);
  }, [profile]);

  const updateProfile = useMutation({
    mutationFn: (input: {
      nickname?: string;
      language?: Language;
      notificationPrefs?: NotificationPrefs;
    }) => api.user.updateMe(input),
    onSuccess: (data) => {
      setProfile(data.profile);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      setSaved(true);
      setError(null);
    },
    onError: (mutationError) => {
      setSaved(false);
      setError(errorKey(mutationError));
    },
  });

  const changeLanguage = useMutation({
    mutationFn: (next: Language) => api.user.updateMe({ language: next }),
    onSuccess: (data) => {
      setProfile(data.profile);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (mutationError, _next, context) => {
      if (typeof context === 'string') setLanguage(context as Language);
      setError(errorKey(mutationError));
    },
    onMutate: (next) => {
      const previous = language;
      setLanguage(next);
      return previous;
    },
  });

  if (!profile) return null;

  function save() {
    setError(null);
    setSaved(false);
    const parsed = nicknameSchema.safeParse(nickname);
    if (!parsed.success) {
      setError('errors.validation');
      return;
    }
    updateProfile.mutate({ nickname: parsed.data, notificationPrefs: prefs });
  }

  function togglePref(key: keyof NotificationPrefs, value: boolean) {
    setSaved(false);
    setPrefs((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader
        title={t('settings.title')}
        actions={
          <Button
            onClick={save}
            loading={updateProfile.isPending}
            leftIcon={<Save className="h-4 w-4" />}
            size="sm"
          >
            {t('settings.saveChanges')}
          </Button>
        }
      />

      {saved ? (
        <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">
          {t('common.saved')}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {t(error)}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-primary" />
            {t('settings.nicknameSection')}
          </CardTitle>
          <CardDescription>{t('settings.nicknameDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Field label={t('profile.editNickname')} htmlFor="nickname" hint={t('settings.nicknameRules')}>
            <Input
              id="nickname"
              value={nickname}
              maxLength={24}
              onChange={(event) => {
                setNickname(event.target.value);
                setSaved(false);
              }}
              autoComplete="nickname"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-primary" />
            {t('settings.languageSection')}
          </CardTitle>
          <CardDescription>{t('settings.languageDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-3">
            {LANGUAGES.map((item) => (
              <button
                key={item}
                type="button"
                disabled={changeLanguage.isPending}
                onClick={() => {
                  setError(null);
                  changeLanguage.mutate(item);
                }}
                className={
                  item === language
                    ? 'flex items-center justify-center gap-2 rounded-xl border border-primary bg-primary/10 px-3 py-3 text-sm font-semibold text-primary'
                    : 'flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60'
                }
              >
                <span aria-hidden>{LANGUAGE_FLAGS[item]}</span>
                {LANGUAGE_LABELS[item]}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            {t('settings.notificationsSection')}
          </CardTitle>
          <CardDescription>{t('settings.notificationsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          <PrefRow
            label={t('profile.notifDailyIq')}
            checked={prefs.dailyIq}
            onChange={(value) => togglePref('dailyIq', value)}
          />
          <PrefRow
            label={t('profile.notifResults')}
            checked={prefs.results}
            onChange={(value) => togglePref('results', value)}
          />
          <PrefRow
            label={t('profile.notifAnnouncements')}
            checked={prefs.announcements}
            onChange={(value) => togglePref('announcements', value)}
          />
          <div className="pt-3">
            <Button
              onClick={save}
              loading={updateProfile.isPending}
              leftIcon={<Save className="h-4 w-4" />}
            >
              {t('settings.saveChanges')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {t('settings.accountSection')}
          </CardTitle>
          <CardDescription>{t('settings.accountDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t('profile.phonePrivate')}</p>
          <Button
            variant="destructive"
            onClick={() => void signOut()}
            leftIcon={<LogOut className="h-4 w-4" />}
          >
            {t('common.signOut')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PrefRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0">
      <span className="text-sm font-medium">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} label={label} />
    </div>
  );
}
