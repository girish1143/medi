import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { ADMIN_NAV_ITEMS } from '@/lib/auth/admin-nav';
import { requireAdminPageAccess } from '@/lib/auth/admin-page';
import { backendServerFetch } from '@/lib/auth/server-api';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await requireAdminPageAccess();

  const notifRes = await backendServerFetch<{ unreadCount: number }>(
    '/admin/notifications?limit=5',
  );
  const unreadNotificationsCount = notifRes.data?.unreadCount ?? 0;

  const permissionSet = new Set(actor.permissions);
  const visibleNavItems = ADMIN_NAV_ITEMS.filter(
    (item) => !item.requiredPermission || permissionSet.has(item.requiredPermission),
  );

  return (
    <AdminShell
      actor={{
        userId: actor.userId,
        email: actor.email,
        fullName: actor.fullName,
        role: actor.role,
      }}
      navItems={visibleNavItems}
      unreadNotificationsCount={unreadNotificationsCount}
    >
      {children}
    </AdminShell>
  );
}
