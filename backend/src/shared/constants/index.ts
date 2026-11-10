export const USER_ROLES = [
  'SUPER_ADMIN',
  'OPERATIONS_ADMIN',
  'FINANCE_ADMIN',
  'SUPPORT_ADMIN',
  'PATIENT',
  'DOCTOR',
  'HOSPITAL',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ADMIN_ROLE_CODES = [
  'SUPER_ADMIN',
  'OPERATIONS_ADMIN',
  'FINANCE_ADMIN',
  'SUPPORT_ADMIN',
] as const;
export type AdminRoleCode = (typeof ADMIN_ROLE_CODES)[number];

export const ACCOUNT_STATUSES = [
  'PENDING_VERIFICATION',
  'ACTIVE',
  'SUSPENDED',
  'REJECTED',
  'DEACTIVATED',
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const VERIFICATION_STATUSES = [
  'PENDING',
  'UNDER_REVIEW',
  'VERIFIED',
  'REJECTED',
  'SUSPENDED',
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const LEAD_STATUSES = [
  'NEW',
  'UNDER_REVIEW',
  'QUALIFIED',
  'ASSIGNED',
  'CONTACTED',
  'CONVERTED',
  'REJECTED',
  'CLOSED',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];

export const LEAD_SOURCES = [
  'WEB_PORTAL',
  'MOBILE_APP',
  'REFERRAL',
  'PARTNER_API',
  'SUPPORT_ASSISTED',
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const CONSULTATION_MODES = ['IN_PERSON', 'TELECONSULTATION', 'BOTH'] as const;
export type ConsultationMode = (typeof CONSULTATION_MODES)[number];

export const PROVIDER_TYPES = ['DOCTOR', 'HOSPITAL'] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const ASSIGNMENT_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'REVOKED',
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const CONSENT_PURPOSES = [
  'PLATFORM_TRIAGE',
  'PROVIDER_CONTACT_DISCLOSURE',
  'TELEHEALTH_COMMUNICATION',
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const CONSENT_PROVIDER_SCOPES = [
  'MATCHED_PROVIDERS',
  'SPECIFIC_DOCTOR',
  'SPECIFIC_HOSPITAL',
] as const;
export type ConsentProviderScope = (typeof CONSENT_PROVIDER_SCOPES)[number];

export const CONSENT_STATUSES = ['GRANTED', 'REVOKED', 'EXPIRED'] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export const APPOINTMENT_STATUSES = [
  'REQUESTED',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const CONTACT_REQUEST_STATUSES = [
  'PENDING',
  'APPROVED',
  'SHARED',
  'COMPLETED',
  'REJECTED',
] as const;
export type ContactRequestStatus = (typeof CONTACT_REQUEST_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELLED',
  'EXPIRED',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'PENDING',
  'REQUIRES_ACTION',
  'SUCCEEDED',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const INVOICE_STATUSES = ['DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const AUDIT_OUTCOMES = ['SUCCESS', 'DENIED', 'FAILURE'] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export function isAdminRole(role: string): role is AdminRoleCode {
  return (ADMIN_ROLE_CODES as readonly string[]).includes(role);
}
