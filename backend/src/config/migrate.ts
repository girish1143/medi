import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from './env';
import { logger } from './logger';
import { pool } from './database';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');
const DEV_MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/dev');
const SEED_FILE = path.resolve(__dirname, '../../supabase/seed.sql');

async function ensureMigrationTable(): Promise<void> {
  await pool.query(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function listSqlFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((f) => f.endsWith('.sql')).sort();
  } catch {
    return [];
  }
}

async function applyDirectory(dir: string, label: string): Promise<void> {
  for (const file of await listSqlFiles(dir)) {
    const key = `${label}/${file}`;
    const existing = await pool.query('select 1 from schema_migrations where name = $1', [key]);
    if (existing.rowCount) continue;

    const sql = await fs.readFile(path.join(dir, file), 'utf8');
    logger.info({ migration: key }, 'Applying migration');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('insert into schema_migrations (name) values ($1)', [key]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error, migration: key }, 'Migration failed');
      throw error;
    } finally {
      client.release();
    }
  }
}

export async function runMigrations(): Promise<void> {
  await ensureMigrationTable();
  await applyDirectory(MIGRATIONS_DIR, 'migrations');
  if (!env.isProd) {
    await applyDirectory(DEV_MIGRATIONS_DIR, 'dev');
  }
  logger.info('Database migrations are up to date');
}

export async function runSeedFile(): Promise<void> {
  const sql = await fs.readFile(SEED_FILE, 'utf8');
  await pool.query(sql);
  logger.info('Reference seed data applied');
}
