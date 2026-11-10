import { AnalyticsClient } from '@/components/admin/AnalyticsClient';
import { requireAdminPageAccess } from '@/lib/auth/admin-page';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { backendServerFetch } from '@/lib/auth/server-api';
import type { AdminDashboardData } from '@/types/api.types';

export const dynamic = 'force-dynamic';

const EMPTY_ANALYTICS: AdminDashboardData = {
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

export default async function AdminAnalyticsPage() {
  await requireAdminPageAccess(PERMISSIONS.ANALYTICS_READ);
  const res = await backendServerFetch<AdminDashboardData>('/admin/analytics');
  return <AnalyticsClient initialData={res.data ?? EMPTY_ANALYTICS} />;
}
