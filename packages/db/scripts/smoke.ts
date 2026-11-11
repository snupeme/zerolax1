import { createDb } from '../src/client';
import { runMigrations } from '../src/migrate';

async function main(): Promise<void> {
  const db = await createDb({ memory: true });
  await runMigrations(db);
  const rows = await db.query<{ count: number }>('select count(*)::int as count from profiles');
  console.log('OK profiles count:', rows[0]?.count);
  const tables = await db.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
  );
  console.log('tables:', tables.map((t) => t.table_name).join(', '));
  await db.close();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
