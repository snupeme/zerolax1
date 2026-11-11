import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Db, Queryable } from '@zerolax/db';
import type { AppConfig } from '../config';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export async function bootstrapAdmin(db: Db, config: AppConfig): Promise<void> {
  if (!config.adminEmail || !config.adminPassword) return;

  const existing = await db.query<{ id: string }>(
    'select id from admin_users where lower(email) = lower($1)',
    [config.adminEmail],
  );
  if (existing.length > 0) return;

  await db.query(
    `insert into admin_users (email, name, password_hash, role)
     values ($1, $2, $3, 'superadmin')`,
    [config.adminEmail, config.adminName, hashPassword(config.adminPassword)],
  );
  console.log(`[admin] bootstrap admin created for ${config.adminEmail}`);
}

export async function recordAudit(
  db: Queryable,
  input: {
    adminId: string;
    action: string;
    entityType?: string | null;
    entityId?: string | null;
    details?: unknown;
  },
): Promise<void> {
  await db.query(
    `insert into admin_audit_logs (admin_id, action, entity_type, entity_id, details)
     values ($1, $2, $3, $4, $5)`,
    [
      input.adminId,
      input.action,
      input.entityType ?? null,
      input.entityId ?? null,
      input.details === undefined ? null : JSON.stringify(input.details),
    ],
  );
}
