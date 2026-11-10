import { redirect } from 'next/navigation';
import { DashboardOverviewClient } from '@/components/admin/DashboardCharts';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { backendServerFetch, getServerActor } from '@/lib/auth/server-api';
import { isAdminUserRole } from '@/lib/domain/enums';
import type { AdminDashboardData } from '@/types/api.types';

export const dynamic = 'force-dynamic';

const EMPTY_DASHBOARD: AdminDashboardData = {
  metrics: {
    totalPatients: 0,
    totalDoctors: 0,
    verifiedDoctors: 0,
    totalHospitals: 0,
    verifiedHospitals: 0,
    totalLeads: 0,
    newLeads: 0,
    assignedLeads: 0,
    convertedLeads: 0,
    activeSubscriptions: 0,
    actualPaymentRevenueMinor: 0,
  },
  charts: {
    leadsOverTime: [],
    leadConversionByStatus: [],
    revenueOverTime: [],
    doctorPerformance: [],
    hospitalPerformance: [],
    locationEnquiries: [],
    subscriptionPerformance: [],
  },
};

export default async function AdminDashboardPage() {
  const session = await getServerActor();
  if (!session.authenticated) {
    redirect('/login');
  }
  if (!isAdminUserRole(session.actor.role)) {
    redirect('/access-denied');
  }
  if (!session.actor.permissions.includes(PERMISSIONS.ANALYTICS_READ)) {
    redirect('/admin/support');
  }

  const res = await backendServerFetch<AdminDashboardData>('/admin/dashboard');
  return <DashboardOverviewClient initialData={res.data ?? EMPTY_DASHBOARD} />;
}
