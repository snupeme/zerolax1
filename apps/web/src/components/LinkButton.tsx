import type { ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { buttonClassName } from './ui/button';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'success';
type Size = 'sm' | 'md' | 'lg' | 'icon';

export function LinkButton({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
  leftIcon,
  rightIcon,
  children,
  ...props
}: LinkProps & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Link className={buttonClassName({ variant, size, fullWidth, className })} {...props}>
      {leftIcon}
      {children}
      {rightIcon}
    </Link>
  );
}
