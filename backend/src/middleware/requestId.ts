import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { RequestWithContext } from '../types/api.js';

const SAFE_REQUEST_ID_PATTERN = /^[a-zA-Z0-9._-]{8,64}$/;

/**
 * Attaches a sanitized correlation ID to every incoming request and response.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const headerValue = req.header('x-request-id');
  const requestId =
    headerValue && SAFE_REQUEST_ID_PATTERN.test(headerValue) ? headerValue : randomUUID();

  (req as RequestWithContext).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
