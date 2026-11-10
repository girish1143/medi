import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HospitalDepartmentsManager } from '@/components/admin/HospitalDetailClient';
import { ProviderVerificationActions } from '@/components/admin/ProviderVerificationActions';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { actorHasPermission, requireAdminPageAccess } from '@/lib/auth/admin-page';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { backendServerFetch } from '@/lib/auth/server-api';

export const dynamic = 'force-dynamic';

interface HospitalDetailResponse {
  hospital: {
    id: string;
    legalName: string;
    displayName: string;
    registrationNumber: string;
    accreditationBody: string | null;
    verificationStatus: string;
    isAcceptingLeads: boolean;
    addressLine1: string;
    city: string;
    stateProvince: string;
    countryCode: string;
    user: { id: string; email: string; accountStatus: string };
    departments: Array<{
      id: string;
      name: string;
      specializationCode: string;
      specializationName: string;
      headDoctorName: string | null;
      isActive: boolean;
      isAcceptingLeads: boolean;
    }>;
    affiliatedDoctors: Array<{
      id: string;
      verificationStatus: string;
      user: { fullName: string };
    }>;
    documents: Array<{
      id: string;
      documentType: string;
      fileName: string;
      storageRef: string;
      reviewStatus: string;
      reviewedAt: string | null;
      notes: string | null;
    }>;
  };
  assignmentCounts: Array<{ status: string; _count: { _all: number } }>;
}

export default async function AdminHospitalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireAdminPageAccess(PERMISSIONS.HOSPITALS_READ);
  const { id } = await params;

  const res = await backendServerFetch<HospitalDetailResponse>(`/admin/hospitals/${id}`);
  if (!res.ok || !res.data?.hospital) notFound();

  const { hospital, assignmentCounts } = res.data;
  const canVerify = await actorHasPermission(actor, PERMISSIONS.HOSPITALS_VERIFY);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {hospital.displayName}
          </h1>
          <p className="text-xs text-slate-500">
            {hospital.legalName} &middot; {hospital.addressLine1}, {hospital.city}, {hospital.stateProvince} (
            {hospital.countryCode})
          </p>
        </div>
        <Link href="/admin/hospitals">
          <Button variant="outline" size="sm">
            Back to Hospitals
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 text-xs">
            <p className="text-slate-500">Registration &amp; Accreditation</p>
            <p className="mt-1 font-semibold">{hospital.registrationNumber}</p>
            <p className="text-slate-500">
              {hospital.accreditationBody ?? 'No accreditation body listed'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-xs">
            <p className="text-slate-500">Facility Status</p>
            <div className="mt-1.5 flex items-center gap-2">
              <Badge variant={statusBadgeVariant(hospital.user.accountStatus)}>
                {hospital.user.accountStatus}
              </Badge>
              <Badge variant={hospital.isAcceptingLeads ? 'success' : 'default'}>
                {hospital.isAcceptingLeads ? 'Accepting Leads' : 'Paused'}
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-xs">
            <p className="text-slate-500">Lead Statistics</p>
            {assignmentCounts.length === 0 ? (
              <p className="mt-1.5 text-slate-400">No leads assigned yet.</p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {assignmentCounts.map((row) => (
                  <Badge key={row.status} variant={statusBadgeVariant(row.status)}>
                    {row.status}: {row._count._all}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ProviderVerificationActions
        providerType="HOSPITAL"
        providerId={hospital.id}
        currentStatus={hospital.verificationStatus}
        canVerify={canVerify}
        documents={hospital.documents}
      />

      <HospitalDepartmentsManager
        hospitalId={hospital.id}
        departments={hospital.departments}
        canEdit={canVerify}
      />

      <Card>
        <CardHeader>
          <CardTitle>Associated Doctors</CardTitle>
        </CardHeader>
        <CardContent>
          {hospital.affiliatedDoctors.length === 0 ? (
            <p className="text-xs text-slate-500">No doctors currently affiliated with this hospital.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {hospital.affiliatedDoctors.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between py-2.5 text-xs">
                  <Link href={`/admin/doctors/${doc.id}`} className="font-medium text-teal-700 hover:underline">
                    {doc.user.fullName}
                  </Link>
                  <Badge variant={statusBadgeVariant(doc.verificationStatus)}>
                    {doc.verificationStatus}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
