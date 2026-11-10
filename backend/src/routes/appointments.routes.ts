import { Router } from 'express';
import * as controller from '../controllers/appointment.controller';
import { authenticate, requirePatient, requireStaff } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  appointmentIdParamSchema,
  appointmentListSchema,
  bookingSchema,
  cancelSchema,
  rescheduleSchema,
  reviewSchema,
  statusSchema,
} from '../validators/appointment.validators';
import { asyncHandler } from '../utils/http';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: appointmentListSchema }), asyncHandler(controller.listAppointments));
router.post('/', validate({ body: bookingSchema }), asyncHandler(controller.createAppointment));
router.get('/:id', validate({ params: appointmentIdParamSchema }), asyncHandler(controller.getAppointment));
router.get(
  '/:id/history',
  validate({ params: appointmentIdParamSchema }),
  asyncHandler(controller.getAppointmentHistory),
);
router.patch(
  '/:id/reschedule',
  validate({ params: appointmentIdParamSchema, body: rescheduleSchema }),
  asyncHandler(controller.reschedule),
);
router.post(
  '/:id/cancel',
  validate({ params: appointmentIdParamSchema, body: cancelSchema }),
  asyncHandler(controller.cancel),
);
router.patch(
  '/:id/status',
  validate({ params: appointmentIdParamSchema, body: statusSchema }),
  asyncHandler(controller.updateStatus),
);
router.post(
  '/:id/review',
  requirePatient,
  validate({ params: appointmentIdParamSchema, body: reviewSchema }),
  asyncHandler(controller.submitReview),
);
router.get('/:id/invoice', validate({ params: appointmentIdParamSchema }), asyncHandler(controller.invoice));
router.post(
  '/:id/collect-payment',
  requireStaff,
  validate({ params: appointmentIdParamSchema }),
  asyncHandler(controller.collectPayment),
);

export default router;
