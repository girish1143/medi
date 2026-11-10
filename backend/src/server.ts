import { createApp } from './app';
import { connectDatabase, disconnectDatabase, prisma } from './config/database';
import { getEnv } from './config/env';
import { getLogger } from './config/logger';

async function main() {
  const env = getEnv();
  const logger = getLogger();

  await connectDatabase(prisma);
  const app = createApp({ db: prisma });

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Backend API server listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Graceful shutdown initiated');
    server.close(async () => {
      await disconnectDatabase(prisma);
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main().catch((err: unknown) => {
  console.error('Fatal backend startup error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
