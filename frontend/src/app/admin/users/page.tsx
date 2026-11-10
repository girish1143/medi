import { UsersClient } from '@/components/admin/UsersClient';
import { requireAdminPageAccess } from '@/lib/auth/admin-page';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const actor = await requireAdminPageAccess(PERMISSIONS.USERS_READ);
  return <UsersClient currentActorRole={actor.role} currentActorId={actor.userId} />;
}
