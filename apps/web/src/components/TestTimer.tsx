import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { formatDuration } from '@zerolax/shared';
import { useI18n } from '../i18n/I18nProvider';
import { cn } from '../lib/utils';

/**
 * Server-synchronised countdown. The server time is sampled on mount so a
 * skewed client clock cannot extend an entrance test.
 */
export function TestTimer({
  expiresAt,
  serverTime,
  onExpire,
  className,
}: {
  expiresAt: string;
  serverTime: string;
  onExpire?: () => void;
  className?: string;
}) {
  const { language } = useI18n();
  const offsetRef = useRef(new Date(serverTime).getTime() - Date.now());
  const firedRef = useRef(false);
  const [remaining, setRemaining] = useState(() => remainingSeconds(expiresAt, offsetRef.current));
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    offsetRef.current = new Date(serverTime).getTime() - Date.now();
    firedRef.current = false;
  }, [serverTime]);

  useEffect(() => {
    const tick = () => {
      const next = remainingSeconds(expiresAt, offsetRef.current);
      setRemaining(next);
      if (next <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpireRef.current?.();
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [expiresAt]);

  const urgent = remaining <= 60;
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-sm font-bold tabular-nums',
        urgent ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground',
        className,
      )}
      aria-live={urgent ? 'polite' : 'off'}
    >
      <Clock className="h-4 w-4" />
      {formatDuration(remaining, language, 'clock')}
    </div>
  );
}

function remainingSeconds(expiresAt: string, offsetMs: number): number {
  const serverNow = Date.now() + offsetMs;
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - serverNow) / 1000));
}
