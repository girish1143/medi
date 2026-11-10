'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Star,
  TrendingUp,
  Users,
  Video,
} from 'lucide-react';
import { apiRequest } from '@/lib/api';
import type { DoctorDashboard } from '@/types';
import { useCurrentUser } from '@/hooks/use-auth';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatTime } from '@/lib/utils';

function shortDate(value: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00+05:30`));
}

function shortMonth(value: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'short' }).format(new Date(`${value}-01T12:00:00+05:30`));
}

export default function DoctorDashboardPage() {
  const { data: user } = useCurrentUser();
  const dashboard = useQuery({
    queryKey: ['doctor', 'dashboard'],
    queryFn: () => apiRequest<DoctorDashboard>('/doctor-portal/dashboard'),
  });

  const data = dashboard.data;

  return (
    <div>
      <PageHeader
        title={user ? `Welcome, Dr. ${user.fullName.replace(/^Dr\.?\s*/i, '').split(' ')[0]}` : 'Doctor dashboard'}
        description="Your clinic at a glance: today's schedule, earnings and patient trends."
        actions={
          <Button asChild>
            <Link href="/doctor/appointments">
              <CalendarDays /> View appointments
            </Link>
          </Button>
        }
      />

      {user?.doctorVerificationStatus && user.doctorVerificationStatus !== 'verified' && (
        <Alert variant="warning" className="mb-5">
          <Clock3 />
          <AlertTitle>Verification {user.doctorVerificationStatus}</AlertTitle>
          <AlertDescription>
            Your profile is not yet visible to patients. Keep your registration details accurate — our admin team reviews
            new doctor profiles. You can still prepare your availability and profile.
          </AlertDescription>
        </Alert>
      )}

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
        <ErrorState description="We could not load your dashboard." onRetry={() => void dashboard.refetch()} />
      ) : data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Today's appointments" value={data.stats.today} hint={`${data.stats.upcoming} upcoming total`} icon={CalendarCheck2} tone="blue" />
            <StatCard title="Monthly earnings" value={formatCurrency(data.stats.monthlyEarnings)} hint="Captured payments this month" icon={CreditCard} tone="emerald" />
            <StatCard title="Total patients" value={data.stats.totalPatients} hint={`${data.stats.completed} completed consultations`} icon={Users} tone="teal" />
            <StatCard
              title="Patient rating"
              value={data.stats.rating ? data.stats.rating.toFixed(1) : '—'}
              hint={`${data.stats.totalReviews} reviews · ${data.stats.completionRate}% completion`}
              icon={Star}
              tone="amber"
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Today&apos;s schedule</CardTitle>
                <Button asChild variant="ghost" size="sm" className="text-blue-600">
                  <Link href="/doctor/appointments?view=today">
                    See all <ArrowRight />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {data.todaySchedule.length ? (
                  <div className="space-y-2.5">
                    {data.todaySchedule.map((appointment) => (
                      <Link
                        key={appointment.id}
                        href={`/doctor/appointments/${appointment.id}`}
                        className="flex flex-col gap-2 rounded-xl border border-slate-100 p-3.5 transition hover:border-blue-200 hover:bg-blue-50/30 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex w-16 shrink-0 flex-col items-center rounded-lg bg-slate-50 py-1.5">
                            <span className="text-xs font-bold text-slate-800">{formatTime(appointment.startsAt)}</span>
                            <span className="text-[10px] text-slate-400">{formatTime(appointment.endsAt)}</span>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{appointment.patient.name}</p>
                            <p className="text-xs text-slate-500">
                              {appointment.patient.age ? `${appointment.patient.age} yrs` : 'Age —'}
                              {appointment.patient.gender ? ` · ${appointment.patient.gender}` : ''}
                              {appointment.reason ? ` · ${appointment.reason}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {appointment.appointmentType === 'online' && <Video className="h-4 w-4 text-violet-500" />}
                          <StatusBadge status={appointment.status} />
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={CalendarDays}
                    title="No appointments today"
                    description="Your schedule is clear. New bookings will appear here."
                    className="border-0 bg-transparent py-10"
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-teal-600" /> Last 7 days
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.trend} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                      <defs>
                        <linearGradient id="completedGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0da89c" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#0da89c" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <ChartTooltip labelFormatter={(value) => shortDate(String(value))} contentStyle={{ borderRadius: 10, borderColor: '#e2e8f0', fontSize: 12 }} />
                      <Area type="monotone" dataKey="completed" name="Completed" stroke="#0da89c" strokeWidth={2} fill="url(#completedGradient)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 flex justify-between text-xs text-slate-500">
                  <span>{data.stats.completed} completed</span>
                  <span>{data.stats.pendingPayments} payments pending</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Earnings trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.earnings} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="month" tickFormatter={shortMonth} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(value) => `₹${Math.round(Number(value) / 1000)}k`} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <ChartTooltip
                        formatter={(value) => [formatCurrency(Number(value)), 'Revenue']}
                        labelFormatter={(value) => shortMonth(String(value))}
                        contentStyle={{ borderRadius: 10, borderColor: '#e2e8f0', fontSize: 12 }}
                      />
                      <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                        {data.earnings.map((entry, index) => (
                          <Cell key={entry.month} fill={index === data.earnings.length - 1 ? '#1d4ed8' : '#bfdbfe'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Recent patients</CardTitle>
                <Button asChild variant="ghost" size="sm" className="text-blue-600">
                  <Link href="/doctor/patients">All patients</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {data.recentPatients.length ? (
                  <div className="space-y-2">
                    {data.recentPatients.map((patient) => (
                      <Link
                        key={patient.id}
                        href={`/doctor/patients/${patient.id}`}
                        className="flex items-center justify-between rounded-xl p-2.5 transition hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                            {patient.fullName
                              .split(' ')
                              .slice(0, 2)
                              .map((part) => part[0])
                              .join('')}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{patient.fullName}</p>
                            <p className="text-xs text-slate-400">{patient.visits} completed visits</p>
                          </div>
                        </div>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-slate-500">No patients yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
