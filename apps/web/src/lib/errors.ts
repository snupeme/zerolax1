import type { TranslationKey } from '@zerolax/shared';
import { ApiError } from './api';

const CODE_TO_KEY: Record<string, TranslationKey> = {
  NETWORK_ERROR: 'errors.network',
  UNAUTHORIZED: 'errors.unauthorized',
  ADMIN_UNAUTHORIZED: 'errors.unauthorized',
  FORBIDDEN: 'errors.forbidden',
  ADMIN_FORBIDDEN: 'errors.forbidden',
  ACCOUNT_BLOCKED: 'errors.blocked',
  RATE_LIMITED: 'errors.rateLimited',
  REGISTRATION_REQUIRED: 'errors.registrationRequired',
  TEST_NOT_AVAILABLE: 'errors.testNotAvailable',
  ALREADY_SUBMITTED: 'errors.alreadySubmitted',
  DAILY_LIMIT: 'errors.dailyLimit',
  ATTEMPT_EXPIRED: 'errors.attemptExpired',
  INVALID_ANSWER: 'errors.invalidAnswer',
  VALIDATION_ERROR: 'errors.validation',
  BOT_NOT_CONFIGURED: 'errors.botNotConfigured',
  DEV_AUTH_DISABLED: 'errors.devDisabled',
  NICKNAME_TAKEN: 'bot.nicknameTaken',
  INVALID_CREDENTIALS: 'admin.invalidCredentials',
  INTERNAL_ERROR: 'errors.generic',
};

export function errorKey(error: unknown): TranslationKey {
  if (error instanceof ApiError) {
    return CODE_TO_KEY[error.code] ?? 'errors.generic';
  }
  return 'errors.generic';
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
