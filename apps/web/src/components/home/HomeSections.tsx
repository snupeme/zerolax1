import { useExamWords } from '../../lib/exams';
import { SeasonalLeaves } from './SeasonalLeaves';
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Award,
  Brain,
  Calculator,
  ChevronRight,
  Coins,
  Gamepad2,
  GraduationCap,
  Shapes,
  Flame,
  Sparkles,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { Avatar } from "../ui/misc";
import type { HomeWords } from "../../lib/home";

/** Small uppercase label used to separate premium homepage sections. */
export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-[13px] font-extrabold uppercase tracking-[0.14em] text-foreground">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function HomeHeader({
  name,
  avatarUrl,
  coins,
  greeting,
  words,
}: {
  name: string;
  avatarUrl?: string | null;
  coins: number;
  greeting: string;
  words: HomeWords;
}) {
  return (
    <header className="flex items-center justify-between gap-3">
      <Link
        to="/profile"
        className="pressable flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline focus-visible:outline-primary"
      >
        <Avatar
          name={name}
          src={avatarUrl}
          size="md"
          className="ring-2 ring-primary/10 ring-offset-2 ring-offset-background"
        />
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            {greeting}
          </p>
          <p className="truncate font-display text-lg font-extrabold leading-tight tracking-tight">
            {name}
          </p>
        </div>
      </Link>

      <Link
        to="/profile"
        aria-label="Coin balance"
        className="pressable flex shrink-0 items-center gap-1.5 rounded-full border border-gold/35 bg-gold/10 px-3 py-2"
      >
        <Coins className="h-4 w-4 text-gold-deep" aria-hidden />
        <span className="text-sm font-extrabold leading-none tracking-tight">
          {coins}
        </span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
          {words.balance}
        </span>
      </Link>
    </header>
  );
}

export function PremiumBanner({
  premium,
  words,
}: {
  premium: boolean;
  words: HomeWords;
}) {
  return (
    <Link
      to="/learning"
      className="premium-surface pressable group relative block overflow-hidden rounded-2xl p-5 text-surface-ink shadow-premium focus-visible:outline focus-visible:outline-gold sm:p-6"
    >
      <SeasonalLeaves />
      <span className="premium-pattern pointer-events-none absolute inset-0" aria-hidden />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full border border-gold/25"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-2 top-2 h-24 w-24 rounded-full border border-surface-ink/10"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-20 right-10 h-44 w-44 rounded-full bg-gold/10 blur-2xl"
      />

      <div className="relative z-10 max-w-[82%]">
        <p className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-gold">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          ZEROLAX PREMIUM
        </p>
        <h2 className="mt-2.5 font-display text-xl font-extrabold leading-tight tracking-tight sm:text-2xl">
          {premium ? words.premiumActiveTitle : words.premiumTitle}
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-surface-ink/75 sm:text-sm">
          {premium ? words.premiumActiveText : words.premiumText}
        </p>
        <span className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gold px-3.5 py-2 text-xs font-extrabold text-navy shadow-sm transition-transform group-hover:translate-x-0.5">
          {premium ? words.premiumActiveCta : words.premiumCta}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>

      <span
        aria-hidden
        className="absolute bottom-5 right-5 hidden h-16 w-16 place-items-center rounded-2xl border border-surface-ink/15 bg-surface-ink/5 sm:grid"
      >
        <Award className="h-7 w-7 text-gold" />
      </span>
    </Link>
  );
}

const ARCADE_SYMBOLS = [
  { symbol: "+", className: "right-5 top-5 text-gold/70 symbol-drift" },
  { symbol: "−", className: "right-16 top-16 text-surface-ink/25 symbol-drift-slow" },
  { symbol: "×", className: "right-8 bottom-16 text-success/40 symbol-drift-slow" },
  { symbol: "÷", className: "right-24 bottom-5 text-surface-ink/20 symbol-drift" },
  { symbol: "=", className: "right-2 top-24 text-gold/30 symbol-drift-slow" },
] as const;

