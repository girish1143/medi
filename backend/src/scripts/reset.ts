import { ensureDevDatabase, stopDevDatabase } from '../config/devDatabase';
import { runMigrations, runSeedFile } from '../config/migrate';
import { seedDemoData } from '../config/seedData';
import { pool } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Destructive development reset. Refuses to run against non-local database
 * hosts or in production.
 */
async function main(): Promise<void> {
  if (env.isProd) throw new Error('db:reset is disabled in production');
  const url = new URL(env.DATABASE_URL);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error('db:reset only runs against a local database');
  }

  await ensureDevDatabase();
  try {
    await pool.query('select 1');
    logger.warn({ database: url.pathname }, 'Dropping and recreating public schema');
    await pool.query('drop schema public cascade');
    await pool.query('create schema public');
    await pool.query('drop schema if exists auth cascade');
    await runMigrations();
    await runSeedFile();
    await seedDemoData();
    logger.info('Database reset complete');
  } finally {
    await pool.end();
    await stopDevDatabase();
  }
}

main().catch(async (error) => {
  logger.fatal({ err: error }, 'Reset failed');
  await stopDevDatabase();
  process.exit(1);
});
