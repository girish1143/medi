import { PrismaClient } from '@prisma/client';
import { getEnv } from './env';

const globalForPrisma = globalThis as unknown as {
  backendPrisma?: PrismaClient;
};

export function createPrismaClient(databaseUrl?: string): PrismaClient {
  const url = databaseUrl ?? getEnv().DATABASE_URL;
  return new PrismaClient({
    datasources: { db: { url } },
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: PrismaClient =
  globalForPrisma.backendPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.backendPrisma = prisma;
}

export async function connectDatabase(client: PrismaClient = prisma): Promise<void> {
  await client.$connect();
  await client.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
  await client.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
}

export async function verifyDatabaseConnection(client: PrismaClient = prisma): Promise<boolean> {
  try {
    await client.$queryRawUnsafe('SELECT 1 AS ok');
    return true;
  } catch {
    return false;
  }
}

export async function disconnectDatabase(client: PrismaClient = prisma): Promise<void> {
  await client.$disconnect();
}
