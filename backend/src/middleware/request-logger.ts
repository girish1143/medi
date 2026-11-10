import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getLogger } from '../config/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const existingId = req.header('x-request-id')?.trim();
  const requestId = existingId && existingId.length <= 100 ? existingId : crypto.randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    getLogger().info({
      requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    });
  });

  next();
}
