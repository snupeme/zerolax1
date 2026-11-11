import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../errors';

export interface TelegramUserPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface VerifiedInitData {
  user: TelegramUserPayload;
  authDate: number;
}

const MAX_CLOCK_SKEW_SECONDS = 60;

/**
 * Validates Telegram WebApp initData exactly as described in the Telegram docs:
 *   secret_key = HMAC_SHA256(key="WebAppData", message=bot_token)
 *   hash       = HMAC_SHA256(key=secret_key, message=data_check_string)
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  options: { maxAgeSeconds?: number; now?: number } = {},
): VerifiedInitData {
  const maxAgeSeconds = options.maxAgeSeconds ?? 300;
  const nowMs = options.now ?? Date.now();

  if (!initData || initData.length === 0) {
    throw new ApiError(401, 'TELEGRAM_AUTH_MISSING', 'Telegram initData is missing');
  }
  if (!botToken) {
    throw new ApiError(503, 'BOT_NOT_CONFIGURED', 'Telegram bot token is not configured');
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash) {
    throw new ApiError(401, 'TELEGRAM_AUTH_INVALID', 'Telegram initData has no hash');
  }
  params.delete('hash');
  // Bot-token HMAC includes every field except hash, including signature.
  // Only the separate Ed25519 third-party validation excludes signature.

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const receivedBuffer = Buffer.from(receivedHash, 'utf8');
  const computedBuffer = Buffer.from(computedHash, 'utf8');
  if (
    receivedBuffer.length !== computedBuffer.length ||
    !timingSafeEqual(receivedBuffer, computedBuffer)
  ) {
    throw new ApiError(401, 'TELEGRAM_AUTH_INVALID', 'Telegram initData signature is invalid');
  }

  const authDateRaw = params.get('auth_date');
  const authDate = Number.parseInt(authDateRaw ?? '', 10);
  if (!Number.isFinite(authDate) || authDate <= 0) {
    throw new ApiError(401, 'TELEGRAM_AUTH_INVALID', 'Telegram initData has no auth_date');
  }

  const ageSeconds = Math.floor(nowMs / 1000) - authDate;
  if (ageSeconds > maxAgeSeconds) {
    throw new ApiError(401, 'TELEGRAM_AUTH_EXPIRED', 'Telegram initData has expired');
  }
  if (ageSeconds < -MAX_CLOCK_SKEW_SECONDS) {
    throw new ApiError(401, 'TELEGRAM_AUTH_INVALID', 'Telegram initData auth_date is in the future');
  }

  const userRaw = params.get('user');
  if (!userRaw) {
    throw new ApiError(401, 'TELEGRAM_AUTH_INVALID', 'Telegram initData has no user');
  }

  let user: TelegramUserPayload;
  try {
    user = JSON.parse(userRaw) as TelegramUserPayload;
  } catch {
    throw new ApiError(401, 'TELEGRAM_AUTH_INVALID', 'Telegram initData user is invalid');
  }

  if (!user || typeof user.id !== 'number' || !Number.isFinite(user.id)) {
    throw new ApiError(401, 'TELEGRAM_AUTH_INVALID', 'Telegram user id is missing');
  }

  return { user, authDate };
}
