import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LeadDetailClient } from '@/components/admin/LeadDetailClient';
import { Button } from '@/components/ui/button';
import { actorHasPermission, requireAdminPageAccess } from '@/lib/auth/admin-page';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { backendServerFetch } from '@/lib/auth/server-api';

export const dynamic = 'force-dynamic';

interface LeadDetailApiResponse {
  lead: {
    id: string;
    patientId: string;
    specialization: string;
    locationCity: string;
    locationState: string;
    countryCode: string;
    consultationMode: string;
    enquiryDescription: string;
    leadSource: string;
    status: string;
    priority: string;
    createdAt: string;
    qualifiedAt: string | null;
    closedAt: string | null;
    consents: Array<{
      id: string;
      consentPurpose: string;
      authorizedProviderScope: string;
      status: string;
      consentVersion: string;
      grantedAt: string;
      revokedAt: string | null;
    }>;
    assignments: Array<{
      id: string;
      providerType: string;
      status: string;
      matchScore: number | null;
      assignedAt: string;
      acceptedAt: string | null;
      rejectedAt: string | null;
      rejectionReason: string | null;
      doctor: { user: { fullName: string } } | null;
      hospital: { displayName: string } | null;
    }>;
    history: Array<{
      id: string;
      eventType: string;
      fromStatus: string | null;
      toStatus: string | null;
      reason: string | null;
      createdAt: string;
    }>;
  };
}

export default async function AdminLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireAdminPageAccess(PERMISSIONS.LEADS_READ);
  const { id } = await params;

  const res = await backendServerFetch<LeadDetailApiResponse>(`/admin/leads/${id}`);
  if (!res.ok || !res.data?.lead) notFound();

  const lead = res.data.lead;
  const canQualify = await actorHasPermission(actor, PERMISSIONS.LEADS_QUALIFY);
  const canAssign = await actorHasPermission(actor, PERMISSIONS.LEADS_ASSIGN);
  const canRevealContact = await actorHasPermission(actor, PERMISSIONS.PATIENTS_READ);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Lead Detail ({lead.id.slice(0, 8)})
        </h1>
        <Link href="/admin/leads">
          <Button variant="outline" size="sm">
            Back to Leads
          </Button>
        </Link>
      </div>

      <LeadDetailClient
        lead={{
          id: lead.id,
          patientRef: `PAT-${lead.patientId.slice(0, 8).toUpperCase()}`,
          specialization: lead.specialization,
          locationCity: lead.locationCity,
          locationState: lead.locationState,
          countryCode: lead.countryCode,
          consultationMode: lead.consultationMode,
          enquiryDescription: lead.enquiryDescription,
          leadSource: lead.leadSource,
          status: lead.status,
          priority: lead.priority,
          createdAt: lead.createdAt,
          qualifiedAt: lead.qualifiedAt,
          closedAt: lead.closedAt,
        }}
        consents={lead.consents}
        assignments={lead.assignments.map((a) => ({
          id: a.id,
          providerType: a.providerType,
          providerName:
            a.providerType === 'DOCTOR'
              ? a.doctor?.user.fullName ?? 'Doctor'
              : a.hospital?.displayName ?? 'Hospital',
          status: a.status,
          matchScore: a.matchScore,
          assignedAt: a.assignedAt,
          acceptedAt: a.acceptedAt,
          rejectedAt: a.rejectedAt,
          rejectionReason: a.rejectionReason,
        }))}
        history={lead.history}
        canQualify={canQualify}
        canAssign={canAssign}
        canRevealContact={canRevealContact}
      />
    </div>
  );
}
