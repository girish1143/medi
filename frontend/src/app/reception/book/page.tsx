'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  MapPin,
  Search,
  Stethoscope,
  UserRound,
  Users,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiMeta, apiRequest } from '@/lib/api';
import type {
  AppointmentSummary,
  DoctorDetail,
  DoctorSummary,
  PatientListItem,
  PaymentOrder,
  Slot,
} from '@/types';
import { payForOrder } from '@/lib/payments';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  formatCurrency,
  formatDate,
  formatDayLabel,
  formatDayNumber,
  formatMonth,
  formatTime,
  formatWeekday,
  nextDaysIst,
} from '@/lib/utils';
import { cn } from '@/lib/utils';

function ReceptionBookingContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const initialPatientId = searchParams.get('patientId') ?? '';

  const [patientId, setPatientId] = useState(initialPatientId);
  const [patientSearch, setPatientSearch] = useState('');
  const [debouncedPatient, setDebouncedPatient] = useState('');
  const [doctorSearch, setDoctorSearch] = useState('');
  const [debouncedDoctor, setDebouncedDoctor] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [appointmentType, setAppointmentType] = useState<'in_clinic' | 'online'>('in_clinic');
  const [clinicId, setClinicId] = useState('');
  const [selectedDate, setSelectedDate] = useState(nextDaysIst(1)[0]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [reason, setReason] = useState('');
  const [paymentOption, setPaymentOption] = useState<'pay_at_clinic' | 'online'>('pay_at_clinic');
  const [success, setSuccess] = useState<AppointmentSummary | null>(null);

  const days = useMemo(() => nextDaysIst(10), []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedPatient(patientSearch), 300);
    return () => clearTimeout(timer);
  }, [patientSearch]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedDoctor(doctorSearch), 300);
    return () => clearTimeout(timer);
  }, [doctorSearch]);

  const selectedPatientQuery = useQuery({
    queryKey: ['reception', 'patient', patientId],
    queryFn: () => apiMeta<PatientListItem[]>('/reception/patients', { query: { id: patientId, limit: 1 } }),
    enabled: Boolean(patientId),
  });

  const patientResults = useQuery({
    queryKey: ['reception', 'patient-search', debouncedPatient],
    queryFn: () => apiMeta<PatientListItem[]>('/reception/patients', { query: { search: debouncedPatient, limit: 8 } }),
    enabled: debouncedPatient.trim().length >= 2,
    placeholderData: (previous) => previous,
  });

  const doctors = useQuery({
    queryKey: ['reception', 'doctor-search', debouncedDoctor],
    queryFn: () =>
      apiMeta<DoctorSummary[]>('/doctors', {
        query: { q: debouncedDoctor || undefined, limit: 12, sort: 'rating' },
      }),
    placeholderData: (previous) => previous,
  });

  const doctorDetail = useQuery({
    queryKey: ['reception', 'doctor', doctorId],
    queryFn: () => apiRequest<DoctorDetail>(`/doctors/${doctorId}`),
    enabled: Boolean(doctorId),
  });

  const slots = useQuery({
    queryKey: ['reception', 'slots', doctorId, selectedDate],
    queryFn: () =>
      apiRequest<{ date: string; timezone: string; slots: Slot[] }>(`/doctors/${doctorId}/slots`, {
        query: { date: selectedDate },
      }),
    enabled: Boolean(doctorId && selectedDate),
  });

  const doctor = doctorDetail.data;
  const selectedPatient = selectedPatientQuery.data?.data?.[0] ?? null;
  const selectedClinic = doctor?.clinics.find((item) => item.id === clinicId) ?? doctor?.clinics[0];
  const fee =
    appointmentType === 'online'
      ? doctor?.onlineConsultationFee ?? 0
      : selectedClinic?.consultationFee ?? doctor?.consultationFee ?? 0;

  useEffect(() => {
    if (doctor?.clinics[0] && !clinicId) setClinicId(doctor.clinics[0].id);
  }, [doctor, clinicId]);

  const createBooking = useMutation({
    mutationFn: () =>
      apiRequest<{ appointment: AppointmentSummary; paymentInit: PaymentOrder | null; paymentError: string | null }>(
        '/appointments',
        {
          method: 'POST',
          body: {
            patientId,
            doctorId,
            clinicId: appointmentType === 'in_clinic' ? selectedClinic?.id : undefined,
            startsAt: selectedSlot?.startsAt,
            appointmentType,
            reason: reason.trim() || undefined,
            paymentOption,
          },
        },
      ),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['reception', 'appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['reception', 'dashboard'] });
      if (paymentOption === 'online') {
        try {
          let order = result.paymentInit;
          if (!order) {
            order = await apiRequest<PaymentOrder>('/payments/orders', {
              method: 'POST',
              body: { appointmentId: result.appointment.id },
            });
          }
          await payForOrder(order);
          setSuccess({ ...result.appointment, paymentStatus: 'paid' });
          toast.success('Appointment booked and paid');
        } catch (error) {
          setSuccess(result.appointment);
          toast.error(
            error instanceof Error
              ? `Appointment booked, but payment was not completed. ${error.message}`
              : 'Appointment booked, but payment was not completed. Collect payment from the appointments page.',
          );
        }
        return;
      }
      setSuccess(result.appointment);
      toast.success('Appointment booked. Collect payment at the desk.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to create the booking'),
  });

  function resetBooking() {
    setSuccess(null);
    setDoctorId('');
    setSelectedSlot(null);
    setReason('');
    setPatientId('');
    setPatientSearch('');
    setDebouncedPatient('');
    setPaymentOption('pay_at_clinic');
  }

  if (success) {
    return (
      <div>
        <PageHeader title="Book appointment" description="Create a booking for a patient at the front desk." />
        <Card className="mx-auto max-w-xl text-center">
          <CardContent className="p-8">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </span>
            <h2 className="mt-5 text-xl font-bold text-slate-900">Appointment booked</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              <span className="font-semibold text-slate-700">{success.appointmentNumber}</span> for{' '}
              {success.patient.name} with Dr. {success.doctor.name} on {formatDate(success.startsAt)} at{' '}
              {formatTime(success.startsAt)}.
            </p>
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-left text-sm">
              <div className="flex justify-between gap-3 py-1"><span className="text-slate-500">Status</span><span className="font-medium capitalize text-slate-900">{success.status.replace(/_/g, ' ')}</span></div>
              <div className="flex justify-between gap-3 py-1"><span className="text-slate-500">Payment</span><span className="font-medium text-slate-900">{success.paymentStatus === 'paid' ? 'Paid' : 'Collect at desk'}</span></div>
              <div className="flex justify-between gap-3 py-1"><span className="text-slate-500">Fee</span><span className="font-medium text-slate-900">{formatCurrency(success.consultationFee)}</span></div>
            </div>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button asChild className="flex-1">
                <Link href="/reception/appointments?view=today">Today’s appointments</Link>
              </Button>
              <Button variant="outline" className="flex-1" onClick={resetBooking}>Book another</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canSubmit = Boolean(patientId && doctorId && selectedSlot) && !createBooking.isPending;

  return (
    <div>
      <PageHeader
        title="Book appointment"
        description="Create a booking on behalf of a patient, then collect payment at the desk if needed."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4 text-blue-600" /> 1. Select a patient</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedPatient ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{selectedPatient.fullName}</p>
                    <p className="truncate text-xs text-slate-500">{selectedPatient.phone ?? 'No phone'} · {selectedPatient.email}</p>
                    <p className="text-[11px] text-slate-400">{selectedPatient.appointments} appointment{selectedPatient.appointments === 1 ? '' : 's'}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => { setPatientId(''); setPatientSearch(''); }}>
                    Change
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={patientSearch}
                      onChange={(event) => setPatientSearch(event.target.value)}
                      placeholder="Search patient by name, phone or email"
                      className="pl-9"
                      aria-label="Search patients"
                    />
                  </div>
                  {debouncedPatient.trim().length >= 2 ? (
                    patientResults.isLoading ? (
                      <div className="space-y-2"><Skeleton className="h-14 rounded-xl" /><Skeleton className="h-14 rounded-xl" /></div>
                    ) : patientResults.data?.data.length ? (
                      <div className="max-h-64 space-y-2 overflow-y-auto">
                        {patientResults.data.data.map((patient) => (
                          <button
                            key={patient.id}
                            type="button"
                            onClick={() => { setPatientId(patient.id); setPatientSearch(''); setDebouncedPatient(''); }}
                            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/40"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600"><UserRound className="h-4 w-4" /></span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-800">{patient.fullName}</p>
                              <p className="truncate text-xs text-slate-500">{patient.phone ?? patient.email} · {patient.appointments} visit{patient.appointments === 1 ? '' : 's'}</p>
                            </div>
                            <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-slate-300" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
                        No patient found. <Link href="/reception/patients" className="font-semibold text-blue-600 hover:underline">Register a walk-in patient</Link> first.
                      </div>
                    )
                  ) : (
                    <p className="text-xs text-slate-500">Enter at least two characters to search the patient directory.</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Stethoscope className="h-4 w-4 text-teal-600" /> 2. Choose a doctor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={doctorSearch}
                  onChange={(event) => setDoctorSearch(event.target.value)}
                  placeholder="Search verified doctors by name or specialty"
                  className="pl-9"
                  aria-label="Search doctors"
                />
              </div>

              {doctor ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50/50 p-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-teal-700"><Stethoscope className="h-5 w-5" /></span>
                    <div>
                      <p className="flex items-center gap-1 text-sm font-semibold text-slate-900">{doctor.fullName} <BadgeCheck className="h-4 w-4 text-emerald-500" /></p>
                      <p className="text-xs text-slate-500">{doctor.primarySpecialty ?? doctor.qualification} · {formatCurrency(doctor.consultationFee)}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => { setDoctorId(''); setSelectedSlot(null); setClinicId(''); }}>
                    Change
                  </Button>
                </div>
              ) : doctors.isLoading ? (
                <div className="grid gap-2 sm:grid-cols-2"><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-16 rounded-xl" /></div>
              ) : doctors.data?.data.length ? (
                <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
                  {doctors.data.data.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { setDoctorId(item.id); setSelectedSlot(null); setClinicId(''); }}
                      className="rounded-xl border border-slate-200 p-3 text-left transition hover:border-teal-300 hover:bg-teal-50/40"
                    >
                      <p className="text-sm font-semibold text-slate-800">{item.fullName}</p>
                      <p className="text-xs text-slate-500">{item.primarySpecialty ?? item.qualification}</p>
                      <p className="mt-1 text-xs font-medium text-slate-700">{formatCurrency(item.consultationFee)} · {item.experienceYears} yrs</p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No verified doctors match your search.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-blue-600" /> 3. Pick a slot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!doctor ? (
                <p className="text-sm text-slate-500">Select a doctor to see available slots.</p>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => { setAppointmentType('in_clinic'); setSelectedSlot(null); }}
                      className={cn('rounded-xl border p-3 text-left transition', appointmentType === 'in_clinic' ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300')}
                    >
                      <Stethoscope className="h-4 w-4 text-blue-600" />
                      <p className="mt-1 text-sm font-semibold text-slate-900">In-clinic</p>
                      <p className="text-xs text-slate-500">{formatCurrency(selectedClinic?.consultationFee ?? doctor.consultationFee)}</p>
                    </button>
                    <button
                      type="button"
                      disabled={doctor.onlineConsultationFee === null}
                      onClick={() => { setAppointmentType('online'); setSelectedSlot(null); }}
                      className={cn('rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50', appointmentType === 'online' ? 'border-teal-500 bg-teal-50/60 ring-2 ring-teal-100' : 'border-slate-200 hover:border-slate-300')}
                    >
                      <Video className="h-4 w-4 text-teal-600" />
                      <p className="mt-1 text-sm font-semibold text-slate-900">Online</p>
                      <p className="text-xs text-slate-500">{doctor.onlineConsultationFee === null ? 'Not available' : formatCurrency(doctor.onlineConsultationFee)}</p>
                    </button>
                  </div>

                  {appointmentType === 'in_clinic' && doctor.clinics.length > 1 && (
                    <div className="space-y-2">
                      <Label>Clinic</Label>
                      {doctor.clinics.map((clinic) => (
                        <button
                          key={clinic.id}
                          type="button"
                          onClick={() => setClinicId(clinic.id)}
                          className={cn('flex w-full items-start gap-3 rounded-xl border p-3 text-left transition', selectedClinic?.id === clinic.id ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200 hover:border-slate-300')}
                        >
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                          <div>
                            <p className="text-sm font-medium text-slate-900">{clinic.name}</p>
                            <p className="text-xs text-slate-500">{clinic.address}, {clinic.city}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {days.map((day) => {
                      const active = selectedDate === day;
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => { setSelectedDate(day); setSelectedSlot(null); }}
                          className={cn('flex min-w-[68px] flex-col items-center rounded-xl border px-3 py-2 text-center transition', active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300')}
                        >
                          <span className="text-[10px] font-medium uppercase">{formatWeekday(day)}</span>
                          <span className="mt-0.5 text-base font-bold">{formatDayNumber(day)}</span>
                          <span className="text-[10px]">{formatMonth(day)}</span>
                        </button>
                      );
                    })}
                  </div>

                  {slots.isLoading ? (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-10 rounded-lg" />)}</div>
                  ) : slots.data?.slots.length ? (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {slots.data.slots.map((slot) => (
                        <button
                          key={slot.startsAt}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={cn('rounded-lg border px-2 py-2.5 text-sm font-medium transition', selectedSlot?.startsAt === slot.startsAt ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-400 hover:text-blue-600')}
                        >
                          {slot.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">
                      No slots on this date. Try another day.
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-blue-600" /> 4. Payment and notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="reception-reason">Reason for visit (optional)</Label>
                <Textarea
                  id="reception-reason"
                  className="mt-2"
                  rows={3}
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Symptoms or reason shared by the patient"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPaymentOption('pay_at_clinic')}
                  className={cn('rounded-xl border p-3 text-left transition', paymentOption === 'pay_at_clinic' ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-100' : 'border-slate-200')}
                >
                  <Stethoscope className="h-4 w-4 text-teal-600" />
                  <p className="mt-1 text-sm font-semibold text-slate-900">Pay at clinic</p>
                  <p className="text-xs text-slate-500">Collect at the front desk</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentOption('online')}
                  className={cn('rounded-xl border p-3 text-left transition', paymentOption === 'online' ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-100' : 'border-slate-200')}
                >
                  <CreditCard className="h-4 w-4 text-blue-600" />
                  <p className="mt-1 text-sm font-semibold text-slate-900">Pay online</p>
                  <p className="text-xs text-slate-500">Open secure checkout now</p>
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        <aside>
          <Card className="sticky top-24">
            <CardHeader><CardTitle>Booking summary</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl bg-slate-50 p-4 text-sm">
                <div className="flex justify-between gap-3 py-1"><span className="text-slate-500">Patient</span><span className="max-w-[170px] text-right font-medium text-slate-900">{selectedPatient?.fullName ?? 'Not selected'}</span></div>
                <div className="flex justify-between gap-3 py-1"><span className="text-slate-500">Doctor</span><span className="max-w-[170px] text-right font-medium text-slate-900">{doctor?.fullName ?? 'Not selected'}</span></div>
                <div className="flex justify-between gap-3 py-1"><span className="text-slate-500">Consultation</span><span className="font-medium capitalize text-slate-900">{appointmentType.replace('_', ' ')}</span></div>
                <div className="flex justify-between gap-3 py-1"><span className="text-slate-500">Date</span><span className="font-medium text-slate-900">{selectedSlot ? formatDate(selectedSlot.startsAt) : formatDate(selectedDate)}</span></div>
                <div className="flex justify-between gap-3 py-1"><span className="text-slate-500">Time</span><span className="font-medium text-slate-900">{selectedSlot ? formatTime(selectedSlot.startsAt) : 'Not selected'}</span></div>
                {appointmentType === 'in_clinic' && selectedClinic && (
                  <div className="flex justify-between gap-3 py-1"><span className="text-slate-500">Clinic</span><span className="max-w-[170px] text-right font-medium text-slate-900">{selectedClinic.name}</span></div>
                )}
                <div className="mt-2 flex justify-between gap-3 border-t border-slate-200 pt-2"><span className="font-medium text-slate-700">Total</span><span className="text-lg font-bold text-slate-900">{formatCurrency(fee)}</span></div>
              </div>

              {!initialPatientId && !patientId && (
                <Alert>
                  <Users className="h-4 w-4" />
                  <AlertTitle>Select a patient first</AlertTitle>
                  <AlertDescription>Search above or register a walk-in from the patients page.</AlertDescription>
                </Alert>
              )}

              <Button size="lg" className="w-full" disabled={!canSubmit} loading={createBooking.isPending} onClick={() => createBooking.mutate()}>
                {paymentOption === 'online' ? 'Book and take payment' : 'Confirm booking'}
                <ArrowRight />
              </Button>
              {!selectedSlot && <p className="text-center text-xs text-slate-400">Select a time slot to continue</p>}
              <p className="text-center text-[11px] leading-relaxed text-slate-400">
                The patient receives a confirmation notification. Unpaid online bookings expire after 30 minutes.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

export default function ReceptionBookPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
      <ReceptionBookingContent />
    </Suspense>
  );
}
