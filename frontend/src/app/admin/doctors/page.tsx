import { DoctorsClient } from '@/components/admin/DoctorsClient';
import { requireAdminPageAccess } from '@/lib/auth/admin-page';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function AdminDoctorsPage() {
  await requireAdminPageAccess(PERMISSIONS.DOCTORS_READ);
  return <DoctorsClient />;
}
