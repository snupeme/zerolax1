import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import type { CreateDbOptions, Db, Queryable } from './types';

function createPgliteDb(dir: string | undefined, memory: boolean): Promise<Db> {
  const client = memory || !dir ? new PGlite() : new PGlite(dir);

  return (async () => {
    await client.waitReady;

    const db: Db = {
      dialect: 'pglite',
      async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
        const result = await client.query(sql, params);
        return result.rows as T[];
      },
      async exec(sql: string): Promise<void> {
        await client.exec(sql);
      },
      async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
        return client.transaction(async (tx) =>
          fn({
            async query<R = Record<string, unknown>>(sql: string, params: unknown[] = []) {
              const result = await tx.query(sql, params);
              return result.rows as R[];
            },
            async exec(sql: string) {
              await tx.exec(sql);
            },
          }),
        ) as Promise<T>;
      },
      async close() {
        await client.close();
      },
    };

    return db;
  })();
}

async function createPostgresDb(databaseUrl: string, ssl: boolean): Promise<Db> {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
  pool.on('error', (error) => {
    console.error('[db] idle client error', error);
  });

  const db: Db = {
    dialect: 'postgres',
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      const result = await pool.query(sql, params);
      return result.rows as T[];
    },
    async exec(sql: string): Promise<void> {
      await pool.query(sql);
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn({
          async query<R = Record<string, unknown>>(sql: string, params: unknown[] = []) {
            const queryResult = await client.query(sql, params);
            return queryResult.rows as R[];
          },
          async exec(sql: string) {
            await client.query(sql);
          },
        });
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };

  return db;
}

export async function createDb(options: CreateDbOptions = {}): Promise<Db> {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (databaseUrl && databaseUrl.trim().length > 0) {
    const ssl =
      options.ssl ??
      (process.env.DATABASE_SSL === 'true' || databaseUrl.includes('supabase.co'));
    return createPostgresDb(databaseUrl, ssl);
  }

  const dir = options.pgliteDir ?? process.env.PGLITE_DIR ?? '.data/zerolax';
  return createPgliteDb(dir, options.memory ?? false);
}
