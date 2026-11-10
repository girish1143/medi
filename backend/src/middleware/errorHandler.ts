import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorResponse, RequestWithContext } from '../types/api.js';
import { AppError } from '../utils/errors.js';

/**
 * Centralized Express error handler. Never leaks stack traces, database internals,
 * secrets, or PHI in HTTP error responses.
 */
export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = (req as Partial<RequestWithContext>).requestId ?? 'unknown';

  if (err instanceof AppError) {
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        requestId,
        ...(err.details ? { details: err.details } : {}),
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  if (err instanceof ZodError) {
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Input validation failed.',
        requestId,
        details: { issues: err.issues },
      },
    };
    res.status(400).json(body);
    return;
  }

  // Handle malformed JSON payloads cleanly instead of emitting HTML or stack traces
  if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400) {
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Malformed JSON request payload.',
        requestId,
      },
    };
    res.status(400).json(body);
    return;
  }

  const body: ApiErrorResponse = {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred.',
      requestId,
    },
  };
  res.status(500).json(body);
}
