import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';
import { AppError, isPgError } from '../utils/errors';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.path} not found`));
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong';
  let details: unknown;

  if (error instanceof AppError) {
    status = error.status;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof ZodError) {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = error.flatten().fieldErrors;
  } else if (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'MulterError'
  ) {
    status = 422;
    code = 'UPLOAD_ERROR';
    const multerCode = (error as { code?: string }).code;
    message =
      multerCode === 'LIMIT_FILE_SIZE'
        ? 'File must be 10 MB or smaller'
        : 'Only one file can be uploaded at a time';
  } else if (isPgError(error)) {
    switch (error.code) {
      case '23505':
        status = 409;
        code = 'DUPLICATE_RECORD';
        message = 'This record already exists';
        break;
      case '23P01':
        status = 409;
        code = 'SLOT_UNAVAILABLE';
        message = 'This time slot has just been booked. Please choose another slot.';
        break;
      case '23503':
        status = 409;
        code = 'RELATED_RECORD_MISSING';
        message = 'A related record no longer exists';
        break;
      case '22P02':
        status = 400;
        code = 'INVALID_INPUT';
        message = 'Invalid identifier format';
        break;
      case '23514':
        status = 422;
        code = 'CONSTRAINT_VIOLATION';
        message = 'The submitted data violates a business rule';
        break;
      default:
        status = 500;
        message = 'Database operation failed';
    }
  }

  if (status >= 500) {
    logger.error(
      { err: error, method: req.method, path: req.path, requestId: req.requestId },
      'Unhandled request error',
    );
  } else {
    logger.warn({ code, method: req.method, path: req.path, status }, 'Request rejected');
  }

  res.status(status).json({
    success: false,
    message,
    code,
    ...(details ? { details } : {}),
    ...(req.requestId ? { requestId: req.requestId } : {}),
  });
}
