import { PaymentsClient } from '@/components/admin/PaymentsClient';
import { actorHasPermission, requireAdminPageAccess } from '@/lib/auth/admin-page';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function AdminPaymentsPage() {
  const actor = await requireAdminPageAccess(PERMISSIONS.PAYMENTS_READ);
  const canRefund = await actorHasPermission(actor, PERMISSIONS.PAYMENTS_REFUND);
  return <PaymentsClient canRefund={canRefund} />;
}
