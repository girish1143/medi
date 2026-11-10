import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/reception.controller';
import { authenticate, requireStaff } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { walkInPatientSchema } from '../validators/clinical.validators';
import { paginationSchema } from '../validators/common';
import { asyncHandler } from '../utils/http';

const router = Router();

const patientDirectoryQuerySchema = paginationSchema.extend({
  id: z.string().uuid('Invalid identifier').optional(),
  search: z.string().trim().max(100).optional(),
});

router.use(authenticate, requireStaff);

router.get('/dashboard', asyncHandler(controller.dashboard));
router.post('/patients', validate({ body: walkInPatientSchema }), asyncHandler(controller.registerWalkIn));
router.get(
  '/patients',
  validate({ query: patientDirectoryQuerySchema }),
  asyncHandler(controller.listPatients),
);

export default router;
