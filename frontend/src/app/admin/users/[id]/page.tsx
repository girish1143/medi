import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAdminPageAccess } from '@/lib/auth/admin-page';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { backendServerFetch } from '@/lib/auth/server-api';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface UserDetailResponse {
  user: {
    id: string;
    email: string;
    phone: string | null;
    fullName: string;
    role: string;
    accountStatus: string;
    emailVerified: string | null;
    lastLoginAt: string | null;
    createdAt: string;
  };
  auditLogs: Array<{
    id: string;
    action: string;
    resourceType: string;
    outcome: string;
    createdAt: string;
  }>;
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPageAccess(PERMISSIONS.USERS_READ);
  const { id } = await params;

  const res = await backendServerFetch<UserDetailResponse>(`/admin/users/${id}`);
  if (!res.ok || !res.data?.user) {
    notFound();
  }

  const { user, auditLogs } = res.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{user.fullName}</h1>
          <p className="text-xs text-slate-500">{user.email}</p>
        </div>
        <Link href="/admin/users">
          <Button variant="outline" size="sm">
            Back to Users
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account Overview</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-slate-500">Role</p>
            <Badge className="mt-1" variant="outline">{user.role}</Badge>
          </div>
          <div>
            <p className="text-xs text-slate-500">Account Status</p>
            <Badge className="mt-1" variant={statusBadgeVariant(user.accountStatus)}>
              {user.accountStatus}
            </Badge>
          </div>
          <div>
            <p className="text-xs text-slate-500">Last Login</p>
            <p className="mt-1 font-medium">{formatDateTime(user.lastLoginAt)}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account Security &amp; Audit History</CardTitle>
        </CardHeader>
        <CardContent>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-slate-500">No audit history recorded for this account yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {auditLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between py-2.5 text-xs">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{log.action}</p>
                    <p className="text-slate-500">{log.resourceType}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant={statusBadgeVariant(log.outcome)}>{log.outcome}</Badge>
                    <p className="mt-1 text-slate-400">{formatDateTime(log.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
