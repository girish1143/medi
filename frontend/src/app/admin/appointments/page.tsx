'use client';

import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronRight, Clock3, Search, Video } from 'lucide-react';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
  { value: 'rejected', label: 'Rejected' },
  { value: 'no_show', label: 'No show' },
];

const NEXT_ACTIONS: Record<string, Array<{ value: string; label: string; destructive?: boolean }>> = {
  pending: [
    { value: 'confirmed', label: 'Confirm' },
    { value: 'cancelled', label: 'Cancel', destructive: true },
    { value: 'rejected', label: 'Reject', destructive: true },
  ],
  confirmed: [
    { value: 'checked_in', label: 'Check in' },
    { value: 'in_progress', label: 'Start' },
    { value: 'completed', label: 'Complete' },
    { value: 'no_show', label: 'No show', destructive: true },
    { value: 'cancelled', label: 'Cancel', destructive: true },
  ],
  checked_in: [
    { value: 'in_progress', label: 'Start' },
    { value: 'completed', label: 'Complete' },
    { value: 'no_show', label: 'No show', destructive: true },
    { value: 'cancelled', label: 'Cancel', destructive: true },
  ],
  in_progress: [
    { value: 'completed', label: 'Complete' },
    { value: 'cancelled', label: 'Cancel', destructive: true },
  ],
};

