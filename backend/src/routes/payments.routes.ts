import { z } from 'zod';
import { Router } from 'express';
import * as controller from '../controllers/payment.controller';
import { authenticate, requireStaff } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { refundSchema } from '../validators/admin.validators';
import { uuidSchema } from '../validators/common';
import { asyncHandler } from '../utils/http';

const router = Router();

router.post('/webhook', asyncHandler(controller.webhook));

router.use(authenticate);

router.post(
  '/orders',
  validate({ body: z.object({ appointmentId: uuidSchema }) }),
  asyncHandler(controller.createOrder),
);
router.post(
  '/verify',
  validate({
    body: z.object({
      orderId: z.string().trim().min(1),
      paymentId: z.string().trim().min(1),
      signature: z.string().trim().min(1),
    }),
  }),
  asyncHandler(controller.verify),
);
router.post(
  '/dev-confirm',
  validate({ body: z.object({ orderId: z.string().trim().min(1) }) }),
  asyncHandler(controller.devConfirm),
);
router.get(
  '/appointment/:appointmentId',
  validate({ params: z.object({ appointmentId: uuidSchema }) }),
  asyncHandler(controller.getForAppointment),
);
router.post(
  '/:paymentId/refund',
  requireStaff,
  validate({ params: z.object({ paymentId: uuidSchema }), body: refundSchema }),
  asyncHandler(controller.refund),
);

export default router;
