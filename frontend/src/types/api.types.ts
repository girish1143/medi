import type { UserRole } from '@/lib/domain/enums';

export interface AdminDashboardData {
  metrics: {
    totalPatients: number;
    totalDoctors: number;
    verifiedDoctors: number;
    totalHospitals: number;
    verifiedHospitals: number;
    totalLeads: number;
    newLeads: number;
    assignedLeads: number;
    convertedLeads: number;
    activeSubscriptions: number;
    actualPaymentRevenueMinor: number;
  };
  charts: {
    leadsOverTime: Array<{ date: string; total: number; converted: number }>;
    leadConversionByStatus: Array<{ status: string; count: number }>;
    revenueOverTime: Array<{ date: string; revenueMinor: number }>;
    doctorPerformance: Array<{ name: string; totalAssigned: number; accepted: number; rejected: number }>;
    hospitalPerformance: Array<{ name: string; totalAssigned: number; accepted: number; rejected: number }>;
    locationEnquiries: Array<{ location: string; count: number }>;
    subscriptionPerformance: Array<{ planName: string; activeCount: number; leadsConsumed: number }>;
  };
}

export interface EligibleProviderMatch {
  providerType: 'DOCTOR' | 'HOSPITAL';
  providerId: string;
  displayName: string;
  city: string;
  stateProvince: string;
  countryCode: string;
  specializationMatched: boolean;
  locationScore: number;
  matchScore: number;
  hasActiveSubscription: boolean;
  remainingQuota: number;
  alreadyAssigned: boolean;
}

export interface AuthenticatedActorProfile {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  role: UserRole;
  accountStatus: string;
}

export interface ApiResponseEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
