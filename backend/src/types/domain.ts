export const APP_ROLES = [
  'super_admin',
  'operations_admin',
  'finance_admin',
  'support_admin',
  'patient',
  'doctor',
  'hospital',
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ADMIN_SCOPES = [
  'super_admin',
  'operations_admin',
  'finance_admin',
  'support_admin',
] as const;

export type AdminScope = (typeof ADMIN_SCOPES)[number];

export const ACCOUNT_STATUSES = [
  'pending_verification',
  'active',
  'suspended',
  'deactivated',
] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const LEAD_STATUSES = [
  'draft',
  'consent_pending',
  'submitted',
  'qualified',
  'matching',
  'assigned',
  'provider_accepted',
  'in_progress',
  'converted',
  'closed_unconverted',
  'cancelled',
  'rejected',
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const ASSIGNMENT_STATUSES = [
  'pending_acceptance',
  'accepted',
  'declined',
  'expired',
  'revoked',
  'completed',
] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const CONSENT_TYPES = [
  'platform_triage',
  'provider_disclosure',
  'telehealth_communication',
] as const;

export type ConsentType = (typeof CONSENT_TYPES)[number];

export const CONSENT_STATUSES = ['granted', 'withdrawn', 'expired'] as const;

export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export const ADMIN_ROLE_SET: ReadonlySet<AppRole> = new Set<AppRole>(ADMIN_SCOPES);

export function isAdminRole(role: AppRole): role is AdminScope {
  return ADMIN_ROLE_SET.has(role);
}
