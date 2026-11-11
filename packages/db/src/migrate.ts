import type { Db } from './types';
import { migrations } from './migrations.generated';

export async function runMigrations(db: Db): Promise<void> {
  await db.exec(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  for (const migration of migrations) {
    const existing = await db.query('select 1 from schema_migrations where name = $1', [
      migration.name,
    ]);
    if (existing.length > 0) continue;

    await db.transaction(async (tx) => {
      await tx.exec(migration.sql);
      await tx.query('insert into schema_migrations (name) values ($1)', [migration.name]);
    });
    console.log(`[db] migration applied: ${migration.name}`);
  }
}
