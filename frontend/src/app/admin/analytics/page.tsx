'use client';

import { useQuery } from '@tanstack/react-query';
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
import { Activity, CalendarCheck2, TrendingUp, Users, Wallet } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import type { AdminAnalytics } from '@/types';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { ErrorState } from '@/components/shared/error-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, titleCase } from '@/lib/utils';

const PIE_COLORS = ['#1d4ed8', '#0da89c', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b', '#0ea5e9'];

function shortDate(value: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }).format(
    new Date(`${value}T12:00:00+05:30`),
  );
}

function shortMonth(value: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'short' }).format(
    new Date(`${value}-01T12:00:00+05:30`),
  );
}

export default function AdminAnalyticsPage() {
  const query = useQuery({
    queryKey: ['admin', 'analytics'],
    queryFn: () => apiRequest<AdminAnalytics>('/admin/analytics'),
  });
  const data = query.data;

  const totalRevenue = data ? data.monthlyRevenue.reduce((sum, row) => sum + row.revenue, 0) : 0;
  const totalRefunds = data ? data.monthlyRevenue.reduce((sum, row) => sum + row.refunds, 0) : 0;
  const netRevenue = totalRevenue - totalRefunds;
  const completionRate = data && data.stats.totalAppointments
    ? Math.round((data.stats.completedAppointments / data.stats.totalAppointments) * 100)
    : 0;

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Revenue, demand and doctor performance across the platform. Figures cover the last 12 months."
      />

      {query.isLoading ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : query.isError ? (
        <ErrorState description="We could not load analytics." onRetry={() => void query.refetch()} />
      ) : data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Net revenue"
              value={formatCurrency(netRevenue)}
              hint={`${formatCurrency(totalRefunds)} refunded`}
              icon={Wallet}
              tone="emerald"
            />
            <StatCard
              title="Appointments"
              value={data.stats.totalAppointments}
              hint={`${data.stats.todayAppointments} scheduled today`}
              icon={CalendarCheck2}
              tone="blue"
            />
            <StatCard
              title="Completion rate"
              value={`${completionRate}%`}
              hint={`${data.stats.completedAppointments} completed visits`}
              icon={Activity}
              tone="teal"
            />
            <StatCard
              title="Month over month"
              value={`${data.stats.appointmentGrowth > 0 ? '+' : ''}${data.stats.appointmentGrowth}%`}
              hint="Appointment growth"
              icon={TrendingUp}
              tone={data.stats.appointmentGrowth >= 0 ? 'violet' : 'rose'}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Revenue vs refunds</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.monthlyRevenue} margin={{ top: 5, right: 5, bottom: 0, left: -8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="month" tickFormatter={shortMonth} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(value) => `₹${Math.round(Number(value) / 1000)}k`} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <ChartTooltip
                        formatter={(value, name) => [formatCurrency(Number(value)), String(name)]}
                        labelFormatter={(value) => shortMonth(String(value))}
                        contentStyle={{ borderRadius: 10, borderColor: '#e2e8f0', fontSize: 12 }}
                      />
                      <Bar dataKey="revenue" name="Revenue" radius={[6, 6, 0, 0]} fill="#1d4ed8" />
                      <Bar dataKey="refunds" name="Refunds" radius={[6, 6, 0, 0]} fill="#fca5a5" />
                    </BarChart>
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
                          <ChartTooltip
                            formatter={(value, name) => [value, titleCase(String(name))]}
                            contentStyle={{ borderRadius: 10, borderColor: '#e2e8f0', fontSize: 12 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {data.statusDistribution.map((entry, index) => (
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

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Appointment trend · last 14 days</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.daily} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                      <defs>
                        <linearGradient id="analyticsTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <ChartTooltip labelFormatter={(value) => shortDate(String(value))} contentStyle={{ borderRadius: 10, borderColor: '#e2e8f0', fontSize: 12 }} />
                      <Area type="monotone" dataKey="total" name="Booked" stroke="#1d4ed8" strokeWidth={2} fill="url(#analyticsTotal)" />
                      <Area type="monotone" dataKey="completed" name="Completed" stroke="#0da89c" strokeWidth={2} fill="transparent" />
                      <Area type="monotone" dataKey="cancelled" name="Cancelled" stroke="#ef4444" strokeWidth={2} fill="transparent" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Specialty demand</CardTitle>
              </CardHeader>
              <CardContent>
                {data.specialtyDistribution.length ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.specialtyDistribution.slice(0, 8)} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="specialty" width={96} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <ChartTooltip contentStyle={{ borderRadius: 10, borderColor: '#e2e8f0', fontSize: 12 }} />
                        <Bar dataKey="count" name="Appointments" radius={[0, 6, 6, 0]} fill="#0da89c" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="py-10 text-center text-sm text-slate-500">No specialty data yet.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Doctor performance</CardTitle>
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <Users className="h-3.5 w-3.5" /> {data.stats.totalDoctors} doctors
              </span>
            </CardHeader>
            <CardContent>
              {data.topDoctors.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Doctor</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead className="text-right">Revenue share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topDoctors.map((doctor, index) => {
                      const share = totalRevenue ? Math.round((doctor.revenue / totalRevenue) * 100) : 0;
                      return (
                        <TableRow key={doctor.id}>
                          <TableCell className="text-xs font-semibold text-slate-400">{index + 1}</TableCell>
                          <TableCell>
                            <p className="text-sm font-medium text-slate-800">{doctor.name}</p>
                            <p className="text-xs text-slate-500">{doctor.specialty ?? 'General'}</p>
                          </TableCell>
                          <TableCell className="text-slate-600">{doctor.completed}</TableCell>
                          <TableCell className="font-medium text-slate-800">{formatCurrency(doctor.revenue)}</TableCell>
                          <TableCell className="text-slate-600">{doctor.rating ? doctor.rating.toFixed(1) : '—'}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                                <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(share, 100)}%` }} />
                              </div>
                              <span className="w-9 text-right text-xs font-medium text-slate-500">{share}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <p className="py-10 text-center text-sm text-slate-500">No doctor activity yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