export default function AdminAppointmentsPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'today' | 'upcoming' | 'past' | 'all'>('today');
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
    queryKey: ['admin', 'appointments', view, status, debounced, date, page],
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
    queryKey: ['admin', 'appointment', detailId],
    queryFn: () => apiRequest<AppointmentDetail>(`/appointments/${detailId}`),
    enabled: Boolean(detailId),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) =>
      apiRequest(`/appointments/${id}/status`, { method: 'PATCH', body: { status: next } }),
    onSuccess: () => {
      toast.success('Appointment updated');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'appointments'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'appointment'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update appointment'),
  });

  const appointments = query.data?.data ?? [];
  const pagination = query.data?.meta.pagination as PaginationMeta | undefined;
  const filtered = view !== 'today' || status !== 'all' || Boolean(debounced) || Boolean(date);
  const actions = detail.data ? NEXT_ACTIONS[detail.data.status] ?? [] : [];

  return (
    <div>
      <PageHeader
        title="Appointments"
        description="Every consultation booked on MediBook. Open a booking to review history or change its status."
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
                  placeholder="Patient, doctor or reference"
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
            <Skeleton key={index} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState description="We could not load appointments." onRetry={() => void query.refetch()} />
      ) : appointments.length ? (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.map((appointment) => (
                  <TableRow key={appointment.id}>
                    <TableCell>
                      <p className="font-mono text-xs font-semibold text-slate-700">{appointment.appointmentNumber}</p>
                      <p className="text-[11px] text-slate-400">{formatDate(appointment.createdAt)}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium text-slate-800">{appointment.patient.name}</p>
                      <p className="text-xs text-slate-400">{appointment.patient.phone ?? appointment.patient.email}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-slate-700">Dr. {appointment.doctor.name}</p>
                      <p className="text-xs text-slate-400">{appointment.doctor.specialty ?? 'General'}</p>
                    </TableCell>
                    <TableCell>
                      <p className="flex items-center gap-1.5 text-sm text-slate-700">
                        <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                        {formatDate(appointment.startsAt)}
                      </p>
                      <p className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Clock3 className="h-3.5 w-3.5" />
                        {formatTime(appointment.startsAt)} – {formatTime(appointment.endsAt)}
                        {appointment.appointmentType === 'online' && <Video className="h-3 w-3 text-teal-500" />}
                      </p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={appointment.status} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={appointment.paymentStatus} kind="payment" />
                      <p className="mt-1 text-[11px] text-slate-400">{formatCurrency(appointment.consultationFee)}</p>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setDetailId(appointment.id)}>
                        Open <ChevronRight />
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
              : undefined
          }
        />
      )}

      <Dialog open={Boolean(detailId)} onOpenChange={(open) => { if (!open) setDetailId(null); }}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Appointment details</DialogTitle>
            <DialogDescription>Review the booking, payment and status history.</DialogDescription>
          </DialogHeader>

          {detail.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-40 rounded-xl" />
            </div>
          ) : detail.isError || !detail.data ? (
            <ErrorState description="We could not load this appointment." onRetry={() => void detail.refetch()} />
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-sm font-semibold text-slate-800">{detail.data.appointmentNumber}</p>
                  <div className="flex gap-1.5">
                    <StatusBadge status={detail.data.status} />
                    <StatusBadge status={detail.data.paymentStatus} kind="payment" />
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <p><span className="text-slate-500">Patient:</span> <span className="font-medium text-slate-800">{detail.data.patient.name}</span></p>
                  <p><span className="text-slate-500">Doctor:</span> <span className="font-medium text-slate-800">Dr. {detail.data.doctor.name}</span></p>
                  <p><span className="text-slate-500">Date:</span> <span className="font-medium text-slate-800">{formatDate(detail.data.startsAt)}</span></p>
                  <p><span className="text-slate-500">Time:</span> <span className="font-medium text-slate-800">{formatTime(detail.data.startsAt)} – {formatTime(detail.data.endsAt)}</span></p>
                  <p><span className="text-slate-500">Fee:</span> <span className="font-medium text-slate-800">{formatCurrency(detail.data.consultationFee)}</span></p>
                  <p><span className="text-slate-500">Type:</span> <span className="font-medium capitalize text-slate-800">{detail.data.appointmentType.replace('_', ' ')}</span></p>
                  {detail.data.clinic && (
                    <p className="sm:col-span-2"><span className="text-slate-500">Clinic:</span> <span className="font-medium text-slate-800">{detail.data.clinic.name}, {detail.data.clinic.city}</span></p>
                  )}
                  {detail.data.reason && (
                    <p className="sm:col-span-2"><span className="text-slate-500">Reason:</span> <span className="text-slate-700">{detail.data.reason}</span></p>
                  )}
                  {detail.data.cancellationReason && (
                    <p className="sm:col-span-2"><span className="text-slate-500">Cancellation:</span> <span className="text-slate-700">{detail.data.cancellationReason}</span></p>
                  )}
                </div>
              </div>

              {actions.length > 0 && (
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Update status</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {actions.map((action) => (
                      <Button
                        key={action.value}
                        size="sm"
                        variant={action.destructive ? 'outline' : action.value === 'completed' ? 'teal' : 'default'}
                        className={action.destructive ? 'border-rose-200 text-rose-700 hover:bg-rose-50' : undefined}
                        loading={updateStatus.isPending && updateStatus.variables?.next === action.value}
                        onClick={() => updateStatus.mutate({ id: detail.data.id, next: action.value })}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">
                    Cancelling or rejecting a paid online appointment triggers an automatic refund.
                  </p>
                </div>
              )}

              {detail.data.paymentDetail && (
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Payment</p>
                  <div className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
                    <p><span className="text-slate-500">Provider:</span> <span className="capitalize text-slate-800">{detail.data.paymentDetail.provider.replace(/_/g, ' ')}</span></p>
                    <p><span className="text-slate-500">Amount:</span> <span className="text-slate-800">{formatCurrency(detail.data.paymentDetail.amount)}</span></p>
                    <p><span className="text-slate-500">Paid at:</span> <span className="text-slate-800">{detail.data.paymentDetail.paidAt ? formatDateTime(detail.data.paymentDetail.paidAt) : 'Not paid'}</span></p>
                    <p><span className="text-slate-500">Refunds:</span> <span className="text-slate-800">{detail.data.paymentDetail.refunds.length}</span></p>
                  </div>
                </div>
              )}

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
                          <p className="text-xs text-slate-400">
                            {formatDateTime(entry.createdAt)}
                            {entry.changedByName ? ` · ${entry.changedByName}` : ''}
                          </p>
                          {entry.note && <p className="mt-0.5 text-xs text-slate-500">{entry.note}</p>}
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
