'use client';

import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorBanner } from '@/components/ui/table';
import { formatCurrencyMinor } from '@/lib/utils';
import { apiFetch } from '@/services/api-client';
import type { AdminDashboardData } from '@/types/api.types';

function ChartCard({
  title,
  description,
  isEmpty,
  emptyLabel,
  children,
}: {
  title: string;
  description: string;
  isEmpty: boolean;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <EmptyState title="No records yet" description={emptyLabel} />
        ) : (
          <div className="h-64 w-full">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardOverviewClient({
  initialData,
}: {
  initialData: AdminDashboardData;
}) {
  const [data, setData] = useState<AdminDashboardData>(initialData);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function applyDateFilter(nextFrom: string, nextTo: string) {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (nextFrom) qs.set('from', nextFrom);
      if (nextTo) qs.set('to', nextTo);
      const res = await apiFetch(`/api/admin/dashboard?${qs.toString()}`, { cache: 'no-store' });
      const json = (await res.json()) as {
        success: boolean;
        data?: AdminDashboardData;
        error?: { message?: string };
      };
      if (!res.ok || !json.success || !json.data) {
        setError(json.error?.message ?? 'Failed to load filtered metrics.');
        return;
      }
      setData(json.data);
    } catch {
      setError('Unable to reach dashboard metrics API.');
    } finally {
      setLoading(false);
    }
  }

  const m = data.metrics;
  const kpis = [
    { label: 'Total Patients', value: String(m.totalPatients) },
    { label: 'Total Doctors', value: String(m.totalDoctors) },
    { label: 'Verified Doctors', value: String(m.verifiedDoctors) },
    { label: 'Total Hospitals', value: String(m.totalHospitals) },
    { label: 'Verified Hospitals', value: String(m.verifiedHospitals) },
    { label: 'Total Leads', value: String(m.totalLeads) },
    { label: 'New Leads', value: String(m.newLeads) },
    { label: 'Assigned Leads', value: String(m.assignedLeads) },
    { label: 'Converted Leads', value: String(m.convertedLeads) },
    { label: 'Active Subscriptions', value: String(m.activeSubscriptions) },
    {
      label: 'Actual Payment Revenue',
      value: formatCurrencyMinor(m.actualPaymentRevenueMinor, 'USD'),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header + Date Filters */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Platform Overview
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Live SQLite metrics and aggregations via Prisma ORM. Empty tables report exact zero counts.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="from-date" className="block text-[11px] font-medium text-slate-500">
              From
            </label>
            <Input
              id="from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-36"
            />
          </div>
          <div>
            <label htmlFor="to-date" className="block text-[11px] font-medium text-slate-500">
              To
            </label>
            <Input
              id="to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-36"
            />
          </div>
          <Button
            size="md"
            disabled={loading}
            onClick={() => applyDateFilter(fromDate, toDate)}
          >
            {loading ? 'Filtering...' : 'Apply Filter'}
          </Button>
          {(fromDate || toDate) && (
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                setFromDate('');
                setToDate('');
                void applyDateFilter('', '');
              }}
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      <ErrorBanner message={error} />

      {/* 11 Real Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{kpi.label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {kpi.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 6 Database-Backed Recharts Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Leads Generated Over Time"
          description="Daily volume of patient healthcare enquiries and conversions."
          isEmpty={data.charts.leadsOverTime.length === 0}
          emptyLabel="Leads will appear here as patients submit enquiries."
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.charts.leadsOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="total" name="Total Leads" stroke="#0f766e" fill="#99f6e4" />
              <Area type="monotone" dataKey="converted" name="Converted" stroke="#0284c7" fill="#bae6fd" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Lead Conversion Trends by Status"
          description="Distribution of enquiries across lifecycle states."
          isEmpty={data.charts.leadConversionByStatus.length === 0}
          emptyLabel="No lead status records exist for the selected range."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.charts.leadConversionByStatus}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
              <XAxis dataKey="status" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" name="Leads" fill="#0f766e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Revenue Trends (Minor Units)"
          description="Confirmed payment gateway settlements minus refunds."
          isEmpty={data.charts.revenueOverTime.length === 0}
          emptyLabel="No verified payment settlements recorded yet."
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.charts.revenueOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="revenueMinor" name="Net Revenue (Minor)" stroke="#059669" fill="#a7f3d0" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Doctor Performance"
          description="Lead assignments vs acceptances and rejections per doctor."
          isEmpty={data.charts.doctorPerformance.length === 0}
          emptyLabel="No doctor lead assignments recorded yet."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.charts.doctorPerformance}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="accepted" name="Accepted" fill="#0f766e" />
              <Bar dataKey="rejected" name="Rejected" fill="#e11d48" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Hospital Performance"
          description="Lead assignments vs acceptances and rejections per hospital."
          isEmpty={data.charts.hospitalPerformance.length === 0}
          emptyLabel="No hospital lead assignments recorded yet."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.charts.hospitalPerformance}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="accepted" name="Accepted" fill="#0284c7" />
              <Bar dataKey="rejected" name="Rejected" fill="#e11d48" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Location-Based Enquiries"
          description="Geographic breakdown of patient demand by city and state."
          isEmpty={data.charts.locationEnquiries.length === 0}
          emptyLabel="No geographic lead records exist yet."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.charts.locationEnquiries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
              <XAxis dataKey="location" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" name="Enquiries" fill="#0d9488" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
