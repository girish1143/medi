import { PERMISSIONS, type PermissionCode } from './permissions';

export interface AdminNavItem {
  href: string;
  label: string;
  iconKey:
    | 'dashboard'
    | 'users'
    | 'doctors'
    | 'hospitals'
    | 'leads'
    | 'subscriptions'
    | 'payments'
    | 'analytics'
    | 'notifications'
    | 'support'
    | 'audit'
    | 'settings';
  requiredPermission?: PermissionCode;
}

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { href: '/admin', label: 'Dashboard', iconKey: 'dashboard', requiredPermission: PERMISSIONS.ANALYTICS_READ },
  { href: '/admin/users', label: 'Users', iconKey: 'users', requiredPermission: PERMISSIONS.USERS_READ },
  { href: '/admin/doctors', label: 'Doctors', iconKey: 'doctors', requiredPermission: PERMISSIONS.DOCTORS_READ },
  { href: '/admin/hospitals', label: 'Hospitals', iconKey: 'hospitals', requiredPermission: PERMISSIONS.HOSPITALS_READ },
  { href: '/admin/leads', label: 'Leads & CRM', iconKey: 'leads', requiredPermission: PERMISSIONS.LEADS_READ },
  {
    href: '/admin/subscriptions',
    label: 'Subscriptions',
    iconKey: 'subscriptions',
    requiredPermission: PERMISSIONS.SUBSCRIPTIONS_READ,
  },
  { href: '/admin/payments', label: 'Payments', iconKey: 'payments', requiredPermission: PERMISSIONS.PAYMENTS_READ },
  { href: '/admin/analytics', label: 'Analytics', iconKey: 'analytics', requiredPermission: PERMISSIONS.ANALYTICS_READ },
  { href: '/admin/notifications', label: 'Notifications', iconKey: 'notifications' },
  { href: '/admin/support', label: 'Support', iconKey: 'support', requiredPermission: PERMISSIONS.SUPPORT_MANAGE },
  { href: '/admin/audit-logs', label: 'Audit Logs', iconKey: 'audit', requiredPermission: PERMISSIONS.AUDIT_LOGS_READ },
  { href: '/admin/settings', label: 'Settings', iconKey: 'settings', requiredPermission: PERMISSIONS.SETTINGS_MANAGE },
];
