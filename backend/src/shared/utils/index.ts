import type { NextFunction, Request, Response } from 'express';
import type { PaginationMeta } from '../types';

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function okResponse<T>(res: Response, data: T, statusCode = 200): Response {
  return res.status(statusCode).json({
    success: true,
    data,
    ...(res.locals.requestId ? { requestId: res.locals.requestId } : {}),
  });
}

export function createdResponse<T>(res: Response, data: T): Response {
  return okResponse(res, data, 201);
}

export function buildPaginationMeta(page: number, pageSize: number, total: number): PaginationMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
