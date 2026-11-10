import { LeadsClient } from '@/components/admin/LeadsClient';
import { requireAdminPageAccess } from '@/lib/auth/admin-page';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function AdminLeadsPage() {
  await requireAdminPageAccess(PERMISSIONS.LEADS_READ);
  return <LeadsClient />;
}