export function ExamsBanner() {
  const words=useExamWords();
  return (
    <Link
      to="/exams"
      className="arcade-surface pressable group relative block overflow-hidden rounded-2xl p-5 text-surface-ink shadow-arcade focus-visible:outline focus-visible:outline-gold sm:p-6"
    >
      <span className="arcade-pattern pointer-events-none absolute inset-0" aria-hidden />
      {ARCADE_SYMBOLS.map((item) => (
        <span
          key={item.symbol}
          aria-hidden
          className={cn(
            "pointer-events-none absolute select-none font-display text-3xl font-semibold",
            item.className,
          )}
        >
          {item.symbol}
        </span>
      ))}

      <div className="relative z-10 max-w-[78%]">
        <span className="inline-flex items-center gap-2 rounded-lg border border-surface-ink/15 bg-surface-ink/5 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-gold">
          <GraduationCap className="h-3.5 w-3.5" aria-hidden />
          {words.title}
        </span>
        <h2 className="mt-3 font-display text-xl font-extrabold leading-tight tracking-tight sm:text-2xl">
          {words.bannerTitle}
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-surface-ink/65 sm:text-sm">
          {words.subtitle}
        </p>
        <span className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-surface-ink/20 bg-surface-ink/10 px-3.5 py-2 text-xs font-bold text-surface-ink backdrop-blur transition-colors group-hover:bg-surface-ink/15">
          {words.open}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

function QuickCard({
  to,
  icon,
  title,
  text,
  tone,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  text: string;
  tone: "emerald" | "navy";
}) {
  return (
    <Link
      to={to}
      className="pressable group flex h-full flex-col rounded-xl border border-border bg-card p-3.5 shadow-soft focus-visible:outline focus-visible:outline-primary"
    >
      <span
        className={cn(
          "grid h-9 w-9 place-items-center rounded-lg",
          tone === "emerald"
            ? "bg-primary/10 text-primary"
            : "bg-navy/5 text-navy dark:bg-surface-ink/10 dark:text-surface-ink",
        )}
      >
        {icon}
      </span>
      <p className="mt-3 font-display text-sm font-extrabold leading-tight tracking-tight">
        {title}
      </p>
      <p className="mt-1 flex-1 text-[11px] leading-relaxed text-muted-foreground">
        {text}
      </p>
      <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary">
        <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}

export function QuickAccess({ words }: { words: HomeWords }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <QuickCard
        to="/iq"
        icon={<Brain className="h-[18px] w-[18px]" />}
        title={words.iqTitle}
        text={words.iqText}
        tone="emerald"
      />
      <QuickCard
        to="/exams"
        icon={<GraduationCap className="h-[18px] w-[18px]" />}
        title={words.examTitle}
        text={words.examText}
        tone="navy"
      />
      <QuickCard
        to="/progress"
        icon={<Flame className="h-[18px] w-[18px]" />}
        title={words.progressTitle}
        text={words.progressText}
        tone="emerald"
      />
    </div>
  );
}

export function SubjectCard({
  to,
  subject,
  words,
}: {
  to: string;
  subject: "algebra" | "geometry";
  words: HomeWords;
}) {
  const algebra = subject === "algebra";
  const Icon = algebra ? Calculator : Shapes;
  return (
    <Link
      to={to}
      className="pressable group flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-soft focus-visible:outline focus-visible:outline-primary"
    >
      <span
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-lg",
          algebra
            ? "bg-primary/10 text-primary"
            : "bg-navy/5 text-navy dark:bg-surface-ink/10 dark:text-surface-ink",
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-display text-sm font-extrabold tracking-tight">
            {algebra ? words.algebra : words.geometry}
          </span>
          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            {words.gradeRange}
          </span>
        </span>
        <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
          {algebra ? words.algebraDesc : words.geometryDesc}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

export function SubjectsGrid({ words }: { words: HomeWords }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      <SubjectCard to="/algebra" subject="algebra" words={words} />
      <SubjectCard to="/geometry" subject="geometry" words={words} />
    </div>
  );
}

export function FeatureCard({
  to,
  icon,
  title,
  text,
  tone,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  text: string;
  tone: "emerald" | "gold";
}) {
  return (
    <Link
      to={to}
      className="pressable group flex h-full flex-col rounded-xl border border-border bg-card p-4 shadow-soft focus-visible:outline focus-visible:outline-primary"
    >
      <span
        className={cn(
          "grid h-10 w-10 place-items-center rounded-lg",
          tone === "emerald"
            ? "bg-primary/10 text-primary"
            : "bg-gold/15 text-gold-deep",
        )}
      >
        {icon}
      </span>
      <p className="mt-3 font-display text-sm font-extrabold leading-tight tracking-tight">
        {title}
      </p>
      <p className="mt-1 flex-1 text-[11px] leading-relaxed text-muted-foreground">
        {text}
      </p>
      <ChevronRight className="mt-2 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

export function FeatureCards({ words }: { words: HomeWords }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <FeatureCard
        to="/analysis"
        icon={<Sparkles className="h-[18px] w-[18px]" />}
        title={words.aiTitle}
        text={words.aiText}
        tone="emerald"
      />
      <FeatureCard
        to="/certificates"
        icon={<Award className="h-[18px] w-[18px]" />}
        title={words.certTitle}
        text={words.certText}
        tone="gold"
      />
    </div>
  );
}

export function ResultRow({
  to,
  icon,
  iconClass,
  title,
  subtitle,
  value,
}: {
  to: string;
  icon: ReactNode;
  iconClass: string;
  title: string;
  subtitle: string;
  value: string;
}) {
  return (
    <Link
      to={to}
      className="pressable flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 transition-colors hover:bg-muted/60"
    >
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", iconClass)}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{subtitle}</span>
      </span>
      <span className="shrink-0 text-sm font-extrabold">{value}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
