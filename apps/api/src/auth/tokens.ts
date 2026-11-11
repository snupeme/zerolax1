import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { ApiError } from '../errors';
import type { AppConfig } from '../config';
import type { ProfileRow } from '@zerolax/db';

const ISSUER = 'zerolax';
const USER_AUDIENCE = 'zerolax-user';
const ADMIN_AUDIENCE = 'zerolax-admin';

function secret(config: AppConfig): Uint8Array {
  return new TextEncoder().encode(config.jwtSecret);
}

export async function signUserAccessToken(
  config: AppConfig,
  profile: Pick<ProfileRow, 'id'>,
): Promise<string> {
  return new SignJWT({ role: 'user' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(USER_AUDIENCE)
    .setSubject(profile.id)
    .setIssuedAt()
    .setExpirationTime(`${config.accessTtlSeconds}s`)
    .sign(secret(config));
}

export async function verifyUserAccessToken(
  config: AppConfig,
  token: string,
): Promise<{ profileId: string }> {
  try {
    const { payload } = await jwtVerify(token, secret(config), {
      issuer: ISSUER,
      audience: USER_AUDIENCE,
    });
    if (!payload.sub) throw new Error('missing sub');
    return { profileId: payload.sub };
  } catch {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid or expired access token');
  }
}

export async function signAdminAccessToken(
  config: AppConfig,
  admin: { id: string; email: string; role: string },
): Promise<string> {
  return new SignJWT({ role: admin.role, email: admin.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(ADMIN_AUDIENCE)
    .setSubject(admin.id)
    .setIssuedAt()
    .setExpirationTime(`${config.accessTtlSeconds}s`)
    .sign(secret(config));
}

export async function verifyAdminAccessToken(
  config: AppConfig,
  token: string,
): Promise<{ adminId: string }> {
  try {
    const { payload } = await jwtVerify(token, secret(config), {
      issuer: ISSUER,
      audience: ADMIN_AUDIENCE,
    });
    if (!payload.sub) throw new Error('missing sub');
    return { adminId: payload.sub };
  } catch {
    throw new ApiError(401, 'ADMIN_UNAUTHORIZED', 'Invalid or expired admin token');
  }
}

export function newRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(48).toString('hex');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
