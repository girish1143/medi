import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { ValidationError } from '../utils/errors.js';

export interface RequestValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validates Express request segments (body, query, params) using Zod schemas.
 */
export function validateRequest(schemas: RequestValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) {
        const parsed = schemas.params.safeParse(req.params);
        if (!parsed.success) {
          throw new ValidationError('Invalid route parameters.', {
            issues: parsed.error.issues,
          });
        }
        req.params = parsed.data as Request['params'];
      }

      if (schemas.query) {
        const parsed = schemas.query.safeParse(req.query);
        if (!parsed.success) {
          throw new ValidationError('Invalid query parameters.', {
            issues: parsed.error.issues,
          });
        }
        req.query = parsed.data as Request['query'];
      }

      if (schemas.body) {
        const parsed = schemas.body.safeParse(req.body);
        if (!parsed.success) {
          throw new ValidationError('Invalid request body.', {
            issues: parsed.error.issues,
          });
        }
        req.body = parsed.data;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
