'use client';

import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarDays, Search, UserRound } from 'lucide-react';
import Link from 'next/link';
import { apiMeta } from '@/lib/api';
import type { AdminUser, PaginationMeta } from '@/types';
import { PageHeader } from '@/components/dashboard/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Pagination } from '@/components/shared/pagination';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/utils';

export default function AdminPatientsPage() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminUser | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced]);

  const query = useQuery({
    queryKey: ['admin', 'patients', debounced, page],
    queryFn: () =>
      apiMeta<AdminUser[]>('/admin/users', {
        query: { role: 'patient', search: debounced || undefined, page, limit: 15 },
      }),
    placeholderData: keepPreviousData,
  });

  const patients = query.data?.data ?? [];
  const pagination = query.data?.meta.pagination as PaginationMeta | undefined;
  const active = patients.filter((patient) => patient.isActive).length;

  return (
    <div>
      <PageHeader
        title="Patients"
        description="Everyone who books care on MediBook. Clinical records stay visible only to the treating doctor and the patient themselves."
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/appointments">
              <CalendarDays /> Appointments
            </Link>
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Registered patients</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{pagination?.total ?? patients.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Active on this page</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{active}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Inactive on this page</p>
          <p className="mt-1 text-2xl font-bold text-slate-500">{patients.length - active}</p>
        </Card>
      </div>

      <Card className="mb-4 p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search patients by name, email or phone"
            className="pl-9"
            aria-label="Search patients"
          />
        </div>
      </Card>

      {query.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState description="We could not load patients." onRetry={() => void query.refetch()} />
      ) : patients.length ? (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Profile</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients.map((patient) => (
                  <TableRow key={patient.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-600">
                          {patient.fullName.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">{patient.fullName}</p>
                          <p className="truncate text-xs text-slate-500">{patient.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{patient.phone ?? '—'}</TableCell>
                    <TableCell className="text-xs text-slate-500">{formatDate(patient.createdAt)}</TableCell>
                    <TableCell>
                      <span
                        className={
                          patient.isActive
                            ? 'rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200'
                            : 'rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200'
                        }
                      >
                        {patient.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setSelected(patient)}>
                        <UserRound /> View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
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
          icon={UserRound}
          title={debounced ? 'No matching patients' : 'No patients yet'}
          description={
            debounced
              ? 'Try a different name, email or phone number.'
              : 'Patients appear here as soon as they register or are added by reception.'
          }
          action={debounced ? { label: 'Clear search', onClick: () => setSearch('') } : undefined}
        />
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.fullName}</DialogTitle>
            <DialogDescription>Patient account overview. Medical records are not exposed to administrators.</DialogDescription>
          </DialogHeader>
          {selected && (
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Email</dt>
                <dd className="font-medium text-slate-800">{selected.email}</dd>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Phone</dt>
                <dd className="font-medium text-slate-800">{selected.phone ?? '—'}</dd>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Member since</dt>
                <dd className="font-medium text-slate-800">{formatDate(selected.createdAt)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Account status</dt>
                <dd className={selected.isActive ? 'font-medium text-emerald-600' : 'font-medium text-slate-500'}>
                  {selected.isActive ? 'Active' : 'Disabled'}
                </dd>
              </div>
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
