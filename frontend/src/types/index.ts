export type UserRole = 'patient' | 'doctor' | 'admin' | 'receptionist';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  patientId?: string | null;
  doctorId?: string | null;
  doctorVerificationStatus?: string | null;
  isActive: boolean;
}

export interface Specialty {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  doctorCount: number;
}

export interface AdminSpecialty {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  doctor_count: number;
  created_at: string;
}

export interface AdminAnalytics {
  stats: AdminDashboard['stats'];
  daily: AdminDashboard['daily'];
  monthlyRevenue: AdminDashboard['monthlyRevenue'];
  statusDistribution: AdminDashboard['statusDistribution'];
  specialtyDistribution: AdminDashboard['specialtyDistribution'];
  topDoctors: AdminDashboard['topDoctors'];
}

export interface DoctorSummary {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  qualification: string;
  experienceYears: number;
  consultationFee: number;
  onlineConsultationFee: number | null;
  rating: number;
  totalReviews: number;
  languages: string[];
  specialties: string[];
  primarySpecialty: string | null;
  clinic: { id: string; name: string; area: string | null; city: string } | null;
  nextAvailableAt: string | null;
}

export interface DoctorDetail extends DoctorSummary {
  registrationNumber: string;
  biography: string | null;
  verifiedAt: string | null;
  clinics: Array<{
    id: string;
    name: string;
    address: string;
    city: string;
    phone: string | null;
    consultationFee: number;
    isPrimary: boolean;
  }>;
  workingHours: Array<{
    weekday: number;
    weekdayName: string;
    startTime: string;
    endTime: string;
    slotMinutes: number;
    breakStart: string | null;
    breakEnd: string | null;
  }>;
  reviews: {
    total: number;
    items: Array<{
      id: string;
      rating: number;
      comment: string | null;
      patientName: string;
      appointmentNumber: string;
      createdAt: string;
    }>;
    distribution: Array<{ rating: number; count: number }>;
  };
  stats: { completedConsultations: number; totalAppointments: number };
}

export interface Slot {
  startsAt: string;
  endsAt: string;
  time: string;
  label: string;
}

export interface AppointmentSummary {
  id: string;
  appointmentNumber: string;
  startsAt: string;
  endsAt: string;
  appointmentDate: string;
  appointmentType: string;
  status: string;
  consultationFee: number;
  paymentStatus: string;
  reason: string | null;
  doctorNotes: string | null;
  cancellationReason: string | null;
  createdAt: string;
  checkedInAt: string | null;
  completedAt: string | null;
  patient: {
    id: string;
    profileId: string;
    name: string;
    phone: string | null;
    email: string;
    dateOfBirth: string | null;
    gender: string | null;
  };
  doctor: {
    id: string;
    profileId: string;
    name: string;
    avatarUrl: string | null;
    qualification: string;
    specialty: string | null;
  };
  clinic: { id: string; name: string; address: string; city: string } | null;
  payment: {
    id: string;
    status: string;
    provider: string;
    providerPaymentId: string | null;
    paidAt: string | null;
    amount: number;
  } | null;
  prescription: { id: string; number: string } | null;
  review: { id: string; rating: number } | null;
}

export interface AppointmentDetail extends AppointmentSummary {
  history: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    note: string | null;
    changedByName: string | null;
    createdAt: string;
  }>;
  paymentDetail: PaymentDetail | null;
}

export interface PaymentDetail {
  id: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  paidAt: string | null;
  refunds: Array<{ id: string; amount: number; reason: string; status: string; createdAt: string }>;
}

export interface PaymentOrder {
  paymentId: string;
  appointmentId: string;
  appointmentNumber: string;
  orderId: string;
  amount: number;
  amountPaise: number;
  currency: string;
  keyId: string;
  mode: 'dev' | 'razorpay';
  prefill: { name: string; email: string; contact: string };
  description: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: string;
  channel: string;
  createdAt: string;
  readAt: string | null;
  appointmentId: string | null;
}

