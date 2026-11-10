import { Router } from 'express';
import * as controller from '../controllers/admin.controller';
import { authenticate, requireAdmin } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  adminIdParamSchema,
  adminListSchema,
  auditQuerySchema,
  clinicCreateSchema,
  clinicUpdateSchema,
  complaintUpdateSchema,
  paymentsQuerySchema,
  reviewModerationSchema,
  roleUpdateSchema,
  settingsSchema,
  specialtyCreateSchema,
  specialtyUpdateSchema,
} from '../validators/admin.validators';
import {
  createDoctorSchema,
  updateDoctorSchema,
  verificationSchema,
  doctorIdParamSchema,
} from '../validators/doctor.validators';
import { asyncHandler } from '../utils/http';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/dashboard', asyncHandler(controller.dashboard));
router.get('/analytics', asyncHandler(controller.analytics));

router.get('/users', validate({ query: adminListSchema }), asyncHandler(controller.listUsers));
router.patch(
  '/users/:id/role',
  validate({ params: adminIdParamSchema, body: roleUpdateSchema }),
  asyncHandler(controller.updateUserRole),
);

router.get('/doctors', validate({ query: adminListSchema }), asyncHandler(controller.listDoctors));
router.post('/doctors', validate({ body: createDoctorSchema }), asyncHandler(controller.createDoctor));
router.patch(
  '/doctors/:id',
  validate({ params: doctorIdParamSchema, body: updateDoctorSchema }),
  asyncHandler(controller.updateDoctor),
);
router.patch(
  '/doctors/:id/verification',
  validate({ params: doctorIdParamSchema, body: verificationSchema }),
  asyncHandler(controller.setDoctorVerification),
);

router.get('/payments', validate({ query: paymentsQuerySchema }), asyncHandler(controller.listPayments));
router.get('/refunds', asyncHandler(controller.listRefunds));

router.get('/settings', asyncHandler(controller.getSettings));
router.patch('/settings', validate({ body: settingsSchema }), asyncHandler(controller.updateSettings));

router.get('/audit-logs', validate({ query: auditQuerySchema }), asyncHandler(controller.listAuditLogs));

router.get('/complaints', asyncHandler(controller.listComplaints));
router.patch(
  '/complaints/:id',
  validate({ params: adminIdParamSchema, body: complaintUpdateSchema }),
  asyncHandler(controller.updateComplaint),
);

router.get('/reviews', asyncHandler(controller.listReviews));
router.patch(
  '/reviews/:id',
  validate({ params: adminIdParamSchema, body: reviewModerationSchema }),
  asyncHandler(controller.setReviewVisibility),
);

router.get('/specialties', asyncHandler(controller.listSpecialtiesAdmin));
router.post('/specialties', validate({ body: specialtyCreateSchema }), asyncHandler(controller.createSpecialty));
router.patch(
  '/specialties/:id',
  validate({ params: adminIdParamSchema, body: specialtyUpdateSchema }),
  asyncHandler(controller.updateSpecialty),
);

router.get('/clinics', asyncHandler(controller.listClinics));
router.post('/clinics', validate({ body: clinicCreateSchema }), asyncHandler(controller.createClinic));
router.patch(
  '/clinics/:id',
  validate({ params: adminIdParamSchema, body: clinicUpdateSchema }),
  asyncHandler(controller.updateClinic),
);

export default router;
