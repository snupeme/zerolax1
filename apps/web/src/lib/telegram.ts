export interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: TelegramWebAppUser;
    auth_date?: number;
    hash?: string;
  };
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  ready: () => void;
  expand: () => void;
  close: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  openTelegramLink: (url: string) => void;
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
  showAlert: (message: string, callback?: () => void) => void;
  showConfirm: (message: string, callback?: (confirmed: boolean) => void) => void;
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  BackButton?: {
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
  MainButton?: {
    text: string;
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    setText: (text: string) => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
  onEvent: (event: string, callback: () => void) => void;
  offEvent: (event: string, callback: () => void) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp ?? null;
}

export function isTelegramEnvironment(): boolean {
  const webApp = getTelegramWebApp();
  return Boolean(webApp && webApp.initData && webApp.initData.length > 0);
}

/** Applies Telegram viewport settings once on startup. */
export function initTelegramViewport(): void {
  const webApp = getTelegramWebApp();
  if (!webApp) return;
  try {
    webApp.ready();
    webApp.expand();
    webApp.enableClosingConfirmation?.();
  } catch {
    // Older Telegram clients may not implement every method.
  }
}

export function haptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning'): void {
  const feedback = getTelegramWebApp()?.HapticFeedback;
  if (!feedback) return;
  try {
    if (type === 'success' || type === 'error' || type === 'warning') {
      feedback.notificationOccurred(type);
    } else {
      feedback.impactOccurred(type);
    }
  } catch {
    // Ignore haptic failures.
  }
}

export function openTelegramLink(url: string): void {
  const webApp = getTelegramWebApp();
  if (webApp) {
    webApp.openTelegramLink(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function openExternalLink(url: string): void {
  const webApp = getTelegramWebApp();
  if (webApp) {
    webApp.openLink(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Keep Telegram chrome in step with the active seasonal light/dark palette. */
export function syncTelegramTheme(color: string): void {
  const app = getTelegramWebApp();
  try { app?.setHeaderColor?.(color); } catch { /* Older clients. */ }
  try { app?.setBackgroundColor?.(color); } catch { /* Older clients. */ }
}
