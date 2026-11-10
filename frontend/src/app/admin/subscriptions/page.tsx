import { SubscriptionsClient } from '@/components/admin/SubscriptionsClient';
import { actorHasPermission, requireAdminPageAccess } from '@/lib/auth/admin-page';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function AdminSubscriptionsPage() {
  const actor = await requireAdminPageAccess(PERMISSIONS.SUBSCRIPTIONS_READ);
  const canManage = await actorHasPermission(actor, PERMISSIONS.SUBSCRIPTIONS_MANAGE);
  return <SubscriptionsClient canManage={canManage} />;
}
