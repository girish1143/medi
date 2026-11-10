'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  FolderHeart,
  MapPin,
  Pill,
  Plus,
  Stethoscope,
  Video,
} from 'lucide-react';
import { apiRequest } from '@/lib/api';
import type { PatientDashboard } from '@/types';
import { useCurrentUser } from '@/hooks/use-auth';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatDateTime, formatTime, relativeTime } from '@/lib/utils';

export default function PatientDashboardPage() {
  const { data: user } = useCurrentUser();
  const dashboard = useQuery({
    queryKey: ['patient', 'dashboard'],
    queryFn: () => apiRequest<PatientDashboard>('/patients/me/dashboard'),
  });

  const data = dashboard.data;

  return (
    <div>
      <PageHeader
        title={user ? `Hello, ${user.fullName.split(' ')[0]}` : 'Your health dashboard'}
        description="Track appointments, prescriptions and records, and book your next consultation in a few taps."
        actions={
          <Button asChild>
            <Link href="/doctors">
              <Plus /> Book appointment
            </Link>
          </Button>
        }
      />

      {dashboard.isLoading ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-28 rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
            <Skeleton className="h-80 rounded-2xl" />
          </div>
        </div>
      ) : dashboard.isError ? (
        <ErrorState
          description="We could not load your dashboard."
          onRetry={() => void dashboard.refetch()}
        />
      ) : data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Upcoming visits" value={data.stats.upcoming} hint="Pending, confirmed or checked in" icon={CalendarDays} tone="blue" />
            <StatCard title="Completed visits" value={data.stats.completed} hint="All time consultations" icon={CheckCircle2} tone="emerald" />
            <StatCard
              title="Payment due"
              value={data.stats.pendingPayment}
              hint="Appointments awaiting payment"
              icon={CreditCard}
              tone="amber"
            />
            <StatCard title="Health records" value={data.counts.records} hint={`${data.counts.prescriptions} prescriptions stored`} icon={FolderHeart} tone="teal" />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Your next appointments</CardTitle>
                <Button asChild variant="ghost" size="sm" className="text-blue-600">
                  <Link href="/patient/appointments">
                    View all <ArrowRight />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {data.upcoming.length ? (
                  <div className="space-y-3">
                    {data.upcoming.map((appointment) => (
                      <Link
                        key={appointment.id}
                        href={`/patient/appointments/${appointment.id}`}
                        className="flex flex-col gap-3 rounded-xl border border-slate-100 p-4 transition hover:border-blue-200 hover:bg-blue-50/30 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-start gap-3">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                            {appointment.appointmentType === 'online' ? <Video className="h-5 w-5" /> : <Stethoscope className="h-5 w-5" />}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">Dr. {appointment.doctorName}</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {appointment.specialty ?? 'Consultation'} · {appointment.qualification}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                              <span className="inline-flex items-center gap-1">
                                <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                                {formatDate(appointment.startsAt)}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Clock3 className="h-3.5 w-3.5 text-slate-400" />
                                {formatTime(appointment.startsAt)}
                              </span>
                              {appointment.clinicName && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                                  {appointment.clinicName}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                          <StatusBadge status={appointment.status} />
                          <StatusBadge status={appointment.paymentStatus} kind="payment" />
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={CalendarDays}
                    title="No upcoming appointments"
                    description="Find a verified specialist and choose a time that works for you."
                    action={{ label: 'Find a doctor', href: '/doctors' }}
                    className="border-0 bg-transparent py-10"
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent activity</CardTitle>
              </CardHeader>
              <CardContent>
                {data.activity.length ? (
                  <ol className="relative space-y-4 border-l border-slate-100 pl-4">
                    {data.activity.slice(0, 5).map((item) => (
                      <li key={item.id} className="relative">
                        <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-blue-500 ring-4 ring-white" />
                        <p className="text-sm font-medium text-slate-800">{item.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">{item.body}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{relativeTime(item.createdAt)}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="py-6 text-center text-sm text-slate-500">No activity yet.</p>
                )}
                <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                  <Link href="/patient/notifications">All notifications</Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { href: '/patient/prescriptions', label: 'Prescriptions', body: 'View medicines and download PDFs', icon: Pill, count: data.counts.prescriptions },
              { href: '/patient/records', label: 'Health records', body: 'Upload reports and lab results', icon: FileText, count: data.counts.records },
              { href: '/doctors', label: 'Find a doctor', body: 'Search by specialty, fee and rating', icon: Stethoscope },
              { href: '/patient/support', label: 'Need help?', body: 'Raise a support request', icon: FolderHeart },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-soft"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-600 transition group-hover:bg-blue-50 group-hover:text-blue-600">
                  <item.icon className="h-5 w-5" />
                </span>
                <p className="mt-3 flex items-center justify-between text-sm font-semibold text-slate-900">
                  {item.label}
                  {typeof item.count === 'number' && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{item.count}</span>
                  )}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.body}</p>
              </Link>
            ))}
          </div>

          <p className="text-center text-xs text-slate-400">
            Last updated {formatDateTime(new Date())} · Times shown in IST
          </p>
        </div>
      ) : null}
    </div>
  );
}
