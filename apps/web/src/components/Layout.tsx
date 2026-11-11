import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import {
  Bell,
  Award,
  BookOpen,
  Gamepad2,
  Brain,
  Flame,
  Gift,
  History,
  Home,
  LifeBuoy,
  LogOut,
  Moon,
  ScrollText,
  Settings,
  Shield,
  Sun,
  User,
} from 'lucide-react';
import type { TranslationKey } from '@zerolax/shared';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/I18nProvider';
import { api } from '../lib/api';
import { useTheme } from '../lib/theme';
import { cn } from '../lib/utils';
import { Brand } from './Brand';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Avatar, CoinAmount } from './ui/misc';

interface NavItem {
  to: string;
  label: TranslationKey;
  icon: typeof Home;
  end?: boolean;
}

const primaryNav: NavItem[] = [
  { to: '/', label: 'common.home', icon: Home, end: true },
  { to: '/subjects', label: 'nav.subjects', icon: BookOpen },
  { to: '/exams', label: 'nav.exams', icon: Brain },
  { to: '/history', label: 'nav.results', icon: History },
  { to: '/profile', label: 'common.profile', icon: User },
];

const secondaryNav: NavItem[] = [
  { to: '/progress', label: 'nav.progress', icon: Flame },
  {to:'/certificates',label:'study.certificates',icon:Award},
  { to: '/notifications', label: 'common.notifications', icon: Bell },
  { to: '/gifts', label: 'common.gifts', icon: Gift },
  { to: '/support', label: 'common.support', icon: LifeBuoy },
  { to: '/settings', label: 'common.settings', icon: Settings },
  { to: '/offer', label: 'common.offer', icon: ScrollText },
];

export function Layout() {
  const { profile, signOut } = useAuth();
  const { t } = useI18n();
  const { resolved, toggle } = useTheme();
  const location = useLocation();
  const isHome = location.pathname === '/';

  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: api.user.notifications,
    refetchInterval: 60_000,
  });
  const unread = notifications.data?.unread ?? 0;

  const isMobileActive = (to: string) => {
    const path = location.pathname;
    if (to === '/') return path === '/';
    if (to === '/subjects') {
      return ['/subjects', '/algebra', '/geometry'].some((prefix) =>
        path.startsWith(prefix),
      );
    }
    if (to === '/exams') {
      return ['/exams', '/iq', '/entrance', '/games'].some((prefix) => path.startsWith(prefix));
    }
    return path.startsWith(to);
  };

  return (
    <div className="relative min-h-dvh bg-background">
      <div aria-hidden className="app-backdrop pointer-events-none fixed inset-0 z-0" />
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 items-center px-5">
          <Brand showTagline />
        </div>

        {profile ? (
          <Link
            to="/profile"
            className="mx-3 flex items-center gap-3 rounded-xl bg-muted/70 px-3 py-2.5 transition-colors hover:bg-muted"
          >
            <Avatar name={profile.nickname} src={profile.avatarUrl} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{profile.nickname}</p>
              <CoinAmount value={profile.coinsBalance} className="text-xs text-muted-foreground" />
            </div>
          </Link>
        ) : null}

        <nav className="mt-4 flex-1 space-y-1 overflow-y-auto px-3 pb-4 scrollbar-thin">
          {primaryNav.slice(0, 4).map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
          <div className="pb-1 pt-4">
            <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {t('common.settings')}
            </p>
          </div>
          {secondaryNav.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
          <SidebarLink item={{ to: '/admin', label: 'common.admin', icon: Shield }} />
        </nav>

        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            {t('common.logout')}
          </button>
        </div>
      </aside>

      <div className="relative z-10 lg:pl-64">
        {!isHome ? (
          <header className="sticky top-0 z-30 border-b border-border/70 glass safe-top">
            <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-2 px-4">
              <div className="lg:hidden">
                <Brand size="sm" />
              </div>
              <div className="hidden items-center gap-2 lg:flex">
                {profile ? <Avatar name={profile.nickname} src={profile.avatarUrl} size="sm" /> : null}
                <span className="text-sm font-semibold text-muted-foreground">
                  {profile ? t('auth.welcomeBack') : ''}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {profile ? (
                  <Link
                    to="/profile"
                    className="mr-1 hidden items-center rounded-full bg-gold/10 px-3 py-1.5 sm:inline-flex"
                    aria-label={t('home.coinBalance')}
                  >
                    <CoinAmount value={profile.coinsBalance} className="text-sm text-gold-deep" />
                  </Link>
                ) : null}
                <Link
                  to="/notifications"
                  aria-label={t('common.notifications')}
                  className="relative grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Bell className="h-[18px] w-[18px]" />
                  {unread > 0 ? (
                    <span className="absolute right-1 top-1 grid min-w-[16px] place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-4 text-surface-ink">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  ) : null}
                </Link>
                <LanguageSwitcher compact className="hidden sm:block" />
                <button
                  type="button"
                  onClick={toggle}
                  aria-label={t('profile.theme')}
                  className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {resolved === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
                </button>
              </div>
            </div>
          </header>
        ) : null}

        <main
          className={cn(
            'mx-auto w-full max-w-5xl px-4 pb-28 lg:pb-12',
            isHome ? 'home-safe-top' : 'pt-5',
          )}
        >
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 glass safe-bottom lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {primaryNav.map((item) => {
            const active = isMobileActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center gap-1 px-1 pb-1.5 pt-2.5 text-[10px] font-semibold transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-0 h-0.5 w-6 rounded-full bg-primary transition-opacity',
                    active ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span
                  className={cn(
                    'grid h-8 w-11 place-items-center rounded-lg transition-colors',
                    active && 'bg-primary/10',
                  )}
                >
                  <item.icon className="h-[18px] w-[18px]" />
                </span>
                <span className="truncate">{t(item.label)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  const { t } = useI18n();
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )
      }
    >
      <item.icon className="h-[18px] w-[18px]" />
      {t(item.label)}
    </NavLink>
  );
}
