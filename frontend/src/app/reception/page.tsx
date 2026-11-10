'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Hourglass,
  Stethoscope,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api';
import type { ReceptionDashboard } from '@/types';
import { useCurrentUser } from '@/hooks/use-auth';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatTime } from '@/lib/utils';

export default function ReceptionDashboardPage() {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const dashboard = useQuery({
    queryKey: ['reception', 'dashboard'],
    queryFn: () => apiRequest<ReceptionDashboard>('/reception/dashboard'),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) =>
      apiRequest(`/appointments/${id}/status`, { method: 'PATCH', body: { status: next } }),
    onSuccess: () => {
      toast.success('Appointment updated');
      void queryClient.invalidateQueries({ queryKey: ['reception', 'dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['reception', 'appointments'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update appointment'),
  });

  const collectPayment = useMutation({
    mutationFn: (id: string) => apiRequest(`/appointments/${id}/collect-payment`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Payment collected');
      void queryClient.invalidateQueries({ queryKey: ['reception', 'dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['reception', 'appointments'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to collect payment'),
  });

  const data = dashboard.data;

  return (
    <div>
      <PageHeader
        title={user ? `Front desk · ${user.fullName.split(' ')[0]}` : 'Front desk'}
        description="Today’s patient flow, check-ins and pending payments at a glance."
        actions={
          <Button asChild>
            <Link href="/reception/book">
              <CalendarDays /> Book appointment
            </Link>
          </Button>
        }
      />

      {dashboard.isLoading ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Skeleton key={index} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      ) : dashboard.isError ? (
        <ErrorState description="We could not load today’s front-desk overview." onRetry={() => void dashboard.refetch()} />
      ) : data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard title="Today’s appointments" value={data.stats.today} hint="All statuses" icon={CalendarDays} tone="blue" />
            <StatCard title="Waiting" value={data.stats.waiting} hint="Confirmed, not yet checked in" icon={Hourglass} tone="amber" />
            <StatCard title="Checked in" value={data.stats.checkedIn} hint="Waiting in the lounge" icon={CalendarCheck2} tone="teal" />
            <StatCard title="In consultation" value={data.stats.inProgress} hint="With the doctor" icon={Stethoscope} tone="violet" />
            <StatCard title="Completed" value={data.stats.completed} hint="Today" icon={CheckCircle2} tone="emerald" />
            <StatCard title="Cancelled / no-show" value={data.stats.cancelled} hint="Today" icon={XCircle} tone="rose" />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Today’s schedule</CardTitle>
                <Button asChild variant="ghost" size="sm" className="text-blue-600">
                  <Link href="/reception/appointments?view=today">All appointments</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {data.today.length ? (
                  <div className="space-y-2">
                    {data.today.map((appointment) => {
                      const canCheckIn = appointment.status === 'confirmed';
                      const canCollect =
                        appointment.paymentStatus !== 'paid' &&
                        ['pending', 'confirmed', 'checked_in'].includes(appointment.status);
                      const startConsultation = appointment.status === 'checked_in';
                      return (
                        <div key={appointment.id} className="flex flex-col gap-3 rounded-xl border border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900">{appointment.patientName}</p>
                              <StatusBadge status={appointment.status} />
                              <StatusBadge status={appointment.paymentStatus} kind="payment" />
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {formatTime(appointment.startsAt)} · Dr. {appointment.doctorName}
                              {appointment.clinicName ? ` · ${appointment.clinicName}` : ''}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {appointment.patientPhone ?? 'No phone'} · {appointment.appointmentNumber} · {formatCurrency(appointment.consultationFee)}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-1.5">
                            {canCheckIn && (
                              <Button
                                size="sm"
                                variant="outline"
                                loading={updateStatus.isPending && updateStatus.variables?.id === appointment.id}
                                onClick={() => updateStatus.mutate({ id: appointment.id, next: 'checked_in' })}
                              >
                                <CalendarCheck2 /> Check in
                              </Button>
                            )}
                            {startConsultation && (
                              <Button
                                size="sm"
                                variant="outline"
                                loading={updateStatus.isPending && updateStatus.variables?.id === appointment.id}
                                onClick={() => updateStatus.mutate({ id: appointment.id, next: 'in_progress' })}
                              >
                                <Stethoscope /> Start
                              </Button>
                            )}
                            {canCollect && (
                              <Button
                                size="sm"
                                variant="soft"
                                loading={collectPayment.isPending && collectPayment.variables === appointment.id}
                                onClick={() => collectPayment.mutate(appointment.id)}
                              >
                                <CreditCard /> Collect
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    icon={CalendarDays}
                    title="No appointments today"
                    description="Today’s schedule is clear. Book a walk-in appointment to get started."
                    className="border-0 bg-transparent py-8"
                    action={{ label: 'Book appointment', href: '/reception/book' }}
                  />
                )}
              </CardContent>
            </Card>

            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-teal-600" /> Quick actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href="/reception/book"><CalendarDays /> Book for a patient</Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href="/reception/patients"><Users /> Patient directory</Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href="/reception/appointments?view=today"><Clock3 /> Manage check-ins</Link>
                </Button>
                <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
                  Check in confirmed patients as they arrive. Collect pay-at-clinic fees before or after the consultation.
                  Patients receive automatic notifications for every status change.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
