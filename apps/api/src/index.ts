import { createDb, runMigrations } from '@zerolax/db';
import { loadConfig } from './config';
import { buildApp } from './app';
import { bootstrapAdmin } from './services/admin';
import { startScheduler } from './workers/scheduler';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = await createDb({
    databaseUrl: config.databaseUrl,
    ssl: config.databaseSsl,
    pgliteDir: config.pgliteDir,
  });

  await runMigrations(db);
  await bootstrapAdmin(db, config);

  const app = await buildApp({ config, db });
  const scheduler = startScheduler({
    db,
    config,
    log: (message, details) => app.log.info({ details }, message),
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`received ${signal}, shutting down`);
    scheduler.stop();
    await app.close().catch(() => undefined);
    await db.close().catch(() => undefined);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    {
      port: config.port,
      database: config.databaseUrl ? 'postgres' : `pglite:${config.pgliteDir}`,
      devAuth: config.devAuthEnabled,
      botConfigured: Boolean(config.botToken),
    },
    'ZEROLAX API ready',
  );

  if (!config.botToken) {
    app.log.warn('TELEGRAM_BOT_TOKEN is not configured — bot notifications are stored but not delivered');
  }
}

void main().catch((error) => {
  console.error('[api] fatal startup error', error);
  process.exit(1);
});
