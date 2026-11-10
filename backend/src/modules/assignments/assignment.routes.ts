import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { createAuthenticateMiddleware } from '../../middleware/authenticate';
import { authorizeRoles } from '../../middleware/authorize';
import { csrfProtection } from '../../middleware/csrf-protection';
import { validateRequest } from '../../middleware/validate-request';
import { asyncHandler, okResponse } from '../../shared/utils';
import { uuidSchema } from '../../shared/validators';
import { AssignmentService } from './assignment.service';

const respondSchema = z.object({
  decision: z.enum(['ACCEPTED', 'REJECTED']),
  rejectionReason: z.string().trim().max(500).optional(),
});

const idParam = z.object({ id: uuidSchema });

export function createAssignmentRoutes(db: PrismaClient = prisma): Router {
  const router = Router();
  const service = new AssignmentService(db);
  const authenticate = createAuthenticateMiddleware(db);

  router.post(
    '/:id/respond',
    csrfProtection,
    authenticate,
    authorizeRoles(['DOCTOR', 'HOSPITAL'], db),
    validateRequest({ params: idParam, body: respondSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof respondSchema>;
      const principal = req.principal!;
      const assignment = await service.respondToAssignment({
        assignmentId: String(req.params.id),
        actorUserId: principal.userId,
        actorRole: principal.role as 'DOCTOR' | 'HOSPITAL',
        decision: body.decision,
        rejectionReason: body.rejectionReason,
      });
      return okResponse(res, { assignment });
    }),
  );

  return router;
}
