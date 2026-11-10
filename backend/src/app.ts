import crypto from 'node:crypto';
import express, { Request } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { apiLimiter } from './middlewares/rateLimit';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import routes from './routes';
import { pool } from './config/database';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: env.isProd ? undefined : false,
    }),
  );

  const allowedOrigins = new Set([...env.CORS_ORIGINS, env.FRONTEND_URL]);
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
        return callback(new Error('Origin not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Razorpay-Signature'],
      maxAge: 600,
    }),
  );

  // Razorpay requires the raw request body for signature verification.
  app.use('/api/v1/payments/webhook', express.raw({ type: '*/*', limit: '2mb' }));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(compression());

  app.use(
    pinoHttp({
      logger,
      genReqId: (req: Request) => {
        const incoming = req.headers['x-request-id'];
        return typeof incoming === 'string' && incoming.length < 100 ? incoming : crypto.randomUUID();
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.use((req, _res, next) => {
    req.requestId = String((req as Request & { id?: string }).id ?? crypto.randomUUID());
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ success: true, message: 'MediBook API is running', data: { uptime: process.uptime(), env: env.NODE_ENV } });
  });

  app.get('/health/ready', async (_req, res) => {
    try {
      await pool.query('select 1');
      res.json({ success: true, message: 'Ready', data: { database: 'connected' } });
    } catch {
      res.status(503).json({ success: false, message: 'Database unavailable', code: 'NOT_READY' });
    }
  });

  app.use('/api/v1', apiLimiter, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
