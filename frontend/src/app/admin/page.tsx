'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ShieldCheck,
  Stethoscope,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api';
import type { AdminDashboard } from '@/types';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDate, formatDateTime, titleCase } from '@/lib/utils';

const PIE_COLORS = ['#1d4ed8', '#0da89c', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b'];

function shortDate(value: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00+05:30`));
}

function shortMonth(value: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'short' }).format(new Date(`${value}-01T12:00:00+05:30`));
}

export default function AdminDashboardPage() {
  const queryClient = useQueryClient();
  const dashboard = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => apiRequest<AdminDashboard>('/admin/dashboard'),
  });
  const data = dashboard.data;

  const verify = useMutation({
    mutationFn: (doctorId: string) =>
      apiRequest(`/admin/doctors/${doctorId}/verification`, { method: 'PATCH', body: { status: 'verified' } }),
    onSuccess: () => {
      toast.success('Doctor verified and published');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'doctors'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to verify doctor'),
  });

  return (
    <div>
      <PageHeader
        title="Platform overview"
        description="Appointments, revenue and doctor verification across MediBook."
        actions={
          <Button asChild>
            <Link href="/admin/doctors">
              <ShieldCheck /> Review doctors
            </Link>
          </Button>
        }
      />

      {dashboard.isLoading ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
              <Skeleton key={index} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      ) : dashboard.isError ? (
        <ErrorState description="We could not load the admin dashboard." onRetry={() => void dashboard.refetch()} />
      ) : data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Total patients" value={data.stats.totalPatients} hint={`${data.stats.totalDoctors} doctors · ${data.stats.verifiedDoctors} verified`} icon={Users} tone="blue" />
            <StatCard title="Appointments" value={data.stats.totalAppointments} hint={`${data.stats.todayAppointments} today · ${data.stats.pendingAppointments} pending`} icon={CalendarDays} tone="teal" />
            <StatCard title="Total revenue" value={formatCurrency(data.stats.totalRevenue)} hint={`${formatCurrency(data.stats.monthlyRevenue)} this month`} icon={Wallet} tone="emerald" />
            <StatCard
              title="Appointment growth"
              value={`${data.stats.appointmentGrowth > 0 ? '+' : ''}${data.stats.appointmentGrowth}%`}
              hint="Month over month"
              icon={TrendingUp}
              tone={data.stats.appointmentGrowth >= 0 ? 'violet' : 'rose'}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Pending verification" value={data.stats.pendingDoctors} hint="Doctors awaiting review" icon={Clock3} tone="amber" />
            <StatCard title="Completed visits" value={data.stats.completedAppointments} hint="All time" icon={CheckCircle2} tone="emerald" />
            <StatCard title="Cancelled visits" value={data.stats.cancelledAppointments} hint="All time" icon={CalendarDays} tone="rose" />
            <StatCard title="Verified doctors" value={data.stats.verifiedDoctors} hint={`${data.stats.totalDoctors} total doctors`} icon={BadgeCheck} tone="blue" />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Appointment activity — last 14 days</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.daily} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                      <defs>
                        <linearGradient id="adminTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <ChartTooltip labelFormatter={(value) => shortDate(String(value))} contentStyle={{ borderRadius: 10, borderColor: '#e2e8f0', fontSize: 12 }} />
                      <Area type="monotone" dataKey="total" name="Booked" stroke="#1d4ed8" strokeWidth={2} fill="url(#adminTotal)" />
                      <Area type="monotone" dataKey="completed" name="Completed" stroke="#0da89c" strokeWidth={2} fill="transparent" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Status distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {data.statusDistribution.length ? (
                  <>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={data.statusDistribution} dataKey="count" nameKey="status" innerRadius={45} outerRadius={75} paddingAngle={2}>
                            {data.statusDistribution.map((entry, index) => (
                              <Cell key={entry.status} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <ChartTooltip formatter={(value, name) => [value, titleCase(String(name))]} contentStyle={{ borderRadius: 10, borderColor: '#e2e8f0', fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {data.statusDistribution.slice(0, 5).map((entry, index) => (
                        <div key={entry.status} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-2 text-slate-600">
                            <span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} />
                            {titleCase(entry.status)}
                          </span>
                          <span className="font-semibold text-slate-800">{entry.count}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="py-10 text-center text-sm text-slate-500">No appointments yet.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Monthly revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.monthlyRevenue} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="month" tickFormatter={shortMonth} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(value) => `₹${Math.round(Number(value) / 1000)}k`} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <ChartTooltip formatter={(value) => formatCurrency(Number(value))} labelFormatter={(value) => shortMonth(String(value))} contentStyle={{ borderRadius: 10, borderColor: '#e2e8f0', fontSize: 12 }} />
                      <Bar dataKey="revenue" name="Revenue" radius={[6, 6, 0, 0]} fill="#1d4ed8" />
                      <Bar dataKey="refunds" name="Refunds" radius={[6, 6, 0, 0]} fill="#fca5a5" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Pending verification</CardTitle>
                <Button asChild variant="ghost" size="sm" className="text-blue-600">
                  <Link href="/admin/doctors?status=pending">
                    All <ArrowRight />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {data.pendingVerification.length ? (
                  <div className="space-y-3">
                    {data.pendingVerification.slice(0, 4).map((doctor) => (
                      <div key={doctor.id} className="rounded-xl border border-slate-100 p-3">
                        <p className="text-sm font-semibold text-slate-900">{doctor.full_name}</p>
                        <p className="text-xs text-slate-500">{doctor.specialty ?? 'General'} · {doctor.qualification}</p>
                        <p className="mt-0.5 text-xs text-slate-400">Reg. {doctor.registration_number}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 w-full"
                          loading={verify.isPending && verify.variables === doctor.id}
                          onClick={() => verify.mutate(doctor.id)}
                        >
                          <BadgeCheck /> Verify doctor
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={BadgeCheck} title="All caught up" description="No doctors are waiting for verification." className="border-0 bg-transparent py-8" />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top doctors</CardTitle>
              </CardHeader>
              <CardContent>
                {data.topDoctors.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Doctor</TableHead>
                        <TableHead>Completed</TableHead>
                        <TableHead>Revenue</TableHead>
                        <TableHead>Rating</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.topDoctors.map((doctor) => (
                        <TableRow key={doctor.id}>
                          <TableCell>
                            <p className="text-sm font-medium text-slate-800">{doctor.name}</p>
                            <p className="text-xs text-slate-500">{doctor.specialty ?? 'General'}</p>
                          </TableCell>
                          <TableCell className="text-slate-600">{doctor.completed}</TableCell>
                          <TableCell className="font-medium text-slate-800">{formatCurrency(doctor.revenue)}</TableCell>
                          <TableCell className="text-slate-600">{doctor.rating ? doctor.rating.toFixed(1) : '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="py-8 text-center text-sm text-slate-500">No doctor activity yet.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Recent bookings</CardTitle>
                <Button asChild variant="ghost" size="sm" className="text-blue-600">
                  <Link href="/admin/appointments">
                    All <ArrowRight />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.recentAppointments.length ? (
                  data.recentAppointments.map((appointment) => (
                    <div key={appointment.id} className="flex items-center justify-between gap-3 rounded-xl p-2.5 transition hover:bg-slate-50">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{appointment.patientName}</p>
                        <p className="truncate text-xs text-slate-500">
                          Dr. {appointment.doctorName} · {formatDateTime(appointment.startsAt)}
                        </p>
                      </div>
                      <StatusBadge status={appointment.status} />
                    </div>
                  ))
                ) : (
                  <p className="py-8 text-center text-sm text-slate-500">No appointments yet.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-teal-600" /> Specialty demand
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.specialtyDistribution.length ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {data.specialtyDistribution.map((entry) => (
                    <div key={entry.specialty} className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">{entry.specialty}</p>
                      <p className="mt-1 text-lg font-bold text-slate-900">{entry.count}</p>
                      <p className="text-[11px] text-slate-400">appointments</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No specialty data yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
