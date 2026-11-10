'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Phone,
  Play,
  Plus,
  Stethoscope,
  Trash2,
  UserRound,
  Video,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest, downloadFile } from '@/lib/api';
import type { AppointmentDetail } from '@/types';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { ErrorState } from '@/components/shared/error-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn, formatCurrency, formatDate, formatDateTime, formatTime, titleCase } from '@/lib/utils';

interface MedicineDraft {
  medicineName: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

const emptyMedicine = (): MedicineDraft => ({
  medicineName: '',
  dosage: '',
  frequency: '',
  duration: '',
  instructions: '',
});

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}

export default function DoctorAppointmentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const queryClient = useQueryClient();
  const [prescriptionOpen, setPrescriptionOpen] = useState(false);
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [medicines, setMedicines] = useState<MedicineDraft[]>([emptyMedicine()]);

  const query = useQuery({
    queryKey: ['appointment', id],
    queryFn: () => apiRequest<AppointmentDetail>(`/appointments/${id}`),
    enabled: Boolean(id),
  });
  const appointment = query.data;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['appointment', id] });
    void queryClient.invalidateQueries({ queryKey: ['doctor', 'appointments'] });
    void queryClient.invalidateQueries({ queryKey: ['doctor', 'dashboard'] });
  };

  const updateStatus = useMutation({
    mutationFn: (next: string) => apiRequest(`/appointments/${id}/status`, { method: 'PATCH', body: { status: next } }),
    onSuccess: () => {
      toast.success('Appointment status updated');
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update status'),
  });

  const cancel = useMutation({
    mutationFn: () =>
      apiRequest(`/appointments/${id}/cancel`, {
        method: 'POST',
        body: { reason: 'Cancelled by doctor' },
      }),
    onSuccess: () => {
      toast.success('Appointment cancelled');
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to cancel appointment'),
  });

  const createPrescription = useMutation({
    mutationFn: () =>
      apiRequest('/prescriptions', {
        method: 'POST',
        body: {
          appointmentId: id,
          diagnosis,
          notes: notes || undefined,
          followUpDate: followUpDate || null,
          items: medicines.map((item) => ({
            medicineName: item.medicineName,
            dosage: item.dosage,
            frequency: item.frequency,
            duration: item.duration,
            instructions: item.instructions || undefined,
          })),
        },
      }),
    onSuccess: () => {
      toast.success('Prescription issued');
      setPrescriptionOpen(false);
      setDiagnosis('');
      setNotes('');
      setFollowUpDate('');
      setMedicines([emptyMedicine()]);
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to create prescription'),
  });

  const medicinesValid = medicines.every(
    (item) => item.medicineName.trim() && item.dosage.trim() && item.frequency.trim() && item.duration.trim(),
  );

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  if (query.isError || !appointment) {
    return (
      <div>
        <ErrorState
          title="Appointment not found"
          description="This appointment is not available or is not assigned to you."
          onRetry={() => void query.refetch()}
        />
        <div className="mt-4 text-center">
          <Button asChild variant="outline">
            <Link href="/doctor/appointments">Back to appointments</Link>
          </Button>
        </div>
      </div>
    );
  }

  const canStart = ['confirmed', 'checked_in'].includes(appointment.status);
  const canComplete = appointment.status === 'in_progress';
  const canNoShow = ['confirmed', 'checked_in'].includes(appointment.status);
  const canPrescribe = ['confirmed', 'in_progress', 'completed'].includes(appointment.status) && !appointment.prescription;
  const canCancel = !['completed', 'cancelled', 'rejected'].includes(appointment.status);

  return (
    <div>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-slate-500">
          <Link href="/doctor/appointments">
            <ArrowLeft /> All appointments
          </Link>
        </Button>
      </div>

      <PageHeader
        title="Consultation"
        description={`${appointment.appointmentNumber} · ${appointment.patient.name}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {canStart && (
              <Button variant="teal" loading={updateStatus.isPending} onClick={() => updateStatus.mutate('in_progress')}>
                <Play /> Start consultation
              </Button>
            )}
            {canComplete && (
              <Button loading={updateStatus.isPending} onClick={() => updateStatus.mutate('completed')}>
                <CheckCircle2 /> Complete
              </Button>
            )}
            {canPrescribe && (
              <Button variant="outline" onClick={() => setPrescriptionOpen(true)}>
                <FileText /> Write prescription
              </Button>
            )}
            {canNoShow && (
              <ConfirmDialog
                title="Mark as no-show?"
                description="The patient did not attend the appointment. The slot will remain recorded with a no-show status."
                confirmLabel="Mark no-show"
                onConfirm={async () => {
                  await updateStatus.mutateAsync('no_show');
                }}
                trigger={
                  <Button variant="outline">
                    <XCircle /> No show
                  </Button>
                }
              />
            )}
            <Button
              variant="outline"
              onClick={() =>
                void downloadFile(`/appointments/${appointment.id}/invoice`, `MediBook-Invoice-${appointment.appointmentNumber}.pdf`).catch(
                  (error) => toast.error(error instanceof Error ? error.message : 'Unable to download invoice'),
                )
              }
            >
              <Download /> Invoice
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
                    {appointment.appointmentType === 'online' ? <Video className="h-6 w-6" /> : <UserRound className="h-6 w-6" />}
                  </span>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{appointment.patient.name}</h2>
                    <p className="text-sm text-slate-500">
                      {appointment.patient.gender ? titleCase(appointment.patient.gender) : 'Patient'}
                      {appointment.patient.dateOfBirth ? ` · DOB ${formatDate(appointment.patient.dateOfBirth)}` : ''}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={appointment.status} />
                      <StatusBadge status={appointment.paymentStatus} kind="payment" />
                    </div>
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-3 text-right">
                  <p className="text-xs text-slate-500">Fee</p>
                  <p className="text-xl font-bold text-slate-900">{formatCurrency(appointment.consultationFee)}</p>
                </div>
              </div>

              <Separator className="my-5" />

              <div className="grid gap-x-8 sm:grid-cols-2">
                <div>
                  <InfoRow label="Date" value={formatDate(appointment.startsAt, { weekday: 'short' })} />
                  <InfoRow label="Time" value={`${formatTime(appointment.startsAt)} – ${formatTime(appointment.endsAt)} IST`} />
                  <InfoRow label="Type" value={titleCase(appointment.appointmentType)} />
                  <InfoRow label="Reference" value={appointment.appointmentNumber} />
                </div>
                <div>
                  <InfoRow label="Phone" value={appointment.patient.phone ?? '—'} />
                  <InfoRow label="Email" value={appointment.patient.email} />
                  <InfoRow label="Clinic" value={appointment.clinic?.name ?? 'Online'} />
                  <InfoRow label="Reason" value={appointment.reason || 'Not specified'} />
                </div>
              </div>

              {appointment.cancellationReason && (
                <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-800">
                  <p className="font-semibold">Cancellation reason</p>
                  <p className="mt-0.5">{appointment.cancellationReason}</p>
                </div>
              )}

              {appointment.prescription && (
                <div className="mt-4 flex flex-col gap-2 rounded-xl border border-teal-100 bg-teal-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-sm text-teal-900">
                    <FileText className="h-4 w-4" />
                    Prescription {appointment.prescription.number} issued
                  </div>
                  <Button asChild size="sm" variant="outline" className="bg-white">
                    <Link href={`/doctor/prescriptions/${appointment.prescription.id}`}>View prescription</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status history</CardTitle>
            </CardHeader>
            <CardContent>
              {appointment.history.length ? (
                <ol className="relative space-y-5 border-l border-slate-200 pl-5">
                  {appointment.history.map((entry, index) => (
                    <li key={entry.id} className="relative">
                      <span
                        className={cn(
                          'absolute -left-[27px] top-1 h-3.5 w-3.5 rounded-full ring-4 ring-white',
                          index === 0 ? 'bg-blue-600' : 'bg-slate-300',
                        )}
                      />
                      <p className="text-sm font-semibold text-slate-800">
                        {entry.fromStatus ? `${titleCase(entry.fromStatus)} → ` : ''}
                        {titleCase(entry.toStatus)}
                      </p>
                      {entry.note && <p className="mt-0.5 text-xs text-slate-500">{entry.note}</p>}
                      <p className="mt-1 text-[11px] text-slate-400">
                        {formatDateTime(entry.createdAt)}
                        {entry.changedByName ? ` · ${entry.changedByName}` : ''}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-slate-500">No status changes recorded.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href={`/doctor/patients/${appointment.patient.id}`}>
                  <UserRound /> View patient record
                </Link>
              </Button>
              {appointment.patient.phone && (
                <Button asChild variant="outline" className="w-full justify-start">
                  <a href={`tel:${appointment.patient.phone}`}>
                    <Phone /> Call patient
                  </a>
                </Button>
              )}
              {canPrescribe && (
                <Button variant="outline" className="w-full justify-start" onClick={() => setPrescriptionOpen(true)}>
                  <FileText /> Write prescription
                </Button>
              )}
              {canCancel && (
                <ConfirmDialog
                  title="Cancel this appointment?"
                  description="The patient will be notified and the slot will be released."
                  confirmLabel="Cancel appointment"
                  destructive
                  onConfirm={async () => {
                    await cancel.mutateAsync();
                  }}
                  trigger={
                    <Button variant="outline" className="w-full justify-start text-rose-600">
                      <XCircle /> Cancel appointment
                    </Button>
                  }
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <InfoRow label="Status" value={<StatusBadge status={appointment.paymentStatus} kind="payment" />} />
              <InfoRow label="Fee" value={formatCurrency(appointment.consultationFee)} />
              <InfoRow label="Provider" value={appointment.payment?.provider ? titleCase(appointment.payment.provider) : '—'} />
              <InfoRow label="Paid at" value={appointment.payment?.paidAt ? formatDateTime(appointment.payment.paidAt) : '—'} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-blue-600" /> Consultation flow
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs leading-relaxed text-slate-500">
              <p>1. Check the patient in when they arrive.</p>
              <p>2. Start the consultation when you are ready.</p>
              <p>3. Complete the visit and issue a prescription.</p>
              <p>4. Payment status is updated automatically for online payments.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={prescriptionOpen} onOpenChange={setPrescriptionOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Write prescription</DialogTitle>
            <DialogDescription>
              Issuing a prescription completes an in-progress consultation and notifies the patient.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
            <div>
              <Label htmlFor="diagnosis">Diagnosis</Label>
              <Textarea
                id="diagnosis"
                className="mt-2"
                rows={2}
                value={diagnosis}
                onChange={(event) => setDiagnosis(event.target.value)}
                placeholder="Primary diagnosis and findings"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Medicines</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setMedicines((current) => [...current, emptyMedicine()])}
                >
                  <Plus /> Add medicine
                </Button>
              </div>
              {medicines.map((medicine, index) => (
                <div key={index} className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Medicine {index + 1}</p>
                    {medicines.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-rose-600"
                        onClick={() => setMedicines((current) => current.filter((_, i) => i !== index))}
                        aria-label={`Remove medicine ${index + 1}`}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      placeholder="Medicine name"
                      value={medicine.medicineName}
                      onChange={(event) =>
                        setMedicines((current) =>
                          current.map((item, i) => (i === index ? { ...item, medicineName: event.target.value } : item)),
                        )
                      }
                    />
                    <Input
                      placeholder="Dosage (e.g. 500 mg)"
                      value={medicine.dosage}
                      onChange={(event) =>
                        setMedicines((current) =>
                          current.map((item, i) => (i === index ? { ...item, dosage: event.target.value } : item)),
                        )
                      }
                    />
                    <Input
                      placeholder="Frequency (e.g. twice daily)"
                      value={medicine.frequency}
                      onChange={(event) =>
                        setMedicines((current) =>
                          current.map((item, i) => (i === index ? { ...item, frequency: event.target.value } : item)),
                        )
                      }
                    />
                    <Input
                      placeholder="Duration (e.g. 5 days)"
                      value={medicine.duration}
                      onChange={(event) =>
                        setMedicines((current) =>
                          current.map((item, i) => (i === index ? { ...item, duration: event.target.value } : item)),
                        )
                      }
                    />
                    <Input
                      className="sm:col-span-2"
                      placeholder="Instructions (optional)"
                      value={medicine.instructions}
                      onChange={(event) =>
                        setMedicines((current) =>
                          current.map((item, i) => (i === index ? { ...item, instructions: event.target.value } : item)),
                        )
                      }
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="notes">Notes for patient</Label>
                <Textarea
                  id="notes"
                  className="mt-2"
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Advice, diet, tests to follow up"
                />
              </div>
              <div>
                <Label htmlFor="followUp">Follow-up date (optional)</Label>
                <Input
                  id="followUp"
                  type="date"
                  className="mt-2"
                  value={followUpDate}
                  onChange={(event) => setFollowUpDate(event.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrescriptionOpen(false)}>Cancel</Button>
            <Button
              disabled={diagnosis.trim().length < 3 || !medicinesValid}
              loading={createPrescription.isPending}
              onClick={() => createPrescription.mutate()}
            >
              <Stethoscope /> Issue prescription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
