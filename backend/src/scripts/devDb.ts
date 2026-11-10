import { ensureDevDatabase, isPortOpen } from '../config/devDatabase';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Keeps the embedded development PostgreSQL process alive while the API runs.
 * Run via `npm run db:dev` (or `npm run dev`, which starts both).
 */
async function main(): Promise<void> {
  if (!env.DEV_EMBEDDED_PG) {
    logger.info('DEV_EMBEDDED_PG is disabled - nothing to start');
    return;
  }
  await ensureDevDatabase();
  logger.info({ port: env.DEV_PG_PORT }, 'Local PostgreSQL is ready');

  const shutdown = async () => {
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  // Keep the process (and therefore the database) alive.
  setInterval(async () => {
    if (!(await isPortOpen(env.DEV_PG_PORT))) {
      logger.error('Embedded PostgreSQL stopped unexpectedly');
      process.exit(1);
    }
  }, 15_000);
}

void main();
