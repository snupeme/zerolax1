import { useEffect, useState } from "react";
import {
  NavLink,
  Outlet,
  Link,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Brain,
  GraduationCap,
  LogOut,
  ScrollText,
  Send,
  Users,
  ArrowLeft,
  Menu,
  X,
  PanelLeftClose,
  Sun,
  Moon,
  Search,
  Settings,
  Shield,
  Image,
  BookOpen,
  FileDown,
  Coins,
  LifeBuoy,
  Bell,
  ChevronRight,
  Gamepad2,
} from "lucide-react";
import { useAdminAuth } from "../auth/AdminAuthProvider";
import { useI18n } from "../i18n/I18nProvider";
import { useTheme } from "../lib/theme";
import { control, useControlWords } from "../lib/admin-control";
import { cn } from "../lib/utils";
import { Brand } from "./Brand";
import { LanguageSwitcher } from "./LanguageSwitcher";
export function AdminLayout() {
  const { isAuthenticated, session, signOut } = useAdminAuth();
  const { t } = useI18n();
  const w = useControlWords();
  const location = useLocation();
  const navigate = useNavigate();
  const { toggle, resolved } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const me = useQuery({
    queryKey: ["control-me", session?.admin.id],
    queryFn: () => control<{ permissions: string[] }>("/me"),
    enabled: isAuthenticated,
  });
  const can = (p: string) =>
    session?.admin.role === "superadmin" || me.data?.permissions.includes(p);
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    const listener = (event: Event) => setNotice((event as CustomEvent).detail);
    window.addEventListener("admin-toast", listener);
    return () => window.removeEventListener("admin-toast", listener);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  if (!isAuthenticated)
    return (
      <Navigate to="/admin/login" replace state={{ from: location.pathname }} />
    );
  const items = [
    {to:'/admin/games',label:t('games.admin'),icon:Gamepad2,show:can('games.read')},
    {
      to: "/admin/edtech",
      label: t("admin.edtech"),
      icon: BarChart3,
      show: can("edtech.read"),
    },
    {
      to: "/admin",
      label: w.analytics,
      icon: BarChart3,
      show: can("analytics.read"),
      end: true,
    },
    {
      to: "/admin/control/users",
      label: w.users,
      icon: Users,
      show: can("users.read"),
    },
    {
      to: "/admin/learning",
      label: w.learning,
      icon: GraduationCap,
      show: can("content.read") || can("exams.read") || can("premium.read"),
    },
    {
      to: "/admin/control/catalog",
      label: w.catalog,
      icon: BookOpen,
      show: can("content.read"),
    },
    {
      to: "/admin/control/content",
      label: w.content,
      icon: BookOpen,
      show: can("content.read"),
    },
    {
      to: "/admin/control/exams",
      label: w.exams,
      icon: BarChart3,
      show: can("exams.read"),
    },
    {
      to: "/admin/iq",
      label: t("admin.iqTests"),
      icon: Brain,
      show: can("exams.read"),
    },
    {
      to: "/admin/entrance",
      label: t("admin.entranceTests"),
      icon: GraduationCap,
      show: can("exams.read"),
    },
    {
      to: "/admin/control/finance",
      label: w.finance,
      icon: Coins,
      show: can("premium.read") || can("payments.read"),
    },
    {
      to: "/admin/control/certificates",
      label: w.certificates,
      icon: Shield,
      show: can("certificates.read"),
    },
    {
      to: "/admin/control/banners",
      label: w.banners,
      icon: Image,
      show: can("marketing.read"),
    },
    {
      to: "/admin/notifications",
      label: t("admin.notifications"),
      icon: Send,
      show: can("notifications.read"),
    },
    {
      to: "/admin/control/support",
      label: w.support,
      icon: LifeBuoy,
      show: can("support.read"),
    },
    {
      to: "/admin/control/coins",
      label: w.coins,
      icon: Coins,
      show: can("coins.read"),
    },
    {
      to: "/admin/control/reports",
      label: w.reports,
      icon: FileDown,
      show: can("reports.read"),
    },
    {
      to: "/admin/control/audit",
      label: w.audit,
      icon: ScrollText,
      show: can("audit.read"),
    },
    {
      to: "/admin/control/roles",
      label: w.roles,
      icon: Shield,
      show: session?.admin.role === "superadmin",
    },
    {
      to: "/admin/control/settings",
      label: w.settings,
      icon: Settings,
      show: can("settings.read"),
    },
  ].filter((i) => i.show);
  if (
    location.pathname === "/admin" &&
    !can("analytics.read") &&
    !me.isLoading &&
    items.length
  )
    return <Navigate to={items[0].to} replace />;
  const current =
    items.find((i) =>
      i.end ? location.pathname === i.to : location.pathname.startsWith(i.to),
    )?.label ?? w.dashboard;
  return (
    <div className="min-h-dvh bg-background">
      {open && (
        <button
          className="fixed inset-0 z-40 bg-overlay/40 lg:hidden"
          aria-label={w.cancel}
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r bg-card transition-all duration-200",
          collapsed ? "lg:w-20" : "lg:w-64",
          open
            ? "w-72 translate-x-0"
            : "w-72 -translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4">
          <Link to="/admin" className={cn(collapsed ? "lg:hidden" : "")}>
            <Brand size="sm" />
          </Link>
          <button
            className="hidden rounded-lg p-2 hover:bg-muted lg:block"
            aria-label={w.menu}
            onClick={() => setCollapsed(!collapsed)}
          >
            <PanelLeftClose size={20} />
          </button>
          <button
            className="p-2 lg:hidden"
            aria-label={w.cancel}
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <nav
          className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3"
          aria-label={w.menu}
        >
          {items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.end}
              title={i.label}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <i.icon className="h-[18px] w-[18px] shrink-0" />
              <span className={cn("truncate", collapsed ? "lg:hidden" : "")}>
                {i.label}
              </span>
            </NavLink>
          ))}
        </nav>
        <div className="space-y-1 border-t p-3">
          <Link
            to="/"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted"
          >
            <ArrowLeft size={18} />
            <span className={cn(collapsed ? "lg:hidden" : "")}>
              {t("admin.backToApp")}
            </span>
          </Link>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
          >
            <LogOut size={18} />
            <span className={cn(collapsed ? "lg:hidden" : "")}>{w.logout}</span>
          </button>
        </div>
      </aside>
      <div
        className={cn("transition-all", collapsed ? "lg:pl-20" : "lg:pl-64")}
      >
        <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
          <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-2 px-4">
            <button
              className="rounded-lg p-2 hover:bg-muted lg:hidden"
              aria-label={w.menu}
              onClick={() => setOpen(true)}
            >
              <Menu size={22} />
            </button>
            <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
              <Link to="/admin">{w.dashboard}</Link>
              <ChevronRight size={14} />
              <span className="font-medium text-foreground">{current}</span>
            </div>
            {can("users.read") && (
              <form
                className="relative min-w-0 max-w-xs flex-1 md:ml-auto"
                onSubmit={(e) => {
                  e.preventDefault();
                  navigate(
                    `/admin/control/users?search=${encodeURIComponent(search)}`,
                  );
                }}
              >
                <Search
                  className="absolute left-3 top-3 text-muted-foreground"
                  size={16}
                />
                <input
                  aria-label={w.search}
                  placeholder={w.search}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm"
                />
              </form>
            )}
            <div className="flex shrink-0 items-center gap-1">
              <button
                aria-label={w.theme}
                title={w.theme}
                className="rounded-lg p-2 hover:bg-muted"
                onClick={toggle}
              >
                {resolved === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <LanguageSwitcher compact />
              {can("analytics.read") && (
                <Link
                  aria-label={w.notification}
                  title={w.notification}
                  className="hidden rounded-lg p-2 hover:bg-muted sm:block"
                  to="/admin"
                >
                  <Bell size={18} />
                </Link>
              )}
              <details className="relative">
                <summary
                  className="cursor-pointer list-none rounded-full bg-primary/10 px-3 py-2 text-xs font-bold text-primary"
                  title={session?.admin.name}
                >
                  {session?.admin.name.slice(0, 1).toUpperCase()}
                </summary>
                <div className="absolute right-0 mt-2 w-60 space-y-2 rounded-xl border bg-card p-4 shadow-xl">
                  <p className="font-semibold">{session?.admin.name}</p>
                  <p className="break-all text-xs text-muted-foreground">
                    {session?.admin.email}
                  </p>
                  <button
                    className="text-sm text-destructive"
                    onClick={signOut}
                  >
                    {w.logout}
                  </button>
                </div>
              </details>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl min-w-0 px-4 py-6 pb-12">
          <Outlet />
        </main>
      </div>
      {notice && (
        <div
          role={notice.error ? "alert" : "status"}
          className={cn(
            "fixed bottom-5 right-4 z-[100] flex max-w-[calc(100vw-2rem)] items-center gap-4 rounded-xl border bg-card px-5 py-4 text-sm shadow-xl",
            notice.error
              ? "border-destructive text-destructive"
              : "border-primary/30",
          )}
        >
          <span>{notice.message}</span>
          <button aria-label={w.cancel} onClick={() => setNotice(null)}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
