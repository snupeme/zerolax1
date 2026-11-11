import { useEffect, useState } from 'react';
import { formatDuration } from '@zerolax/shared';
import { useI18n } from '../i18n/I18nProvider';
import { cn } from '../lib/utils';

/** Live clock counting down to an ISO instant. */
export function Countdown({
  target,
  className,
  style = 'clock',
}: {
  target: string;
  className?: string;
  style?: 'clock' | 'long';
}) {
  const { language } = useI18n();
  const [remaining, setRemaining] = useState(() => secondsLeft(target));

  useEffect(() => {
    setRemaining(secondsLeft(target));
    const interval = window.setInterval(() => setRemaining(secondsLeft(target)), 1000);
    return () => window.clearInterval(interval);
  }, [target]);

  return (
    <span className={cn('font-mono tabular-nums', className)}>
      {formatDuration(remaining, language, style)}
    </span>
  );
}

function secondsLeft(target: string): number {
  const time = new Date(target).getTime();
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.floor((time - Date.now()) / 1000));
}
