import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { AppRole } from '../types/domain.js';
import { requireRoles } from '../middleware/rbac.js';
import { NotImplementedError } from '../utils/errors.js';

export interface ReservedEndpointSpec {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  allowedRoles: AppRole[];
  description: string;
}

export interface ModuleBoundarySpec {
  moduleName: string;
  basePath: string;
  endpoints: ReservedEndpointSpec[];
}

/**
 * Generates an Express router enforcing authentication + role authorization
 * at module boundaries while returning 501 NOT_IMPLEMENTED for Phase 2+ routes.
 */
export function createModuleBoundaryRouter(
  spec: ModuleBoundarySpec,
  authenticate: RequestHandler,
): Router {
  const router = Router();

  for (const endpoint of spec.endpoints) {
    router[endpoint.method](
      endpoint.path,
      authenticate,
      requireRoles(...endpoint.allowedRoles),
      (_req: Request, _res: Response, next: NextFunction) => {
        next(new NotImplementedError(spec.moduleName, endpoint.description));
      },
    );
  }

  return router;
}
