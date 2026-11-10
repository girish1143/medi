import { HospitalsClient } from '@/components/admin/HospitalsClient';
import { requireAdminPageAccess } from '@/lib/auth/admin-page';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function AdminHospitalsPage() {
  await requireAdminPageAccess(PERMISSIONS.HOSPITALS_READ);
  return <HospitalsClient />;
}
