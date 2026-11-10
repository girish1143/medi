import { Router } from 'express';
import * as controller from '../controllers/doctor.controller';
import { validate } from '../middlewares/validate';
import { doctorSearchSchema, doctorIdParamSchema, slotsQuerySchema } from '../validators/doctor.validators';
import { asyncHandler } from '../utils/http';

const router = Router();

router.get('/', validate({ query: doctorSearchSchema }), asyncHandler(controller.listDoctors));
router.get('/specialties', asyncHandler(controller.listSpecialties));
router.get('/specialties/:slug', asyncHandler(controller.getSpecialty));
router.get('/:id', validate({ params: doctorIdParamSchema }), asyncHandler(controller.getDoctor));
router.get(
  '/:id/slots',
  validate({ params: doctorIdParamSchema, query: slotsQuerySchema }),
  asyncHandler(controller.getDoctorSlots),
);
router.get('/:id/reviews', validate({ params: doctorIdParamSchema }), asyncHandler(controller.getDoctorReviews));
router.get(
  '/:id/working-hours',
  validate({ params: doctorIdParamSchema }),
  asyncHandler(controller.getDoctorWorkingHours),
);

export default router;
