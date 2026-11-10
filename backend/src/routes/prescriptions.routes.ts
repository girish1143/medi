import { Router } from 'express';
import * as controller from '../controllers/prescription.controller';
import { authenticate, requireDoctor } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  createPrescriptionSchema,
  idParamSchema,
  prescriptionListSchema,
} from '../validators/clinical.validators';
import { asyncHandler } from '../utils/http';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: prescriptionListSchema }), asyncHandler(controller.list));
router.post('/', requireDoctor, validate({ body: createPrescriptionSchema }), asyncHandler(controller.create));
router.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.get));
router.get('/:id/pdf', validate({ params: idParamSchema }), asyncHandler(controller.pdf));

export default router;
