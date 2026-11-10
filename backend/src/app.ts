import type { PrismaClient } from '@prisma/client';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { buildCorsOptions } from './config/cors';
import { prisma } from './config/database';
import { SECURITY_CONSTANTS } from './config/security';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import type { TokenDispatcher } from './modules/auth/auth.service';
import { createApiV1Router } from './routes';

export interface AppDependencies {
  db?: PrismaClient;
  dispatchToken?: TokenDispatcher;
}

export function createApp(deps: AppDependencies = {}): Express {
  const app = express();
  const db = deps.db ?? prisma;

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestLogger);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  );
  app.use(cors(buildCorsOptions()));
  app.use(compression());
  app.use(express.json({ limit: SECURITY_CONSTANTS.MAX_JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: SECURITY_CONSTANTS.MAX_JSON_BODY_LIMIT }));
  app.use(cookieParser());

  app.use('/api/v1', createApiV1Router({ db, dispatchToken: deps.dispatchToken }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
