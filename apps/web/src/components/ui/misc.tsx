import type { ReactNode } from 'react';
import { Coins } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'Z';

  const sizes = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-lg',
    xl: 'h-20 w-20 text-2xl',
  } as const;

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        loading="lazy"
        className={cn('shrink-0 rounded-full object-cover', sizes[size], className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full brand-gradient font-bold text-surface-ink',
        sizes[size],
        className,
      )}
    >
      {initials}
    </span>
  );
}

export function CoinAmount({
  value,
  className,
  iconClassName,
}: {
  value: number | string;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1 font-semibold', className)}>
      <Coins className={cn('h-4 w-4 text-gold-deep', iconClassName)} aria-hidden />
      {value}
    </span>
  );
}

export function StatCard({
  icon,
  label,
  value,
  hint,
  accent = 'primary',
  className,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: 'primary' | 'success' | 'amber' | 'violet' | 'sky';
  className?: string;
}) {
  const accents: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    amber: 'bg-gold/10 text-gold-deep dark:text-gold-deep',
    violet: 'bg-navy/10 text-navy dark:text-surface-ink',
    sky: 'bg-primary/10 text-primary dark:text-primary',
  };
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4 shadow-soft', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-bold leading-none tracking-tight">{value}</p>
          {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', accents[accent])}>
          {icon}
        </span>
      </div>
    </div>
  );
}

export function ScoreRing({
  percent,
  size = 132,
  label,
  className,
}: {
  percent: number;
  size?: number;
  label?: ReactNode;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const color =
    clamped >= 80 ? 'hsl(var(--success))' : clamped >= 50 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))';
  return (
    <div
      className={cn('relative grid place-items-center rounded-full', className)}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${color} ${clamped * 3.6}deg, hsl(var(--muted)) 0deg)`,
      }}
      role="img"
      aria-label={`${Math.round(clamped)}%`}
    >
      <div className="grid h-[calc(100%-18px)] w-[calc(100%-18px)] place-items-center rounded-full bg-card text-center">
        <div>
          <div className="text-2xl font-bold leading-none">{Math.round(clamped)}%</div>
          {label ? <div className="mt-1 text-xs text-muted-foreground">{label}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function SectionTitle({
  title,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
        {icon}
        {title}
      </h2>
      {action}
    </div>
  );
}
