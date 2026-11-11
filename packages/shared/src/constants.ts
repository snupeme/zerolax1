import type { Difficulty } from './types';

export const LANGUAGES = ['uz', 'ru', 'en'] as const;

export const LANGUAGE_LABELS: Record<(typeof LANGUAGES)[number], string> = {
  uz: "O'zbekcha",
  ru: 'Русский',
  en: 'English',
};

export const LANGUAGE_FLAGS: Record<(typeof LANGUAGES)[number], string> = {
  uz: '🇺🇿',
  ru: '🇷🇺',
  en: '🇬🇧',
};

export const TIMEZONE = 'Asia/Tashkent';
/** Uzbekistan has used a fixed UTC+5 offset since 1991 (no DST). */
export const TASHKENT_UTC_OFFSET_HOURS = 5;
export const DAILY_IQ_PUBLISH_HOUR = 9;

export const DIFFICULTY_COINS: Record<Difficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

export const IQ_QUESTIONS_PER_TEST = 10;
export const ENTRANCE_QUESTIONS_PER_TEST = 20;
export const IQ_RESULT_RELEASE_HOURS = 24;
export const MAX_NICKNAME_LENGTH = 24;
export const MIN_NICKNAME_LENGTH = 3;