export interface PatientProfile {
  id: string;
  profileId: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  bloodGroup: string | null;
  emergencyContact: string | null;
  address: string | null;
  memberSince: string;
  addresses: Array<{
    id: string;
    label: string;
    line1: string;
    line2: string | null;
    area: string | null;
    city: string;
    state: string;
    pincode: string;
    isDefault: boolean;
  }>;
}

export interface PatientListItem {
  id: string;
  profileId: string;
  fullName: string;
  email: string;
  phone: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  memberSince: string;
  appointments: number;
  lastVisit: string | null;
  nextVisit?: string | null;
}

export interface PatientClinicalView {
  patient: {
    id: string;
    profileId: string;
    fullName: string;
    email: string;
    phone: string | null;
    avatarUrl: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    bloodGroup: string | null;
    emergencyContact: string | null;
    address: string | null;
  };
  history: Array<{
    id: string;
    appointmentNumber: string;
    startsAt: string;
    status: string;
    reason: string | null;
    doctorName: string;
    specialty: string | null;
  }>;
  records: Array<{
    id: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    recordType: string;
    createdAt: string;
  }>;
  prescriptions: Array<{
    id: string;
    prescriptionNumber: string;
    diagnosis: string;
    createdAt: string;
    doctorName: string;
  }>;
}

export interface MedicalRecord {
  id: string;
  patientId: string;
  appointmentId: string | null;
  appointmentNumber: string | null;
  fileName: string;
  fileType: string;
  fileSize: number;
  recordType: string;
  uploadedBy: string | null;
  createdAt: string;
}

export interface Prescription {
  id: string;
  prescriptionNumber: string;
  appointmentId: string;
  appointmentNumber: string;
  patientId: string;
  diagnosis: string;
  notes: string | null;
  followUpDate: string | null;
  createdAt: string;
  doctor: {
    id: string;
    name: string;
    qualification: string;
    registrationNumber: string;
    specialty: string | null;
  };
  patient: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    age: number | null;
    gender: string | null;
  };
  items: Array<{
    id: string;
    medicineName: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions: string | null;
  }>;
}

export interface PatientDashboard {
  stats: { total: number; upcoming: number; completed: number; cancelled: number; pendingPayment: number };
  upcoming: Array<{
    id: string;
    appointmentNumber: string;
    startsAt: string;
    status: string;
    appointmentType: string;
    doctorName: string;
    doctorAvatar: string | null;
    qualification: string;
    specialty: string | null;
    clinicName: string | null;
    clinicCity: string | null;
    consultationFee: number;
    paymentStatus: string;
  }>;
  activity: Array<{ id: string; title: string; body: string; type: string; createdAt: string; read: boolean }>;
  counts: { prescriptions: number; records: number; reviews: number };
}

export interface DoctorDashboard {
  stats: {
    today: number;
    upcoming: number;
    completed: number;
    totalPatients: number;
    monthlyEarnings: number;
    pendingPayments: number;
    completionRate: number;
    rating: number;
    totalReviews: number;
  };
  todaySchedule: Array<{
    id: string;
    appointmentNumber: string;
    startsAt: string;
    endsAt: string;
    status: string;
    appointmentType: string;
    patient: {
      id: string;
      name: string;
      phone: string | null;
      avatarUrl: string | null;
      age: number | null;
      gender: string | null;
    };
    reason: string | null;
    paymentStatus: string;
    consultationFee: number;
  }>;
  trend: Array<{ date: string; completed: number; cancelled: number; total: number }>;
  earnings: Array<{ month: string; revenue: number }>;
  recentPatients: Array<{ id: string; fullName: string; avatarUrl: string | null; lastVisit: string; visits: number }>;
}

