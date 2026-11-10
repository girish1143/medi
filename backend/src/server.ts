import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { pool } from './config/database';
import { runMigrations, runSeedFile } from './config/migrate';
import { seedDemoData } from './config/seedData';
import { startBackgroundJobs, stopBackgroundJobs } from './jobs';
import { stopDevDatabase } from './config/devDatabase';

async function waitForDatabase(attempts = 60): Promise<void> {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await pool.query('select 1');
      return;
    } catch (error) {
      if (i === attempts) throw error;
      if (i === 1) logger.info('Waiting for PostgreSQL to become available...');
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

async function bootstrap(): Promise<void> {
  await waitForDatabase();

  if (env.AUTO_MIGRATE) {
    await runMigrations();
    await runSeedFile();
  }

  if (env.SEED_ON_START) {
    await seedDemoData();
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, auth: env.AUTH_PROVIDER, payments: env.PAYMENTS_MODE },
      `MediBook API listening on http://localhost:${env.PORT}`,
    );
  });

  if (env.REMINDER_CRON_ENABLED) startBackgroundJobs();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    stopBackgroundJobs();
    server.close();
    await pool.end().catch(() => undefined);
    await stopDevDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch(async (error) => {
  logger.fatal({ err: error }, 'Failed to start MediBook API');
  await pool.end().catch(() => undefined);
  await stopDevDatabase();
  process.exit(1);
});
