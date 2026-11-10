'use client';

import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, UserRound, Users } from 'lucide-react';
import { toast } from 'sonner';
import { apiMeta, apiRequest } from '@/lib/api';
import type { AdminUser, PaginationMeta, UserRole } from '@/types';
import { PageHeader } from '@/components/dashboard/page-header';
import { ROLE_BADGE } from '@/lib/dashboard-nav';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Pagination } from '@/components/shared/pagination';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

const ROLE_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All roles' },
  { value: 'patient', label: 'Patients' },
  { value: 'doctor', label: 'Doctors' },
  { value: 'receptionist', label: 'Receptionists' },
  { value: 'admin', label: 'Administrators' },
];

const ASSIGNABLE_ROLES: Array<{ value: UserRole; label: string }> = [
  { value: 'patient', label: 'Patient' },
  { value: 'receptionist', label: 'Receptionist' },
  { value: 'admin', label: 'Administrator' },
];

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [role, debounced]);

  const query = useQuery({
    queryKey: ['admin', 'users', role, debounced, page],
    queryFn: () =>
      apiMeta<AdminUser[]>('/admin/users', {
        query: { role: role === 'all' ? undefined : role, search: debounced || undefined, page, limit: 15 },
      }),
    placeholderData: keepPreviousData,
  });

  const updateRole = useMutation({
    mutationFn: ({ id, nextRole }: { id: string; nextRole: UserRole }) =>
      apiRequest(`/admin/users/${id}/role`, { method: 'PATCH', body: { role: nextRole } }),
    onSuccess: () => {
      toast.success('Role updated');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update role'),
  });

  const users = query.data?.data ?? [];
  const pagination = query.data?.meta.pagination as PaginationMeta | undefined;
  const filtered = role !== 'all' || Boolean(debounced);

  return (
    <div>
      <PageHeader
        title="Users"
        description="Everyone with a MediBook account. Assign front-desk or administrator access carefully."
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, email or phone"
              className="pl-9"
              aria-label="Search users"
            />
          </div>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="sm:w-48" aria-label="Filter by role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_FILTERS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {query.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState description="We could not load the user directory." onRetry={() => void query.refetch()} />
      ) : users.length ? (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Change role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const badge = ROLE_BADGE[user.role];
                  const isSelfUpdate = updateRole.isPending && updateRole.variables?.id === user.id;
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                            {user.fullName
                              .split(' ')
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((part) => part[0])
                              .join('') || <UserRound className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800">{user.fullName}</p>
                            <p className="truncate text-xs text-slate-400">{user.id.slice(0, 8)}…</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-slate-700">{user.email}</p>
                        <p className="text-xs text-slate-400">{user.phone ?? 'No phone'}</p>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
                            badge.className,
                          )}
                        >
                          {badge.label}
                        </span>
                        {!user.isActive && <p className="mt-1 text-[11px] text-rose-600">Inactive</p>}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">{formatDate(user.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        {user.role === 'doctor' ? (
                          <span className="text-xs text-slate-400">Managed via doctor onboarding</span>
                        ) : (
                          <Select
                            value={user.role}
                            disabled={isSelfUpdate}
                            onValueChange={(nextRole) =>
                              updateRole.mutate({ id: user.id, nextRole: nextRole as UserRole })
                            }
                          >
                            <SelectTrigger className="ml-auto w-40" aria-label={`Change role for ${user.fullName}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ASSIGNABLE_ROLES.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
          <Pagination
            page={pagination?.page ?? page}
            totalPages={pagination?.totalPages ?? 1}
            total={pagination?.total}
            onPageChange={setPage}
          />
        </>
      ) : (
        <EmptyState
          icon={Users}
          title="No users found"
          description={filtered ? 'No user matches the selected role or search.' : 'Registered users will appear here.'}
          action={
            filtered
              ? {
                  label: 'Clear filters',
                  onClick: () => {
                    setSearch('');
                    setRole('all');
                  },
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
