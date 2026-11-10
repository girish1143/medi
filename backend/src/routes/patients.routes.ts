import { Router } from 'express';
import * as controller from '../controllers/patient.controller';
import { authenticate, requirePatient, requireStaff } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { patientProfileUpdateSchema } from '../validators/clinical.validators';
import { asyncHandler } from '../utils/http';

const router = Router();

router.use(authenticate);

router.get('/me', requirePatient, asyncHandler(controller.getProfile));
router.patch(
  '/me',
  requirePatient,
  validate({ body: patientProfileUpdateSchema }),
  asyncHandler(controller.updateProfile),
);
router.get('/me/dashboard', requirePatient, asyncHandler(controller.dashboard));
router.get('/', requireStaff, asyncHandler(controller.listPatients));
router.get('/:id', asyncHandler(controller.getPatient));

export default router;
