'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronRight, Clock3, MapPin, Search, Video } from 'lucide-react';
import { apiMeta } from '@/lib/api';
import type { AppointmentSummary, PaginationMeta } from '@/types';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Pagination } from '@/components/shared/pagination';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate, formatTime } from '@/lib/utils';

const VIEWS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
  { value: 'all', label: 'All' },
] as const;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending payment' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'checked_in', label: 'Checked in' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No show' },
];

export default function PatientAppointmentsPage() {
  const [view, setView] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [view, status, search]);

  const query = useQuery({
    queryKey: ['patient', 'appointments', view, status, search, page],
    queryFn: () =>
      apiMeta<AppointmentSummary[]>('/appointments', {
        query: {
          view,
          status: status === 'all' ? undefined : status,
          search: search || undefined,
          page,
          limit: 10,
          sort: view === 'upcoming' ? 'upcoming' : 'recent',
        },
      }),
    placeholderData: keepPreviousData,
  });

  const items = query.data?.data ?? [];
  const pagination = query.data?.meta.pagination as PaginationMeta | undefined;

  return (
    <div>
      <PageHeader
        title="My appointments"
        description="Every consultation you have booked, with payment status and visit history."
        actions={
          <Button asChild>
            <Link href="/doctors">
              <CalendarDays /> Book new
            </Link>
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={view} onValueChange={(value) => setView(value as typeof view)}>
            <TabsList>
              {VIEWS.map((item) => (
                <TabsTrigger key={item.value} value={item.value}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search doctor or reference"
                className="pl-9 sm:w-64"
                aria-label="Search appointments"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="sm:w-44" aria-label="Filter by status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {query.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState description="We could not load your appointments." onRetry={() => void query.refetch()} />
      ) : items.length ? (
        <>
          <div className="space-y-3">
            {items.map((appointment) => (
              <Link
                key={appointment.id}
                href={`/patient/appointments/${appointment.id}`}
                className="block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition hover:border-blue-200 hover:shadow-soft sm:p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      {appointment.appointmentType === 'online' ? <Video className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">Dr. {appointment.doctor.name}</p>
                        <StatusBadge status={appointment.status} />
                        <StatusBadge status={appointment.paymentStatus} kind="payment" />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {appointment.doctor.specialty ?? 'Consultation'} · {appointment.doctor.qualification}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                          {formatDate(appointment.startsAt)}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Clock3 className="h-3.5 w-3.5 text-slate-400" />
                          {formatTime(appointment.startsAt)} – {formatTime(appointment.endsAt)}
                        </span>
                        {appointment.clinic ? (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-slate-400" />
                            {appointment.clinic.name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <Video className="h-3.5 w-3.5 text-slate-400" /> Online consultation
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-slate-400">
                        Reference {appointment.appointmentNumber}
                        {appointment.reason ? ` · ${appointment.reason}` : ''}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="hidden h-5 w-5 shrink-0 text-slate-300 sm:block" />
                </div>
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
          icon={CalendarDays}
          title={view === 'upcoming' ? 'No upcoming appointments' : 'No appointments found'}
          description={
            view === 'upcoming'
              ? 'Book a consultation with a verified doctor to get started.'
              : 'Try changing the filters or search term.'
          }
          action={{ label: view === 'upcoming' ? 'Find a doctor' : 'Clear search', href: view === 'upcoming' ? '/doctors' : undefined, onClick: view === 'upcoming' ? undefined : () => { setSearch(''); setStatus('all'); } }}
        />
      )}
    </div>
  );
}
