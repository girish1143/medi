import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { getLogger } from '../config/logger';
import { AppError, TooManyRequestsError } from '../shared/errors';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Endpoint ${req.method} ${req.originalUrl.split('?')[0]} does not exist.`,
    },
    ...(res.locals.requestId ? { requestId: res.locals.requestId } : {}),
  });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = res.locals.requestId as string | undefined;

  if (err instanceof TooManyRequestsError) {
    res.setHeader('Retry-After', String(err.retryAfterSeconds));
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
      ...(requestId ? { requestId } : {}),
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
      ...(requestId ? { requestId } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: err.issues[0]?.message ?? 'Request validation failed.',
        details: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      ...(requestId ? { requestId } : {}),
    });
    return;
  }

  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Malformed JSON request payload.',
      },
      ...(requestId ? { requestId } : {}),
    });
    return;
  }

  if (err instanceof Error && err.message.includes('not permitted by CORS policy')) {
    res.status(403).json({
      success: false,
      error: {
        code: 'CORS_FORBIDDEN',
        message: err.message,
      },
      ...(requestId ? { requestId } : {}),
    });
    return;
  }

  getLogger().error({
    requestId,
    errMessage: err instanceof Error ? err.message : 'Unknown error',
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected server error occurred.',
    },
    ...(requestId ? { requestId } : {}),
  });
}
