export type UserRole = 'patient' | 'doctor' | 'admin' | 'receptionist';

export interface AuthUser {
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

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestId?: string;
    }
  }
}

export {};
