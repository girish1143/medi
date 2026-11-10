import { AuditLogsClient } from '@/components/admin/AuditLogsClient';
import { requireAdminPageAccess } from '@/lib/auth/admin-page';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function AdminAuditLogsPage() {
  await requireAdminPageAccess(PERMISSIONS.AUDIT_LOGS_READ);
  return <AuditLogsClient />;
}
