import type { UserRole } from '../domain/enums';

/**
 * UX routing prefixes per role.
 * Security Note: Frontend route prefixes are for navigation only;
 * authorization is strictly enforced server-side via RBAC and Prisma queries.
 */
export const ROLE_HOME_ROUTES: Record<UserRole, string> = {
  SUPER_ADMIN: '/admin',
  OPERATIONS_ADMIN: '/admin',
  FINANCE_ADMIN: '/admin',
  SUPPORT_ADMIN: '/admin',
  PATIENT: '/patient',
  DOCTOR: '/doctor',
  HOSPITAL: '/hospital',
};