export interface AdminDashboard {
  stats: {
    totalPatients: number;
    totalDoctors: number;
    verifiedDoctors: number;
    pendingDoctors: number;
    totalAppointments: number;
    todayAppointments: number;
    cancelledAppointments: number;
    pendingAppointments: number;
    completedAppointments: number;
    totalRevenue: number;
    monthlyRevenue: number;
    appointmentGrowth: number;
  };
  daily: Array<{ date: string; total: number; completed: number; cancelled: number }>;
  monthlyRevenue: Array<{ month: string; revenue: number; refunds: number }>;
  statusDistribution: Array<{ status: string; count: number }>;
  specialtyDistribution: Array<{ specialty: string; count: number }>;
  topDoctors: Array<{ id: string; name: string; specialty: string | null; completed: number; revenue: number; rating: number }>;
  pendingVerification: Array<{
    id: string;
    full_name: string;
    email: string;
    registration_number: string;
    qualification: string;
    created_at: string;
    specialty: string | null;
  }>;
  recentAppointments: Array<{
    id: string;
    appointmentNumber: string;
    startsAt: string;
    status: string;
    patientName: string;
    doctorName: string;
    consultationFee: number;
  }>;
}

export interface ReceptionDashboard {
  stats: { today: number; checkedIn: number; waiting: number; inProgress: number; completed: number; cancelled: number };
  today: Array<{
    id: string;
    appointmentNumber: string;
    startsAt: string;
    status: string;
    patientName: string;
    patientPhone: string | null;
    doctorName: string;
    clinicName: string | null;
    paymentStatus: string;
    consultationFee: number;
  }>;
}

export interface AdminDoctor {
  id: string;
  profileId: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  registrationNumber: string;
  qualification: string;
  experienceYears: number;
  consultationFee: number;
  verificationStatus: string;
  isActive: boolean;
  rating: number;
  totalReviews: number;
  specialty: string | null;
  appointments: number;
  revenue: number;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface AdminPayment {
  id: string;
  appointmentId: string;
  appointmentNumber: string;
  patientName: string;
  doctorName: string;
  amount: number;
  currency: string;
  provider: string;
  providerPaymentId: string | null;
  status: string;
  appointmentStatus: string;
  paidAt: string | null;
  createdAt: string;
}

export interface AdminRefund {
  id: string;
  amount: number;
  reason: string;
  status: string;
  providerRefundId: string | null;
  appointmentNumber: string;
  patientName: string;
  createdAt: string;
  processedAt: string | null;
}

export interface AdminComplaint {
  id: string;
  subject: string;
  description: string;
  status: string;
  resolution: string | null;
  patientName: string;
  patientEmail: string;
  appointmentNumber: string | null;
  createdAt: string;
}

export interface AdminReview {
  id: string;
  rating: number;
  comment: string | null;
  isVisible: boolean;
  patientName: string;
  doctorName: string;
  appointmentNumber: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  actorRole: string | null;
  actorName: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

export interface PlatformSettings {
  booking_min_notice_minutes: number;
  booking_max_advance_days: number;
  cancellation_min_hours: number;
  reschedule_min_hours: number;
  pay_at_clinic_enabled: boolean;
  auto_confirm_appointments: boolean;
  clinic_name: string;
  support_email: string;
  support_phone: string;
  maintenance_mode: boolean;
  refund_processing_days: number;
}

export interface Clinic {
  id: string;
  name: string;
  address_line1: string;
  area: string | null;
  city: string;
  state: string;
  pincode: string;
  phone: string | null;
  is_active: boolean;
}

export interface DoctorSchedule {
  availability: Array<{
    id: string;
    weekday: number;
    weekdayName: string;
    startTime: string;
    endTime: string;
    slotMinutes: number;
    breakStart: string | null;
    breakEnd: string | null;
    isActive: boolean;
  }>;
  timeOff: Array<{ id: string; startsAt: string; endsAt: string; reason: string | null }>;
}

export interface Complaint {
  id: string;
  subject: string;
  description: string;
  status: string;
  resolution: string | null;
  createdAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
