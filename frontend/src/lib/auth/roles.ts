import type { UserRole } from '../domain/enums';

/**
 * UX routing prefixes per role.
 * Security Note: Frontend route prefixes are for navigation only;
 * authorization is strictly enforced server-side via RBAC and Prisma queries.
 */
export const ROLE_HOME_ROUTES: Record<UserRole, string> = {
  SUPER_ADMIN: '/admin/super',
  OPERATIONS_ADMIN: '/admin/operations',
  FINANCE_ADMIN: '/admin/finance',
  SUPPORT_ADMIN: '/admin/support',
  PATIENT: '/patient',
  DOCTOR: '/doctor',
  HOSPITAL: '/hospital',
};
