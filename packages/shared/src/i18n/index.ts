import type { Language } from '../types';
import uz from './uz';
import ru from './ru';
import en from './en';

export const translations = { uz, ru, en };
export type TranslationKey = keyof typeof uz;

export function isLanguage(value: unknown): value is Language {
  return value === 'uz' || value === 'ru' || value === 'en';
}

export function translate(
  language: Language,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const dict = translations[language] ?? uz;
  const raw: string = dict[key] ?? uz[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_match, name: string) =>
    vars[name] !== undefined && vars[name] !== null ? String(vars[name]) : `{${name}}`,
  );
}

export { uz, ru, en };
