import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { getBackendEnv, type BackendEnv } from './config/env.js';
import { getSupabaseServiceClient } from './config/supabase.js';
import {
  createAuthMiddleware,
  createSupabaseAuthResolver,
  type AuthTokenResolver,
} from './middleware/auth.js';
import { errorHandlerMiddleware } from './middleware/errorHandler.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { createModuleBoundaryRouter } from './modules/boundaryFactory.js';
import { createHealthRouter } from './modules/health/routes.js';
import { MODULE_BOUNDARIES } from './modules/registry.js';
import { NotFoundError } from './utils/errors.js';

export interface CreateAppOptions {
  env?: BackendEnv;
  authResolver?: AuthTokenResolver;
}

/**
 * Constructs and configures the Express application with security middleware,
 * health liveness probe, and protected Phase 1 module boundaries.
 */
export function createApp(options: CreateAppOptions = {}): Express {
  const env = options.env ?? getBackendEnv();
  const authResolver =
    options.authResolver ?? createSupabaseAuthResolver(getSupabaseServiceClient(env));
  const authenticate = createAuthMiddleware(authResolver);

  const app = express();
  app.disable('x-powered-by');

  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ALLOWED_ORIGINS,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
      credentials: false,
    }),
  );
  app.use(express.json({ limit: '256kb' }));

  app.use('/health', createHealthRouter(env));

  for (const moduleSpec of MODULE_BOUNDARIES) {
    app.use(moduleSpec.basePath, createModuleBoundaryRouter(moduleSpec, authenticate));
  }

  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError(`Route '${req.method} ${req.originalUrl}' not found.`));
  });

  app.use(errorHandlerMiddleware);

  return app;
}
