import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type Variant = 'default' | 'primary' | 'secondary' | 'success' | 'destructive' | 'outline' | 'warning';

const variants: Record<Variant, string> = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary text-secondary-foreground',
  success: 'bg-success/10 text-success',
  destructive: 'bg-destructive/10 text-destructive',
  warning: 'bg-gold/10 text-gold-deep dark:text-gold-deep',
  outline: 'border border-border text-foreground',
};

export function Badge({
  className,
  variant = 'default',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
