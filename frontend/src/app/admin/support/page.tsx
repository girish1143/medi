import { SupportClient } from '@/components/admin/SupportClient';
import { requireAdminPageAccess } from '@/lib/auth/admin-page';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function AdminSupportPage() {
  await requireAdminPageAccess(PERMISSIONS.SUPPORT_MANAGE);
  return <SupportClient />;
}
