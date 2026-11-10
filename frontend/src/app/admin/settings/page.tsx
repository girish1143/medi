import { SettingsClient } from '@/components/admin/SettingsClient';
import { requireAdminPageAccess } from '@/lib/auth/admin-page';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  await requireAdminPageAccess(PERMISSIONS.SETTINGS_MANAGE);
  return <SettingsClient />;
}
