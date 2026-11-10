import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { env } from './env';
import { logger } from './logger';

type EmbeddedPostgresInstance = {
  initialise: () => Promise<void>;
  start: () => Promise<void>;
  createDatabase: (name: string) => Promise<void>;
  stop: () => Promise<void>;
};

let instance: EmbeddedPostgresInstance | null = null;

function portIsOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const finish = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(1000);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function waitForPort(port: number, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portIsOpen(port)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`PostgreSQL did not start on port ${port}`);
}

/**
 * A port check alone is not enough: a crashed/orphaned postmaster can keep the
 * socket bound while refusing all queries. Verify with a real connection.
 */
async function databaseResponds(timeoutMs = 3_000): Promise<boolean> {
  const client = new Client({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
  });
  try {
    await client.connect();
    await client.query('select 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function killStalePostgres(): Promise<void> {
  if (process.platform !== 'win32') return;
  try {
    const { execFileSync } = await import('node:child_process');
    execFileSync('taskkill', ['/IM', 'postgres.exe', '/F'], { stdio: 'ignore' });
  } catch {
    // no matching processes
  }
  await new Promise((r) => setTimeout(r, 1_000));
}

/**
 * Starts an embedded PostgreSQL instance for local development. Never runs in
 * production - production uses Supabase/PostgreSQL via DATABASE_URL.
 */
export async function ensureDevDatabase(): Promise<void> {
  if (!env.DEV_EMBEDDED_PG || env.isProd) return;

  if (await portIsOpen(env.DEV_PG_PORT)) {
    if (await databaseResponds()) {
      logger.info({ port: env.DEV_PG_PORT }, 'Using already running local PostgreSQL');
      return;
    }
    logger.warn({ port: env.DEV_PG_PORT }, 'Local PostgreSQL port is open but not answering - restarting it');
    const stalePidFile = path.join(path.resolve(__dirname, '../../', env.DEV_PG_DIR), 'postmaster.pid');
    if (fs.existsSync(stalePidFile)) {
      const pid = parseInt(fs.readFileSync(stalePidFile, 'utf8').split('\n')[0].trim(), 10);
      if (!Number.isNaN(pid)) {
        try {
          process.kill(pid);
          await new Promise((r) => setTimeout(r, 1_500));
        } catch {
          // already gone
        }
      }
      fs.rmSync(stalePidFile, { force: true });
    }
    // Orphaned postgres children can inherit (and keep) the listening socket.
    await killStalePostgres();
  }

  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const databaseDir = path.resolve(__dirname, '../../', env.DEV_PG_DIR);

  instance = new EmbeddedPostgres({
    databaseDir,
    user: 'postgres',
    password: 'postgres',
    port: env.DEV_PG_PORT,
    persistent: true,
    onLog: (message: string) => logger.debug({ pg: message.trim() }, 'embedded postgres'),
    onError: (error: unknown) => logger.error({ err: error }, 'embedded postgres error'),
  }) as unknown as EmbeddedPostgresInstance;

  logger.info({ databaseDir, port: env.DEV_PG_PORT }, 'Starting embedded PostgreSQL');
  const alreadyInitialised = fs.existsSync(path.join(databaseDir, 'PG_VERSION'));
  if (!alreadyInitialised) {
    await instance.initialise();
  }
  await instance.start();
  await waitForPort(env.DEV_PG_PORT);

  const databaseName = new URL(env.DATABASE_URL).pathname.replace('/', '') || 'medibook';
  try {
    await instance.createDatabase(databaseName);
    logger.info({ databaseName }, 'Created local database');
  } catch {
    logger.debug({ databaseName }, 'Local database already exists');
  }
}

export async function stopDevDatabase(): Promise<void> {
  if (instance) {
    try {
      await instance.stop();
    } catch (error) {
      logger.warn({ err: error }, 'Failed to stop embedded PostgreSQL');
    }
    instance = null;
  }
}

export async function isPortOpen(port: number): Promise<boolean> {
  return portIsOpen(port);
}
