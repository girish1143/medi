'use client';

import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, Plus, Search, ShieldBan, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, ModalDialog } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import {
  EmptyState,
  ErrorBanner,
  Table,
  TableContainer,
  TableHead,
  TablePagination,
  TableSkeleton,
  Td,
  Th,
} from '@/components/ui/table';
import { ACCOUNT_STATUSES, USER_ROLES } from '@/lib/domain/enums';
import { formatDateTime } from '@/lib/utils';
import { apiFetch } from '@/services/api-client';

interface UserRow {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  role: string;
  accountStatus: string;
  emailVerified: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

const createAdminFormSchema = z.object({
  fullName: z.string().min(2, 'Name is required'),
  email: z.string().email('Valid email required'),
  phone: z.string().optional(),
  roleCode: z.enum(['OPERATIONS_ADMIN', 'FINANCE_ADMIN', 'SUPPORT_ADMIN']),
  password: z
    .string()
    .min(12, 'Minimum 12 characters')
    .regex(/[A-Z]/, 'Include uppercase')
    .regex(/[a-z]/, 'Include lowercase')
    .regex(/[0-9]/, 'Include digit')
    .regex(/[^A-Za-z0-9]/, 'Include special character'),
});

type CreateAdminFormValues = z.infer<typeof createAdminFormSchema>;

export function UsersClient({
  currentActorRole,
  currentActorId,
}: {
  currentActorRole: string;
  currentActorId: string;
}) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusModal, setStatusModal] = useState<{
    user: UserRow;
    nextStatus: 'SUSPENDED' | 'ACTIVE';
  } | null>(null);
  const [reason, setReason] = useState('');
  const [mutating, setMutating] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const form = useForm<CreateAdminFormValues>({
    resolver: zodResolver(createAdminFormSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      roleCode: 'OPERATIONS_ADMIN',
      password: '',
    },
  });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: '15' });
      if (q.trim()) qs.set('q', q.trim());
      if (roleFilter) qs.set('role', roleFilter);
      if (statusFilter) qs.set('status', statusFilter);

      const res = await apiFetch(`/api/admin/users?${qs.toString()}`, { cache: 'no-store' });
      const json = (await res.json()) as {
        success: boolean;
        data?: { users: UserRow[]; pagination: { total: number } };
        error?: { message?: string };
      };
      if (!res.ok || !json.success || !json.data) {
        setError(json.error?.message ?? 'Failed to load users.');
        return;
      }
      setUsers(json.data.users);
      setTotal(json.data.pagination.total);
    } catch {
      setError('Unable to fetch users.');
    } finally {
      setLoading(false);
    }
  }, [page, q, roleFilter, statusFilter]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function confirmStatusChange() {
    if (!statusModal || reason.trim().length < 3) return;
    setMutating(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/users/${statusModal.user.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusModal.nextStatus, reason: reason.trim() }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Status update failed.');
        return;
      }
      setStatusModal(null);
      setReason('');
      await loadUsers();
    } finally {
      setMutating(false);
    }
  }

  async function handleCreateAdmin(values: CreateAdminFormValues) {
    setCreateError(null);
    const res = await apiFetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...values,
        ...(values.phone?.trim() ? { phone: values.phone.trim() } : { phone: undefined }),
      }),
    });
    const json = (await res.json()) as { success: boolean; error?: { message?: string } };
    if (!res.ok || !json.success) {
      setCreateError(json.error?.message ?? 'Failed to provision admin.');
      return;
    }
    form.reset();
    setCreateOpen(false);
    await loadUsers();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">User Management</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Search, inspect profiles, review account history, and enforce account status controls.
          </p>
        </div>
        {currentActorRole === 'SUPER_ADMIN' ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Provision Admin Staff
          </Button>
        ) : null}
      </div>

      {/* Search & Filters */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by name, email, or phone..."
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={roleFilter}
          onChange={(e) => {
            setPage(1);
            setRoleFilter(e.target.value);
          }}
        >
          <option value="">All Roles</option>
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => {
            setPage(1);
            setStatusFilter(e.target.value);
          }}
        >
          <option value="">All Statuses</option>
          {ACCOUNT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : users.length === 0 ? (
        <EmptyState
          title="No users found"
          description="No registered users match your current search or filter criteria."
        />
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Email Verified</Th>
                <Th>Created</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </TableHead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <Td>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{u.fullName}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </Td>
                  <Td>
                    <Badge variant="outline">{u.role}</Badge>
                  </Td>
                  <Td>
                    <Badge variant={statusBadgeVariant(u.accountStatus)}>{u.accountStatus}</Badge>
                  </Td>
                  <Td className="text-xs">{u.emailVerified ? 'Verified' : 'Unverified'}</Td>
                  <Td className="text-xs">{formatDateTime(u.createdAt)}</Td>
                  <Td className="text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <Link href={`/admin/users/${u.id}`}>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Button>
                      </Link>
                      {currentActorRole === 'SUPER_ADMIN' && u.id !== currentActorId ? (
                        u.accountStatus === 'SUSPENDED' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setStatusModal({ user: u, nextStatus: 'ACTIVE' })}
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Reactivate
                          </Button>
                        ) : (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setStatusModal({ user: u, nextStatus: 'SUSPENDED' })}
                          >
                            <ShieldBan className="h-3.5 w-3.5" />
                            Suspend
                          </Button>
                        )
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <TablePagination page={page} pageSize={15} total={total} onPageChange={setPage} />
        </TableContainer>
      )}

      {/* Confirm Suspend / Reactivate */}
      <ConfirmDialog
        open={Boolean(statusModal)}
        onClose={() => {
          setStatusModal(null);
          setReason('');
        }}
        onConfirm={confirmStatusChange}
        loading={mutating}
        destructive={statusModal?.nextStatus === 'SUSPENDED'}
        confirmLabel={statusModal?.nextStatus === 'SUSPENDED' ? 'Suspend Account' : 'Reactivate'}
        title={
          statusModal?.nextStatus === 'SUSPENDED'
            ? `Suspend ${statusModal?.user.fullName}?`
            : `Reactivate ${statusModal?.user.fullName}?`
        }
        description={
          statusModal?.nextStatus === 'SUSPENDED'
            ? 'Suspending immediately revokes all active sessions and blocks protected access.'
            : 'Reactivating restores account access according to role permissions.'
        }
      >
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
          Audit Reason (required)
        </label>
        <Input
          className="mt-1.5"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Document administrative reason..."
        />
      </ConfirmDialog>

      {/* Provision Internal Admin */}
      <ModalDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Provision Administrative Staff"
        description="Creates an internal Operations, Finance, or Support Administrator."
      >
        <ErrorBanner message={createError} />
        <form onSubmit={form.handleSubmit(handleCreateAdmin)} className="mt-3 space-y-3">
          <div>
            <label className="block text-xs font-medium">Full Name</label>
            <Input {...form.register('fullName')} className="mt-1" />
            {form.formState.errors.fullName ? (
              <p className="mt-1 text-xs text-rose-600">{form.formState.errors.fullName.message}</p>
            ) : null}
          </div>
          <div>
            <label className="block text-xs font-medium">Email</label>
            <Input type="email" {...form.register('email')} className="mt-1" />
            {form.formState.errors.email ? (
              <p className="mt-1 text-xs text-rose-600">{form.formState.errors.email.message}</p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium">Admin Role</label>
              <Select {...form.register('roleCode')} className="mt-1">
                <option value="OPERATIONS_ADMIN">OPERATIONS_ADMIN</option>
                <option value="FINANCE_ADMIN">FINANCE_ADMIN</option>
                <option value="SUPPORT_ADMIN">SUPPORT_ADMIN</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium">Phone (optional)</label>
              <Input {...form.register('phone')} className="mt-1" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium">Initial Password (12+ chars)</label>
            <Input type="password" {...form.register('password')} className="mt-1" />
            {form.formState.errors.password ? (
              <p className="mt-1 text-xs text-rose-600">{form.formState.errors.password.message}</p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Creating...' : 'Create Admin'}
            </Button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
