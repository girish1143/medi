import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

export interface RequestSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validateRequest(schemas: RequestSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as Record<string, string>;
      }
      if (schemas.query) {
        const parsedQuery = schemas.query.parse(req.query);
        Object.assign(req.query, parsedQuery);
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
