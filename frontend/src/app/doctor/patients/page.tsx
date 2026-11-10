'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronRight, Phone, Search, Users } from 'lucide-react';
import { apiMeta } from '@/lib/api';
import type { PaginationMeta, PatientListItem } from '@/types';
import { PageHeader } from '@/components/dashboard/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Pagination } from '@/components/shared/pagination';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/utils';

export default function DoctorPatientsPage() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced]);

  const query = useQuery({
    queryKey: ['doctor', 'patients', debounced, page],
    queryFn: () =>
      apiMeta<PatientListItem[]>('/doctor-portal/patients', {
        query: { search: debounced || undefined, page, limit: 12 },
      }),
    placeholderData: keepPreviousData,
  });

  const items = query.data?.data ?? [];
  const pagination = query.data?.meta.pagination as PaginationMeta | undefined;

  return (
    <div>
      <PageHeader
        title="My patients"
        description="Patients you have consulted. Open a record to review visit history, prescriptions and reports."
      />

      <Card className="mb-4 p-4">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, email or phone"
            className="pl-9"
            aria-label="Search patients"
          />
        </div>
      </Card>

      {query.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState description="We could not load your patients." onRetry={() => void query.refetch()} />
      ) : items.length ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((patient) => (
              <Link
                key={patient.id}
                href={`/doctor/patients/${patient.id}`}
                className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-soft"
              >
                <div className="flex items-start justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-teal-700">
                    {patient.fullName
                      .split(' ')
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')}
                  </span>
                  <ChevronRight className="h-5 w-5 text-slate-300 transition group-hover:text-teal-500" />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-900">{patient.fullName}</p>
                <p className="text-xs text-slate-500">
                  {patient.gender ?? 'Gender not set'}
                  {patient.dateOfBirth ? ` · ${formatDate(patient.dateOfBirth)}` : ''}
                </p>
                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  {patient.phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-slate-400" /> {patient.phone}
                    </p>
                  )}
                  <p className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                    {patient.appointments} appointment{patient.appointments === 1 ? '' : 's'}
                    {patient.lastVisit ? ` · Last ${formatDate(patient.lastVisit)}` : ''}
                  </p>
                </div>
                {patient.nextVisit && (
                  <p className="mt-2 rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] font-medium text-blue-700">
                    Next visit {formatDate(patient.nextVisit)}
                  </p>
                )}
              </Link>
            ))}
          </div>
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
          title="No patients found"
          description={debounced ? 'No patient matches your search.' : 'Patients will appear here after your first consultation.'}
          action={debounced ? { label: 'Clear search', onClick: () => setSearch('') } : undefined}
        />
      )}
    </div>
  );
}
