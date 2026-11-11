import type { Language } from '@zerolax/shared';

export type { Language };

/** Returns `<prefix>_<language>` from a row, falling back to Uzbek, then `<prefix>`. */
export function localizeText(row: unknown, prefix: string, language: Language): string {
  const record = (row ?? {}) as Record<string, unknown>;
  const value = record[`${prefix}_${language}`] ?? record[`${prefix}_uz`] ?? record[prefix] ?? '';
  return value === null || value === undefined ? '' : String(value);
}
