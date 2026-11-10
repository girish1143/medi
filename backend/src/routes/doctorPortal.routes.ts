import { Router } from 'express';
import * as controller from '../controllers/doctorPortal.controller';
import { authenticate, requireDoctor } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  availabilitySchema,
  timeOffSchema,
  updateDoctorSchema,
} from '../validators/doctor.validators';
import { idParamSchema } from '../validators/clinical.validators';
import { asyncHandler } from '../utils/http';
import { z } from 'zod';

const router = Router();

router.use(authenticate, requireDoctor);

router.get('/dashboard', asyncHandler(controller.dashboard));
router.get('/profile', asyncHandler(controller.profile));
router.patch('/profile', validate({ body: updateDoctorSchema }), asyncHandler(controller.updateProfile));
router.get('/schedule', asyncHandler(controller.schedule));
router.put('/availability', validate({ body: availabilitySchema }), asyncHandler(controller.replaceAvailability));
router.post('/time-off', validate({ body: timeOffSchema }), asyncHandler(controller.addTimeOff));
router.delete(
  '/time-off/:timeOffId',
  validate({ params: z.object({ timeOffId: z.string().uuid('Invalid identifier') }) }),
  asyncHandler(controller.removeTimeOff),
);
router.get('/patients', asyncHandler(controller.listPatients));
router.get('/patients/:id', validate({ params: idParamSchema }), asyncHandler(controller.getPatient));

export default router;
