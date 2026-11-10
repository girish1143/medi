import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';

export interface DateRangeFilter {
  from?: Date | undefined;
  to?: Date | undefined;
}

export interface AdminDashboardData {
  metrics: {
    totalPatients: number;
    totalDoctors: number;
    verifiedDoctors: number;
    totalHospitals: number;
    verifiedHospitals: number;
    totalLeads: number;
    newLeads: number;
    assignedLeads: number;
    convertedLeads: number;
    activeSubscriptions: number;
    actualPaymentRevenueMinor: number;
  };
  charts: {
    leadsOverTime: Array<{ date: string; total: number; converted: number }>;
    leadConversionByStatus: Array<{ status: string; count: number }>;
    revenueOverTime: Array<{ date: string; revenueMinor: number }>;
    doctorPerformance: Array<{ name: string; totalAssigned: number; accepted: number; rejected: number }>;
    hospitalPerformance: Array<{ name: string; totalAssigned: number; accepted: number; rejected: number }>;
    locationEnquiries: Array<{ location: string; count: number }>;
    subscriptionPerformance: Array<{ planName: string; activeCount: number; leadsConsumed: number }>;
  };
}

function buildDateWhere(filter: DateRangeFilter, field: 'createdAt' | 'paidAt' = 'createdAt') {
  if (!filter.from && !filter.to) return {};
  return {
    [field]: {
      ...(filter.from ? { gte: filter.from } : {}),
      ...(filter.to ? { lte: filter.to } : {}),
    },
  };
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseDateRangeQuery(query: Record<string, unknown>): DateRangeFilter {
  const fromRaw = typeof query.from === 'string' ? query.from.trim() : '';
  const toRaw = typeof query.to === 'string' ? query.to.trim() : '';

  const parse = (raw: string, endOfDay: boolean): Date | undefined => {
    if (!raw) return undefined;
    const iso = raw.length === 10 ? `${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : raw;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };

  return {
    from: parse(fromRaw, false),
    to: parse(toRaw, true),
  };
}

export async function getAdminAnalyticsData(
  filter: DateRangeFilter = {},
  db: PrismaClient = prisma,
): Promise<AdminDashboardData> {
  const dateWhere = buildDateWhere(filter, 'createdAt');

  const [
    totalPatients,
    totalDoctors,
    verifiedDoctors,
    totalHospitals,
    verifiedHospitals,
    leads,
    activeSubscriptions,
    payments,
    assignments,
    subscriptions,
  ] = await Promise.all([
    db.patient.count({ where: { archivedAt: null, ...dateWhere } }),
    db.doctor.count({ where: { archivedAt: null, ...dateWhere } }),
    db.doctor.count({ where: { archivedAt: null, verificationStatus: 'VERIFIED', ...dateWhere } }),
    db.hospital.count({ where: { archivedAt: null, ...dateWhere } }),
    db.hospital.count({ where: { archivedAt: null, verificationStatus: 'VERIFIED', ...dateWhere } }),
    db.lead.findMany({
      where: { archivedAt: null, ...dateWhere },
      select: { id: true, status: true, locationCity: true, locationState: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.subscription.count({ where: { status: { in: ['ACTIVE', 'TRIALING'] } } }),
    db.payment.findMany({
      where: { status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] }, ...dateWhere },
      select: { amountMinor: true, refundedMinor: true, paidAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.leadAssignment.findMany({
      where: dateWhere,
      select: {
        providerType: true,
        status: true,
        doctor: { select: { user: { select: { fullName: true } } } },
        hospital: { select: { displayName: true } },
      },
    }),
    db.subscription.findMany({
      where: dateWhere,
      select: { status: true, leadsConsumedInPeriod: true, plan: { select: { name: true } } },
    }),
  ]);

  let newLeads = 0;
  let assignedLeads = 0;
  let convertedLeads = 0;
  const leadsByDay = new Map<string, { total: number; converted: number }>();
  const statusMap = new Map<string, number>();
  const locationMap = new Map<string, number>();

  for (const lead of leads) {
    if (lead.status === 'NEW') newLeads += 1;
    if (lead.status === 'ASSIGNED') assignedLeads += 1;
    if (lead.status === 'CONVERTED') convertedLeads += 1;

    const day = toDateKey(lead.createdAt);
    const dayBucket = leadsByDay.get(day) ?? { total: 0, converted: 0 };
    dayBucket.total += 1;
    if (lead.status === 'CONVERTED') dayBucket.converted += 1;
    leadsByDay.set(day, dayBucket);

    statusMap.set(lead.status, (statusMap.get(lead.status) ?? 0) + 1);
    const locKey = `${lead.locationCity}, ${lead.locationState}`;
    locationMap.set(locKey, (locationMap.get(locKey) ?? 0) + 1);
  }

  let actualPaymentRevenueMinor = 0;
  const revenueByDay = new Map<string, number>();
  for (const payment of payments) {
    const netMinor = Math.max(0, payment.amountMinor - payment.refundedMinor);
    actualPaymentRevenueMinor += netMinor;
    const day = toDateKey(payment.paidAt ?? payment.createdAt);
    revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + netMinor);
  }

  const doctorPerfMap = new Map<string, { totalAssigned: number; accepted: number; rejected: number }>();
  const hospitalPerfMap = new Map<string, { totalAssigned: number; accepted: number; rejected: number }>();

  for (const assign of assignments) {
    if (assign.providerType === 'DOCTOR' && assign.doctor) {
      const name = assign.doctor.user.fullName;
      const entry = doctorPerfMap.get(name) ?? { totalAssigned: 0, accepted: 0, rejected: 0 };
      entry.totalAssigned += 1;
      if (assign.status === 'ACCEPTED') entry.accepted += 1;
      if (assign.status === 'REJECTED') entry.rejected += 1;
      doctorPerfMap.set(name, entry);
    } else if (assign.providerType === 'HOSPITAL' && assign.hospital) {
      const name = assign.hospital.displayName;
      const entry = hospitalPerfMap.get(name) ?? { totalAssigned: 0, accepted: 0, rejected: 0 };
      entry.totalAssigned += 1;
      if (assign.status === 'ACCEPTED') entry.accepted += 1;
      if (assign.status === 'REJECTED') entry.rejected += 1;
      hospitalPerfMap.set(name, entry);
    }
  }

  const subPerfMap = new Map<string, { activeCount: number; leadsConsumed: number }>();
  for (const sub of subscriptions) {
    const planName = sub.plan.name;
    const entry = subPerfMap.get(planName) ?? { activeCount: 0, leadsConsumed: 0 };
    if (sub.status === 'ACTIVE' || sub.status === 'TRIALING') entry.activeCount += 1;
    entry.leadsConsumed += sub.leadsConsumedInPeriod;
    subPerfMap.set(planName, entry);
  }

  return {
    metrics: {
      totalPatients,
      totalDoctors,
      verifiedDoctors,
      totalHospitals,
      verifiedHospitals,
      totalLeads: leads.length,
      newLeads,
      assignedLeads,
      convertedLeads,
      activeSubscriptions,
      actualPaymentRevenueMinor,
    },
    charts: {
      leadsOverTime: Array.from(leadsByDay.entries()).map(([date, val]) => ({
        date,
        total: val.total,
        converted: val.converted,
      })),
      leadConversionByStatus: Array.from(statusMap.entries()).map(([status, count]) => ({ status, count })),
      revenueOverTime: Array.from(revenueByDay.entries()).map(([date, revenueMinor]) => ({ date, revenueMinor })),
      doctorPerformance: Array.from(doctorPerfMap.entries())
        .map(([name, stats]) => ({ name, ...stats }))
        .slice(0, 10),
      hospitalPerformance: Array.from(hospitalPerfMap.entries())
        .map(([name, stats]) => ({ name, ...stats }))
        .slice(0, 10),
      locationEnquiries: Array.from(locationMap.entries())
        .map(([location, count]) => ({ location, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      subscriptionPerformance: Array.from(subPerfMap.entries()).map(([planName, stats]) => ({
        planName,
        ...stats,
      })),
    },
  };
}

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  const formulaSafe = /^[=+\-@]/.test(str) ? `'${str}` : str;
  if (formulaSafe.includes(',') || formulaSafe.includes('"') || formulaSafe.includes('\n')) {
    return `"${formulaSafe.replace(/"/g, '""')}"`;
  }
  return formulaSafe;
}

export function buildAnalyticsCsv(
  report: string,
  data: AdminDashboardData,
): { filename: string; csv: string } {
  let headers: string[] = [];
  let rows: Array<Array<string | number>> = [];

  switch (report) {
    case 'revenue':
      headers = ['Date', 'Net Revenue (Minor Units)'];
      rows = data.charts.revenueOverTime.map((r) => [r.date, r.revenueMinor]);
      break;
    case 'doctors':
      headers = ['Doctor', 'Total Assigned', 'Accepted', 'Rejected'];
      rows = data.charts.doctorPerformance.map((d) => [d.name, d.totalAssigned, d.accepted, d.rejected]);
      break;
    case 'hospitals':
      headers = ['Hospital', 'Total Assigned', 'Accepted', 'Rejected'];
      rows = data.charts.hospitalPerformance.map((h) => [h.name, h.totalAssigned, h.accepted, h.rejected]);
      break;
    case 'locations':
      headers = ['Location', 'Enquiry Count'];
      rows = data.charts.locationEnquiries.map((l) => [l.location, l.count]);
      break;
    case 'subscriptions':
      headers = ['Plan', 'Active Subscriptions', 'Leads Consumed'];
      rows = data.charts.subscriptionPerformance.map((s) => [s.planName, s.activeCount, s.leadsConsumed]);
      break;
    default:
      headers = ['Date', 'Total Leads', 'Converted Leads'];
      rows = data.charts.leadsOverTime.map((l) => [l.date, l.total, l.converted]);
  }

  return {
    filename: `healthcare-${report}-report.csv`,
    csv: [headers.map(escapeCsvCell).join(','), ...rows.map((row) => row.map(escapeCsvCell).join(','))].join('\n'),
  };
}
