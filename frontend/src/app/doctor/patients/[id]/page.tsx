'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, FileText, FolderHeart, Pill, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest, toAbsoluteApiUrl } from '@/lib/api';
import type { PatientClinicalView } from '@/types';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDate, formatDateTime, titleCase } from '@/lib/utils';

export default function DoctorPatientDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [tab, setTab] = useState('visits');

  const query = useQuery({
    queryKey: ['doctor', 'patient', id],
    queryFn: () => apiRequest<PatientClinicalView>(`/doctor-portal/patients/${id}`),
    enabled: Boolean(id),
  });

  async function downloadRecord(recordId: string) {
    try {
      const result = await apiRequest<{ url: string }>(`/medical-records/${recordId}/download`);
      window.open(toAbsoluteApiUrl(result.url), '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to download record');
    }
  }

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-52 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div>
        <ErrorState
          title="Patient record unavailable"
          description="You can only view records of patients you have consulted."
          onRetry={() => void query.refetch()}
        />
        <div className="mt-4 text-center">
          <Button asChild variant="outline">
            <Link href="/doctor/patients">Back to patients</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { patient, history, records, prescriptions } = query.data;

  return (
    <div>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-slate-500">
          <Link href="/doctor/patients">
            <ArrowLeft /> All patients
          </Link>
        </Button>
      </div>

      <PageHeader title={patient.fullName} description="Clinical record — visible because you have consulted this patient." />

      <Card className="mb-5">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-50 text-lg font-bold text-teal-700">
                {patient.fullName
                  .split(' ')
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join('')}
              </span>
              <div>
                <p className="text-lg font-bold text-slate-900">{patient.fullName}</p>
                <p className="text-sm text-slate-500">
                  {patient.gender ? titleCase(patient.gender) : 'Gender not recorded'}
                  {patient.dateOfBirth ? ` · DOB ${formatDate(patient.dateOfBirth)}` : ''}
                </p>
                <p className="text-xs text-slate-400">
                  {patient.phone ?? 'No phone'} · {patient.email}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-1">
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Blood group</p>
                <p className="font-semibold text-slate-800">{patient.bloodGroup ?? '—'}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Emergency contact</p>
                <p className="font-semibold text-slate-800">{patient.emergencyContact ?? '—'}</p>
              </div>
            </div>
          </div>
          {patient.address && (
            <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{patient.address}</p>
          )}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="visits">Visits ({history.length})</TabsTrigger>
          <TabsTrigger value="prescriptions">Prescriptions ({prescriptions.length})</TabsTrigger>
          <TabsTrigger value="records">Records ({records.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="visits">
          <Card>
            <CardHeader>
              <CardTitle>Consultation history</CardTitle>
            </CardHeader>
            <CardContent>
              {history.length ? (
                <div className="space-y-2">
                  {history.map((visit) => (
                    <Link
                      key={visit.id}
                      href={`/doctor/appointments/${visit.id}`}
                      className="flex flex-col gap-2 rounded-xl border border-slate-100 p-3.5 transition hover:border-teal-200 hover:bg-teal-50/20 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{visit.reason || 'Consultation'}</p>
                        <p className="text-xs text-slate-500">
                          {formatDateTime(visit.startsAt)} · {visit.appointmentNumber}
                        </p>
                        <p className="text-xs text-slate-400">{visit.specialty ?? 'General'}</p>
                      </div>
                      <StatusBadge status={visit.status} />
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState icon={UserRound} title="No visits yet" description="Consultation history will appear here." className="border-0 bg-transparent" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prescriptions">
          <Card>
            <CardHeader>
              <CardTitle>Prescriptions</CardTitle>
            </CardHeader>
            <CardContent>
              {prescriptions.length ? (
                <div className="space-y-2">
                  {prescriptions.map((prescription) => (
                    <Link
                      key={prescription.id}
                      href={`/doctor/prescriptions/${prescription.id}`}
                      className="flex items-center justify-between rounded-xl border border-slate-100 p-3.5 transition hover:border-teal-200 hover:bg-teal-50/20"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{prescription.diagnosis}</p>
                        <p className="text-xs text-slate-500">
                          {prescription.prescriptionNumber} · {formatDate(prescription.createdAt)}
                        </p>
                      </div>
                      <Pill className="h-4 w-4 text-teal-500" />
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Pill} title="No prescriptions" description="Prescriptions you issue will appear here." className="border-0 bg-transparent" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="records">
          <Card>
            <CardHeader>
              <CardTitle>Medical records</CardTitle>
            </CardHeader>
            <CardContent>
              {records.length ? (
                <div className="space-y-2">
                  {records.map((record) => (
                    <div
                      key={record.id}
                      className="flex flex-col gap-2 rounded-xl border border-slate-100 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-start gap-2.5">
                        <FileText className="mt-0.5 h-4 w-4 text-blue-500" />
                        <div>
                          <p className="text-sm font-medium text-slate-800">{record.fileName}</p>
                          <p className="text-xs text-slate-500">
                            {titleCase(record.recordType)} · {formatDate(record.createdAt)}
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => void downloadRecord(record.id)}>
                        <Download /> Download
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={FolderHeart} title="No records uploaded" description="The patient has not uploaded any records yet." className="border-0 bg-transparent" />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
