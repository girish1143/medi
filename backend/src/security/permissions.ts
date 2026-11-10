import type { Prisma, PrismaClient } from '@prisma/client';
import type { AdminRoleCode } from '../shared/constants';

export const PERMISSIONS = {
  USERS_READ: 'users.read',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_SUSPEND: 'users.suspend',
  USERS_DELETE: 'users.delete',
  PATIENTS_READ: 'patients.read',
  PATIENTS_UPDATE: 'patients.update',
  DOCTORS_READ: 'doctors.read',
  DOCTORS_VERIFY: 'doctors.verify',
  DOCTORS_UPDATE: 'doctors.update',
  DOCTORS_MANAGE: 'doctors.manage',
  HOSPITALS_READ: 'hospitals.read',
  HOSPITALS_VERIFY: 'hospitals.verify',
  HOSPITALS_UPDATE: 'hospitals.update',
  HOSPITALS_MANAGE: 'hospitals.manage',
  LEADS_READ: 'leads.read',
  LEADS_QUALIFY: 'leads.qualify',
  LEADS_ASSIGN: 'leads.assign',
  LEADS_UPDATE: 'leads.update',
  LEADS_REJECT: 'leads.reject',
  SUBSCRIPTIONS_READ: 'subscriptions.read',
  SUBSCRIPTIONS_MANAGE: 'subscriptions.manage',
  PAYMENTS_READ: 'payments.read',
  PAYMENTS_REFUND: 'payments.refund',
  ANALYTICS_READ: 'analytics.read',
  SUPPORT_MANAGE: 'support.manage',
  ROLES_MANAGE: 'roles.manage',
  AUDIT_LOGS_READ: 'audit_logs.read',
  SETTINGS_MANAGE: 'settings.manage',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_CATALOG: ReadonlyArray<{
  code: PermissionCode;
  resource: string;
  action: string;
  description: string;
}> = [
  { code: PERMISSIONS.USERS_READ, resource: 'users', action: 'read', description: 'List and view user accounts' },
  { code: PERMISSIONS.USERS_CREATE, resource: 'users', action: 'create', description: 'Provision administrative or managed accounts' },
  { code: PERMISSIONS.USERS_UPDATE, resource: 'users', action: 'update', description: 'Update user profile metadata' },
  { code: PERMISSIONS.USERS_SUSPEND, resource: 'users', action: 'suspend', description: 'Suspend or reactivate accounts and revoke sessions' },
  { code: PERMISSIONS.USERS_DELETE, resource: 'users', action: 'delete', description: 'Soft-delete user accounts' },
  { code: PERMISSIONS.PATIENTS_READ, resource: 'patients', action: 'read', description: 'View patient directory with consent governance' },
  { code: PERMISSIONS.PATIENTS_UPDATE, resource: 'patients', action: 'update', description: 'Update patient administrative records' },
  { code: PERMISSIONS.DOCTORS_READ, resource: 'doctors', action: 'read', description: 'View doctor directory and credentials' },
  { code: PERMISSIONS.DOCTORS_VERIFY, resource: 'doctors', action: 'verify', description: 'Approve or reject doctor verification' },
  { code: PERMISSIONS.DOCTORS_UPDATE, resource: 'doctors', action: 'update', description: 'Update doctor records and specializations' },
  { code: PERMISSIONS.DOCTORS_MANAGE, resource: 'doctors', action: 'manage', description: 'Full doctor lifecycle administration' },
  { code: PERMISSIONS.HOSPITALS_READ, resource: 'hospitals', action: 'read', description: 'View hospital directory and accreditations' },
  { code: PERMISSIONS.HOSPITALS_VERIFY, resource: 'hospitals', action: 'verify', description: 'Approve or reject hospital verification' },
  { code: PERMISSIONS.HOSPITALS_UPDATE, resource: 'hospitals', action: 'update', description: 'Update hospital records and departments' },
  { code: PERMISSIONS.HOSPITALS_MANAGE, resource: 'hospitals', action: 'manage', description: 'Full hospital lifecycle administration' },
  { code: PERMISSIONS.LEADS_READ, resource: 'leads', action: 'read', description: 'Inspect healthcare enquiry leads' },
  { code: PERMISSIONS.LEADS_QUALIFY, resource: 'leads', action: 'qualify', description: 'Qualify incoming patient leads' },
  { code: PERMISSIONS.LEADS_ASSIGN, resource: 'leads', action: 'assign', description: 'Assign or reassign leads to verified providers' },
  { code: PERMISSIONS.LEADS_UPDATE, resource: 'leads', action: 'update', description: 'Update authorized lead lifecycle statuses' },
  { code: PERMISSIONS.LEADS_REJECT, resource: 'leads', action: 'reject', description: 'Reject or close ineligible leads' },
  { code: PERMISSIONS.SUBSCRIPTIONS_READ, resource: 'subscriptions', action: 'read', description: 'View provider plans and quota consumption' },
  { code: PERMISSIONS.SUBSCRIPTIONS_MANAGE, resource: 'subscriptions', action: 'manage', description: 'Create, update, and toggle subscription plans' },
  { code: PERMISSIONS.PAYMENTS_READ, resource: 'payments', action: 'read', description: 'View tokenized payment ledger and invoices' },
  { code: PERMISSIONS.PAYMENTS_REFUND, resource: 'payments', action: 'refund', description: 'Record audited refunds against eligible payments' },
  { code: PERMISSIONS.ANALYTICS_READ, resource: 'analytics', action: 'read', description: 'View metrics, charts, and export CSV reports' },
  { code: PERMISSIONS.SUPPORT_MANAGE, resource: 'support', action: 'manage', description: 'Triage, assign, and respond to support tickets' },
  { code: PERMISSIONS.ROLES_MANAGE, resource: 'roles', action: 'manage', description: 'Manage RBAC role-permission grants' },
  { code: PERMISSIONS.AUDIT_LOGS_READ, resource: 'audit_logs', action: 'read', description: 'Inspect immutable security and compliance audit logs' },
  { code: PERMISSIONS.SETTINGS_MANAGE, resource: 'settings', action: 'manage', description: 'Update platform settings and dispatch queues' },
];

export const ADMIN_ROLE_DEFINITIONS: Record<
  AdminRoleCode,
  { name: string; description: string; permissions: readonly PermissionCode[] }
> = {
  SUPER_ADMIN: {
    name: 'Super Administrator',
    description: 'Full platform governance across identity, clinical operations, billing, RBAC, audit logs, and settings.',
    permissions: PERMISSION_CATALOG.map((p) => p.code),
  },
  OPERATIONS_ADMIN: {
    name: 'Operations Administrator',
    description: 'Provider credential verification, department/specialization management, and lead routing.',
    permissions: [
      PERMISSIONS.USERS_READ,
      PERMISSIONS.PATIENTS_READ,
      PERMISSIONS.DOCTORS_READ,
      PERMISSIONS.DOCTORS_VERIFY,
      PERMISSIONS.DOCTORS_UPDATE,
      PERMISSIONS.DOCTORS_MANAGE,
      PERMISSIONS.HOSPITALS_READ,
      PERMISSIONS.HOSPITALS_VERIFY,
      PERMISSIONS.HOSPITALS_UPDATE,
      PERMISSIONS.HOSPITALS_MANAGE,
      PERMISSIONS.LEADS_READ,
      PERMISSIONS.LEADS_QUALIFY,
      PERMISSIONS.LEADS_ASSIGN,
      PERMISSIONS.LEADS_UPDATE,
      PERMISSIONS.LEADS_REJECT,
      PERMISSIONS.SUBSCRIPTIONS_READ,
      PERMISSIONS.ANALYTICS_READ,
    ],
  },
  FINANCE_ADMIN: {
    name: 'Finance Administrator',
    description: 'Subscription plans, invoices, payments, and refund reconciliation (zero PHI access).',
    permissions: [
      PERMISSIONS.DOCTORS_READ,
      PERMISSIONS.HOSPITALS_READ,
      PERMISSIONS.SUBSCRIPTIONS_READ,
      PERMISSIONS.SUBSCRIPTIONS_MANAGE,
      PERMISSIONS.PAYMENTS_READ,
      PERMISSIONS.PAYMENTS_REFUND,
      PERMISSIONS.ANALYTICS_READ,
    ],
  },
  SUPPORT_ADMIN: {
    name: 'Support Administrator',
    description: 'Customer support ticket triage and user assistance without bulk PHI or billing controls.',
    permissions: [
      PERMISSIONS.USERS_READ,
      PERMISSIONS.DOCTORS_READ,
      PERMISSIONS.HOSPITALS_READ,
      PERMISSIONS.SUPPORT_MANAGE,
    ],
  },
};

type DbClient = Prisma.TransactionClient | PrismaClient;

export async function ensureRbacCatalog(db: DbClient): Promise<void> {
  const permissionIdsByCode = new Map<string, string>();

  for (const perm of PERMISSION_CATALOG) {
    const upserted = await db.adminPermission.upsert({
      where: { code: perm.code },
      create: {
        code: perm.code,
        resource: perm.resource,
        action: perm.action,
        description: perm.description,
      },
      update: {
        resource: perm.resource,
        action: perm.action,
        description: perm.description,
      },
      select: { id: true, code: true },
    });
    permissionIdsByCode.set(upserted.code, upserted.id);
  }

  for (const [roleCode, def] of Object.entries(ADMIN_ROLE_DEFINITIONS) as Array<
    [AdminRoleCode, (typeof ADMIN_ROLE_DEFINITIONS)[AdminRoleCode]]
  >) {
    const adminRole = await db.adminRole.upsert({
      where: { code: roleCode },
      create: {
        code: roleCode,
        name: def.name,
        description: def.description,
        isSystemRole: true,
        isActive: true,
      },
      update: {
        name: def.name,
        description: def.description,
      },
      select: { id: true },
    });

    for (const permCode of def.permissions) {
      const permissionId = permissionIdsByCode.get(permCode);
      if (!permissionId) continue;

      await db.adminRolePermission.upsert({
        where: {
          adminRoleId_permissionId: {
            adminRoleId: adminRole.id,
            permissionId,
          },
        },
        create: {
          adminRoleId: adminRole.id,
          permissionId,
        },
        update: {},
      });
    }
  }
}
