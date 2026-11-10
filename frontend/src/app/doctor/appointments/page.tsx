'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronRight, Clock3, Phone, Search, UserRound, Video } from 'lucide-react';
import { toast } from 'sonner';
import { apiMeta, apiRequest } from '@/lib/api';
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
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
  { value: 'all', label: 'All' },
] as const;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending payment' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'checked_in', label: 'Checked in' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No show' },
];

function DoctorAppointmentsContent() {
  const searchParams = useSearchParams();
  const initialView = (searchParams.get('view') as 'today' | 'upcoming' | 'past' | 'all' | null) ?? 'today';
  const [view, setView] = useState<'today' | 'upcoming' | 'past' | 'all'>(initialView);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  useEffect(() => {
    setPage(1);
  }, [view, status, search, date]);

  const query = useQuery({
    queryKey: ['doctor', 'appointments', view, status, search, date, page],
    queryFn: () =>
      apiMeta<AppointmentSummary[]>('/appointments', {
        query: {
          view,
          status: status === 'all' ? undefined : status,
          search: search || undefined,
          date: date || undefined,
          page,
          limit: 10,
          sort: view === 'upcoming' || view === 'today' ? 'upcoming' : 'recent',
        },
      }),
    placeholderData: keepPreviousData,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) =>
      apiRequest(`/appointments/${id}/status`, { method: 'PATCH', body: { status: next } }),
    onSuccess: () => {
      toast.success('Appointment updated');
      void queryClient.invalidateQueries({ queryKey: ['doctor', 'appointments'] });
      void queryClient.invalidateQueries({ queryKey: ['doctor', 'dashboard'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update appointment'),
  });

  const items = query.data?.data ?? [];
  const pagination = query.data?.meta.pagination as PaginationMeta | undefined;

  return (
    <div>
      <PageHeader
        title="Appointments"
        description="Review your schedule, check patients in and keep consultation status up to date."
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
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
                  placeholder="Patient, phone or reference"
                  className="pl-9 sm:w-60"
                  aria-label="Search appointments"
                />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="sm:w-44" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="sm:w-40"
                aria-label="Filter by date"
              />
            </div>
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
            {items.map((appointment) => {
              const nextStatus =
                appointment.status === 'confirmed'
                  ? { value: 'checked_in', label: 'Check in' }
                  : appointment.status === 'checked_in'
                    ? { value: 'in_progress', label: 'Start consultation' }
                    : appointment.status === 'in_progress'
                      ? { value: 'completed', label: 'Complete' }
                      : null;

              return (
                <Card key={appointment.id} className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <Link href={`/doctor/appointments/${appointment.id}`} className="flex min-w-0 items-start gap-4">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                        {appointment.appointmentType === 'online' ? <Video className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{appointment.patient.name}</p>
                          <StatusBadge status={appointment.status} />
                          <StatusBadge status={appointment.paymentStatus} kind="payment" />
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                            {formatDate(appointment.startsAt)}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Clock3 className="h-3.5 w-3.5 text-slate-400" />
                            {formatTime(appointment.startsAt)} – {formatTime(appointment.endsAt)}
                          </span>
                          {appointment.patient.phone && (
                            <span className="inline-flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5 text-slate-400" />
                              {appointment.patient.phone}
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 text-xs text-slate-400">
                          {appointment.reason || 'No reason provided'} · {appointment.appointmentNumber}
                        </p>
                      </div>
                    </Link>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {nextStatus && (
                        <Button
                          size="sm"
                          variant={nextStatus.value === 'completed' ? 'teal' : 'outline'}
                          loading={updateStatus.isPending && updateStatus.variables?.id === appointment.id}
                          onClick={() => updateStatus.mutate({ id: appointment.id, next: nextStatus.value })}
                        >
                          {nextStatus.label}
                        </Button>
                      )}
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/doctor/appointments/${appointment.id}`}>
                          Open <ChevronRight />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
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
          title="No appointments found"
          description="Try a different view, date or search term."
          action={{ label: 'Clear filters', onClick: () => { setSearch(''); setStatus('all'); setDate(''); } }}
        />
      )}
    </div>
  );
}

export default function DoctorAppointmentsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
      <DoctorAppointmentsContent />
    </Suspense>
  );
}
