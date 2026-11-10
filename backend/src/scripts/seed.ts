import { ensureDevDatabase, stopDevDatabase } from '../config/devDatabase';
import { runMigrations, runSeedFile } from '../config/migrate';
import { seedDemoData } from '../config/seedData';
import { pool } from '../config/database';
import { logger } from '../config/logger';

async function main(): Promise<void> {
  await ensureDevDatabase();
  try {
    await pool.query('select 1');
    await runMigrations();
    await runSeedFile();
    await seedDemoData();
    logger.info('Seed complete');
  } finally {
    await pool.end();
    await stopDevDatabase();
  }
}

main().catch(async (error) => {
  logger.fatal({ err: error }, 'Seed failed');
  await stopDevDatabase();
  process.exit(1);
});
