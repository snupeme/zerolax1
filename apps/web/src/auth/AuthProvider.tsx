import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Language, Profile } from '@zerolax/shared';
import { useI18n } from '../i18n/I18nProvider';
import {
  ApiError,
  api,
  clearStoredSession,
  getStoredSession,
  hasLegacyTelegramClaim,
  refreshUserSession,
  onSessionExpired,
  setStoredSession,
} from '../lib/api';
import { getTelegramWebApp, isTelegramEnvironment, openTelegramLink } from '../lib/telegram';

export type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'registration_required'
  | 'error';

interface AuthContextValue {
  status: AuthStatus;
  profile: Profile | null;
  errorCode: string | null;
  isTelegram: boolean;
  devEnabled: boolean;
  botUsername: string;
  signInWithTelegram: () => Promise<void>;
  signInWithDev: (input: {
    nickname?: string;
    language?: Language;
    telegramId?: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => void;
  setProfile: (profile: Profile) => void;
  openBot: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function telegramInitData(): string {
  const webApp = getTelegramWebApp();
  return webApp?.initData ?? '';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { language, setLanguage } = useI18n();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isTelegram, setIsTelegram] = useState(false);
  const [devEnabled, setDevEnabled] = useState(false);
  const [botUsername, setBotUsername] = useState('ZerolaxBot');
  const [reloadKey, setReloadKey] = useState(0);
  const initDataRef = useRef('');

  const setProfile = useCallback((next: Profile) => {
    setProfileState(next);
    const stored = getStoredSession();
    if (stored) setStoredSession({ ...stored, profile: next });
  }, []);

  const applySession = useCallback(
    (session: { profile: Profile }) => {
      setProfileState(session.profile);
      setStatus('authenticated');
      setErrorCode(null);
      if (session.profile.language !== language) setLanguage(session.profile.language);
    },
    [language, setLanguage],
  );

  const signInWithTelegram = useCallback(async () => {
    const initData = initDataRef.current || telegramInitData();
    if (!initData) {
      setErrorCode('TELEGRAM_REQUIRED');
      setStatus('error');
      return;
    }
    setStatus('loading');
    try {
      const session = await api.auth.telegram(initData);
      setStoredSession(session);
      applySession(session);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'REGISTRATION_REQUIRED') {
          const details = error.details as { botUsername?: string } | undefined;
          if (details?.botUsername) setBotUsername(details.botUsername);
          setStatus('registration_required');
          setErrorCode(null);
          return;
        }
        setErrorCode(error.code);
      } else {
        setErrorCode('NETWORK_ERROR');
      }
      setStatus('error');
    }
  }, [applySession]);

  const signInWithDev = useCallback(
    async (input: { nickname?: string; language?: Language; telegramId?: string }) => {
      const session = await api.auth.dev(input);
      setStoredSession(session);
      applySession(session);
    },
    [applySession],
  );

  const signOut = useCallback(async () => {
    const stored = getStoredSession();
    try {
      await api.auth.logout(stored?.refreshToken);
    } catch {
      // Logging out locally must succeed even when the server is unreachable.
    }
    clearStoredSession();
    setProfileState(null);
    setStatus('unauthenticated');
  }, []);

  const retry = useCallback(() => {
    setErrorCode(null);
    setStatus('loading');
    setReloadKey((value) => value + 1);
  }, []);

  const openBot = useCallback(() => {
    openTelegramLink(`https://t.me/${botUsername}`);
  }, [botUsername]);

  useEffect(() => {
    const unsubscribe = onSessionExpired(() => {
      setProfileState(null);
      setStatus('unauthenticated');
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const initData = telegramInitData();
      initDataRef.current = initData;
      const inTelegram = Boolean(initData) || isTelegramEnvironment();
      setIsTelegram(inTelegram);

      let configDev = false;
      try {
        const config = await api.config();
        if (cancelled) return;
        configDev = config.devAuthEnabled;
        setDevEnabled(config.devAuthEnabled);
        setBotUsername(config.botUsername);
      } catch {
        // The health of the API is surfaced by the login request below.
      }
      if (cancelled) return;

      const stored = getStoredSession();
      if (stored) {
        try {
          if (hasLegacyTelegramClaim(stored.accessToken)) await refreshUserSession();
          const me = await api.user.me();
          if (cancelled) return;
          setProfile(me.profile);
          setStatus('authenticated');
          setErrorCode(null);
          return;
        } catch (error) {
          if (cancelled) return;
          clearStoredSession();
          if (error instanceof ApiError && error.status === 403) {
            setErrorCode(error.code);
            setStatus('error');
            return;
          }
          if (!(error instanceof ApiError) || error.status !== 401) {
            setErrorCode(error instanceof ApiError ? error.code : 'NETWORK_ERROR');
            setStatus('error');
            return;
          }
        }
      }

      if (initData) {
        await signInWithTelegram();
        return;
      }

      if (configDev) {
        setStatus('unauthenticated');
        return;
      }

      setErrorCode('TELEGRAM_REQUIRED');
      setStatus('error');
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      profile,
      errorCode,
      isTelegram,
      devEnabled,
      botUsername,
      signInWithTelegram,
      signInWithDev,
      signOut,
      retry,
      setProfile,
      openBot,
    }),
    [
      status,
      profile,
      errorCode,
      isTelegram,
      devEnabled,
      botUsername,
      signInWithTelegram,
      signInWithDev,
      signOut,
      retry,
      setProfile,
      openBot,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
