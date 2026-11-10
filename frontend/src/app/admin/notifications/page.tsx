import { NotificationsClient } from '@/components/admin/NotificationsClient';
import { actorHasPermission, requireAdminPageAccess } from '@/lib/auth/admin-page';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function AdminNotificationsPage() {
  const actor = await requireAdminPageAccess();
  const canManage = await actorHasPermission(actor, PERMISSIONS.SETTINGS_MANAGE);
  return <NotificationsClient currentUserId={actor.userId} canManage={canManage} />;
}
