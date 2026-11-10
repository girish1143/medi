import { redirect } from 'next/navigation';
import { isAdminUserRole } from '@/lib/domain/enums';
import type { PermissionCode } from './permissions';
import { getServerActor, type ServerVerifiedActor } from './server-api';

export async function requireAdminPageAccess(
  requiredPermission?: PermissionCode,
): Promise<ServerVerifiedActor> {
  const session = await getServerActor();
  if (!session.authenticated) {
    redirect('/login');
  }

  const { actor } = session;
  if (!isAdminUserRole(actor.role)) {
    redirect('/access-denied');
  }

  if (requiredPermission && !actor.permissions.includes(requiredPermission)) {
    redirect('/access-denied');
  }

  return actor;
}

export async function actorHasPermission(
  actor: ServerVerifiedActor,
  permissionCode: PermissionCode,
): Promise<boolean> {
  return actor.permissions.includes(permissionCode);
}
