import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DoctorSpecializationsManager } from '@/components/admin/DoctorDetailClient';
import { ProviderVerificationActions } from '@/components/admin/ProviderVerificationActions';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { actorHasPermission, requireAdminPageAccess } from '@/lib/auth/admin-page';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { backendServerFetch } from '@/lib/auth/server-api';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface DoctorDetailResponse {
  doctor: {
    id: string;
    medicalLicenseNumber: string;
    licensingAuthority: string;
    licenseCountryCode: string;
    licenseExpiresAt: string | null;
    verificationStatus: string;
    isAcceptingLeads: boolean;
    consultationMode: string;
    city: string;
    stateProvince: string;
    countryCode: string;
    user: { id: string; fullName: string; email: string; phone: string | null; accountStatus: string };
    primaryHospital: { id: string; displayName: string } | null;
    specializations: Array<{
      id: string;
      specializationCode: string;
      specializationName: string;
      isPrimary: boolean;
      boardCertified: boolean;
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

export default async function AdminDoctorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireAdminPageAccess(PERMISSIONS.DOCTORS_READ);
  const { id } = await params;

  const res = await backendServerFetch<DoctorDetailResponse>(`/admin/doctors/${id}`);
  if (!res.ok || !res.data?.doctor) notFound();

  const { doctor, assignmentCounts } = res.data;
  const canVerify = await actorHasPermission(actor, PERMISSIONS.DOCTORS_VERIFY);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {doctor.user.fullName}
          </h1>
          <p className="text-xs text-slate-500">
            {doctor.user.email} &middot; {doctor.city}, {doctor.stateProvince} ({doctor.countryCode})
          </p>
        </div>
        <Link href="/admin/doctors">
          <Button variant="outline" size="sm">
            Back to Doctors
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 text-xs">
            <p className="text-slate-500">Medical License</p>
            <p className="mt-1 font-semibold">{doctor.medicalLicenseNumber}</p>
            <p className="text-slate-500">{doctor.licensingAuthority} ({doctor.licenseCountryCode})</p>
            <p className="mt-1 text-slate-400">Expires: {formatDate(doctor.licenseExpiresAt)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-xs">
            <p className="text-slate-500">Profile &amp; Lead Acceptance</p>
            <div className="mt-1.5 flex items-center gap-2">
              <Badge variant={statusBadgeVariant(doctor.user.accountStatus)}>
                {doctor.user.accountStatus}
              </Badge>
              <Badge variant={doctor.isAcceptingLeads ? 'success' : 'default'}>
                {doctor.isAcceptingLeads ? 'Accepting Leads' : 'Paused'}
              </Badge>
            </div>
            <p className="mt-2 text-slate-500">Mode: {doctor.consultationMode}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-xs">
            <p className="text-slate-500">Assigned Lead Statistics</p>
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
        providerType="DOCTOR"
        providerId={doctor.id}
        currentStatus={doctor.verificationStatus}
        canVerify={canVerify}
        documents={doctor.documents}
      />

      <DoctorSpecializationsManager
        doctorId={doctor.id}
        specializations={doctor.specializations}
        canEdit={canVerify}
      />

      {doctor.primaryHospital ? (
        <Card>
          <CardHeader>
            <CardTitle>Primary Hospital Affiliation</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <Link
              href={`/admin/hospitals/${doctor.primaryHospital.id}`}
              className="font-medium text-teal-700 hover:underline"
            >
              {doctor.primaryHospital.displayName}
            </Link>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
