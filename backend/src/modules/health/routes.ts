import { Router, type Request, type Response } from 'express';
import type { BackendEnv } from '../../config/env.js';
import type { ApiSuccessResponse, RequestWithContext } from '../../types/api.js';

export function createHealthRouter(env: BackendEnv): Router {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    const requestId = (req as RequestWithContext).requestId;
    const payload: ApiSuccessResponse<{
      status: 'ok';
      service: string;
      environment: BackendEnv['NODE_ENV'];
      phase: string;
    }> = {
      success: true,
      data: {
        status: 'ok',
        service: 'healthcare-lead-platform-backend',
        environment: env.NODE_ENV,
        phase: 'foundation',
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    };
    res.status(200).json(payload);
  });

  return router;
}
