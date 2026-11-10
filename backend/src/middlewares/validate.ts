import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodError, ZodTypeAny } from 'zod';
import { AppError } from '../utils/errors';

type RequestSchemas = {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
};

export function validate(schemas: RequestSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) req.query = schemas.query.parse(req.query) as Request['query'];
      if (schemas.params) req.params = schemas.params.parse(req.params) as Request['params'];
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          new AppError(
            422,
            'VALIDATION_ERROR',
            'Please check the highlighted fields and try again',
            error.flatten().fieldErrors,
          ),
        );
        return;
      }
      next(error);
    }
  };
}

export function parseOrThrow<T extends ZodTypeAny>(schema: T, data: unknown): ReturnType<T['parse']> {
  return schema.parse(data);
}

export type { AnyZodObject };
