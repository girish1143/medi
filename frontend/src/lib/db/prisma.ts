import { PrismaClient } from '@prisma/client';
import { getServerEnv } from '../env';

if (typeof window !== 'undefined') {
  throw new Error('SECURITY VIOLATION: PrismaClient cannot be imported or executed in browser bundles.');
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  getServerEnv();
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

/**
 * Reusable server-only Prisma Client singleton with Next.js dev HMR guard.
 */
export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Executes a lightweight SQLite connectivity check (`SELECT 1`).
 */
export async function verifyDatabaseConnectivity(): Promise<boolean> {
  const result = await prisma.$queryRaw<Array<{ ok: number | bigint }>>`SELECT 1 AS ok`;
  return Number(result[0]?.ok) === 1;
}
