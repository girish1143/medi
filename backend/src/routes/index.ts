import { Router } from 'express';
import authRoutes from './auth.routes';
import doctorRoutes from './doctors.routes';
import appointmentRoutes from './appointments.routes';
import patientRoutes from './patients.routes';
import medicalRecordRoutes from './medicalRecords.routes';
import prescriptionRoutes from './prescriptions.routes';
import doctorPortalRoutes from './doctorPortal.routes';
import adminRoutes from './admin.routes';
import paymentRoutes from './payments.routes';
import notificationRoutes from './notifications.routes';
import supportRoutes from './support.routes';
import receptionRoutes from './reception.routes';
import fileRoutes from './files.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/doctors', doctorRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/patients', patientRoutes);
router.use('/medical-records', medicalRecordRoutes);
router.use('/prescriptions', prescriptionRoutes);
router.use('/doctor-portal', doctorPortalRoutes);
router.use('/admin', adminRoutes);
router.use('/payments', paymentRoutes);
router.use('/notifications', notificationRoutes);
router.use('/support', supportRoutes);
router.use('/reception', receptionRoutes);
router.use('/files', fileRoutes);

export default router;
