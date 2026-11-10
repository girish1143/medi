'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck2, CalendarDays, Clock3, CreditCard, Search, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';
import { apiMeta, apiRequest } from '@/lib/api';
import type { AppointmentDetail, AppointmentSummary, PaginationMeta } from '@/types';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCurrency, formatDate, formatDateTime, formatTime } from '@/lib/utils';

const VIEWS = [
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
  { value: 'all', label: 'All' },
] as const;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'checked_in', label: 'Checked in' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No show' },
];

function ReceptionAppointmentsContent() {
  const searchParams = useSearchParams();
  const initialView = (searchParams.get('view') as 'today' | 'upcoming' | 'past' | 'all' | null) ?? 'today';
  const queryClient = useQueryClient();
  const [view, setView] = useState<'today' | 'upcoming' | 'past' | 'all'>(initialView);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [view, status, debounced, date]);

  const query = useQuery({
    queryKey: ['reception', 'appointments', view, status, debounced, date, page],
    queryFn: () =>
      apiMeta<AppointmentSummary[]>('/appointments', {
        query: {
          view,
          status: status === 'all' ? undefined : status,
          search: debounced || undefined,
          date: date || undefined,
          page,
          limit: 12,
          sort: view === 'today' || view === 'upcoming' ? 'upcoming' : 'recent',
        },
      }),
    placeholderData: keepPreviousData,
  });

  const detail = useQuery({
    queryKey: ['reception', 'appointment', detailId],
    queryFn: () => apiRequest<AppointmentDetail>(`/appointments/${detailId}`),
    enabled: Boolean(detailId),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) =>
      apiRequest(`/appointments/${id}/status`, { method: 'PATCH', body: { status: next } }),
    onSuccess: () => {
      toast.success('Appointment updated');
      void queryClient.invalidateQueries({ queryKey: ['reception', 'appointments'] });
      void queryClient.invalidateQueries({ queryKey: ['reception', 'appointment'] });
      void queryClient.invalidateQueries({ queryKey: ['reception', 'dashboard'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update appointment'),
  });

  const collectPayment = useMutation({
    mutationFn: (id: string) => apiRequest(`/appointments/${id}/collect-payment`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Payment collected');
      void queryClient.invalidateQueries({ queryKey: ['reception', 'appointments'] });
      void queryClient.invalidateQueries({ queryKey: ['reception', 'appointment'] });
      void queryClient.invalidateQueries({ queryKey: ['reception', 'dashboard'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to collect payment'),
  });

  const items = query.data?.data ?? [];
  const pagination = query.data?.meta.pagination as PaginationMeta | undefined;
  const filtered = view !== 'today' || status !== 'all' || Boolean(debounced) || Boolean(date);

  return (
    <div>
      <PageHeader
        title="Appointments"
        description="Check patients in, start consultations and collect pay-at-clinic fees."
      />

      <Card className="mb-4 p-4">
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
      </Card>

      {query.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState description="We could not load appointments." onRetry={() => void query.refetch()} />
      ) : items.length ? (
        <>
          <div className="space-y-3">
            {items.map((appointment) => {
              const canCheckIn = appointment.status === 'confirmed';
              const canStart = appointment.status === 'checked_in';
              const canCollect =
                appointment.paymentStatus !== 'paid' &&
                ['pending', 'confirmed', 'checked_in', 'in_progress'].includes(appointment.status);
              return (
                <Card key={appointment.id} className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <button type="button" onClick={() => setDetailId(appointment.id)} className="flex min-w-0 items-start gap-4 text-left">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                        <CalendarDays className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{appointment.patient.name}</p>
                          <StatusBadge status={appointment.status} />
                          <StatusBadge status={appointment.paymentStatus} kind="payment" />
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Dr. {appointment.doctor.name} · {appointment.doctor.specialty ?? 'General'}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5 text-slate-400" /> {formatDate(appointment.startsAt)}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Clock3 className="h-3.5 w-3.5 text-slate-400" /> {formatTime(appointment.startsAt)} – {formatTime(appointment.endsAt)}
                          </span>
                          <span>{appointment.patient.phone ?? appointment.patient.email}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {appointment.appointmentNumber} · {formatCurrency(appointment.consultationFee)}
                          {appointment.clinic ? ` · ${appointment.clinic.name}` : ''}
                        </p>
                      </div>
                    </button>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {canCheckIn && (
                        <Button
                          size="sm"
                          loading={updateStatus.isPending && updateStatus.variables?.id === appointment.id}
                          onClick={() => updateStatus.mutate({ id: appointment.id, next: 'checked_in' })}
                        >
                          <CalendarCheck2 /> Check in
                        </Button>
                      )}
                      {canStart && (
                        <Button
                          size="sm"
                          variant="teal"
                          loading={updateStatus.isPending && updateStatus.variables?.id === appointment.id}
                          onClick={() => updateStatus.mutate({ id: appointment.id, next: 'in_progress' })}
                        >
                          <Stethoscope /> Start
                        </Button>
                      )}
                      {canCollect && (
                        <Button
                          size="sm"
                          variant="outline"
                          loading={collectPayment.isPending && collectPayment.variables === appointment.id}
                          onClick={() => collectPayment.mutate(appointment.id)}
                        >
                          <CreditCard /> Collect
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setDetailId(appointment.id)}>
                        Details
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
          <Pagination page={pagination?.page ?? page} totalPages={pagination?.totalPages ?? 1} total={pagination?.total} onPageChange={setPage} />
        </>
      ) : (
        <EmptyState
          icon={CalendarDays}
          title="No appointments found"
          description={filtered ? 'No appointment matches the selected filters.' : 'Appointments will appear here as patients book.'}
          action={
            filtered
              ? {
                  label: 'Clear filters',
                  onClick: () => {
                    setView('today');
                    setStatus('all');
                    setSearch('');
                    setDate('');
                  },
                }
              : { label: 'Book appointment', href: '/reception/book' }
          }
        />
      )}

      <Dialog open={Boolean(detailId)} onOpenChange={(open) => { if (!open) setDetailId(null); }}>
        <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Appointment details</DialogTitle>
            <DialogDescription>Booking and status history for this visit.</DialogDescription>
          </DialogHeader>
          {detail.isLoading ? (
            <div className="space-y-3"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-32 rounded-xl" /></div>
          ) : detail.isError || !detail.data ? (
            <ErrorState description="We could not load this appointment." onRetry={() => void detail.refetch()} />
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 p-4 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-sm font-semibold text-slate-800">{detail.data.appointmentNumber}</p>
                  <StatusBadge status={detail.data.status} />
                </div>
                <div className="mt-3 space-y-1.5">
                  <p><span className="text-slate-500">Patient:</span> <span className="font-medium text-slate-800">{detail.data.patient.name}</span></p>
                  <p><span className="text-slate-500">Phone:</span> <span className="text-slate-700">{detail.data.patient.phone ?? '—'}</span></p>
                  <p><span className="text-slate-500">Doctor:</span> <span className="font-medium text-slate-800">Dr. {detail.data.doctor.name}</span></p>
                  <p><span className="text-slate-500">When:</span> <span className="text-slate-700">{formatDate(detail.data.startsAt)} · {formatTime(detail.data.startsAt)} – {formatTime(detail.data.endsAt)}</span></p>
                  <p><span className="text-slate-500">Fee:</span> <span className="text-slate-700">{formatCurrency(detail.data.consultationFee)}</span> <StatusBadge status={detail.data.paymentStatus} kind="payment" className="ml-1" /></p>
                  {detail.data.reason && <p><span className="text-slate-500">Reason:</span> <span className="text-slate-700">{detail.data.reason}</span></p>}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status history</p>
                {detail.data.history.length ? (
                  <ol className="mt-3 space-y-2.5">
                    {detail.data.history.map((entry) => (
                      <li key={entry.id} className="flex gap-3 text-sm">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                        <div>
                          <p className="text-slate-800">
                            {entry.fromStatus ? `${entry.fromStatus.replace(/_/g, ' ')} → ` : ''}
                            <span className="font-medium">{entry.toStatus.replace(/_/g, ' ')}</span>
                          </p>
                          <p className="text-xs text-slate-400">{formatDateTime(entry.createdAt)}{entry.changedByName ? ` · ${entry.changedByName}` : ''}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No status changes yet.</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ReceptionAppointmentsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
      <ReceptionAppointmentsContent />
    </Suspense>
  );
}
