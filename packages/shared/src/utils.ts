import { TASHKENT_UTC_OFFSET_HOURS, TIMEZONE } from './constants';
import type { Language } from './types';

const LOCALES: Record<Language, string> = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-GB' };

/** Returns the current (or provided) date as YYYY-MM-DD in the Asia/Tashkent timezone. */
export function tashkentDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** UTC instant when a given Tashkent calendar day starts (00:00 +05:00). */
export function tashkentDayStartUtc(dateString: string): Date {
  return new Date(`${dateString}T00:00:00+0${TASHKENT_UTC_OFFSET_HOURS}:00`);
}

/** UTC instant of 09:00 Asia/Tashkent for a given calendar date. */
export function tashkentPublishInstant(dateString: string): Date {
  const hour = String(9).padStart(2, '0');
  return new Date(`${dateString}T${hour}:00:00+0${TASHKENT_UTC_OFFSET_HOURS}:00`);
}

export function addDaysToDateString(dateString: string, days: number): string {
  const date = tashkentDayStartUtc(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return tashkentDateString(date);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function formatDate(
  value: string | Date,
  language: Language,
  options: { withTime?: boolean; short?: boolean } = {},
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  const formatter = new Intl.DateTimeFormat(LOCALES[language] ?? 'en-GB', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: options.short ? 'short' : 'long',
    year: 'numeric',
    ...(options.withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  });
  return formatter.format(date);
}

export function formatTime(value: string | Date, language: Language): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(LOCALES[language] ?? 'en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatNumber(value: number, language: Language): string {
  return new Intl.NumberFormat(LOCALES[language] ?? 'en-GB').format(value);
}

/** Formats a duration in seconds. `clock` → 12:34, `long` → 12 daq. 34 son. */
export function formatDuration(
  totalSeconds: number,
  language: Language,
  style: 'clock' | 'long' = 'clock',
): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  if (style === 'clock') {
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
  }
  if (hours > 0) {
    return `${hours} ${language === 'ru' ? 'ч' : language === 'uz' ? 'soat' : 'h'} ${minutes} ${
      language === 'ru' ? 'мин' : language === 'uz' ? 'daq' : 'min'
    }`;
  }
  if (minutes > 0) {
    return `${minutes} ${language === 'ru' ? 'мин' : language === 'uz' ? 'daq' : 'min'} ${seconds} ${
      language === 'ru' ? 'сек' : language === 'uz' ? 'son' : 'sec'
    }`;
  }
  return `${seconds} ${language === 'ru' ? 'сек' : language === 'uz' ? 'son' : 'sec'}`;
}

export function percentage(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Picks a localized field from a DB row with uz/ru/en columns. */
export function localized(
  row: Record<string, unknown>,
  prefix: string,
  language: Language,
): string {
  const value = row[`${prefix}_${language}`] ?? row[`${prefix}_uz`] ?? row[prefix] ?? '';
  return String(value ?? '');
}
