'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Info,
  Loader2,
  LockKeyhole,
  MapPin,
  ShieldCheck,
  Stethoscope,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest, ApiError } from '@/lib/api';
import type { AppointmentSummary, DoctorDetail, PatientProfile, PaymentOrder, Slot } from '@/types';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useCurrentUser } from '@/hooks/use-auth';
import { formatCurrency, formatDate, formatDayLabel, formatDayNumber, formatMonth, formatTime, formatWeekday } from '@/lib/utils';

function todayIst(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function nextDays(count = 10): string[] {
  return Array.from({ length: count }).map((_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
  });
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

type Stage = 'details' | 'payment' | 'success';

export default function BookingPage() {
  const params = useParams<{ doctorId: string }>();
  const doctorId = Array.isArray(params.doctorId) ? params.doctorId[0] : params.doctorId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useCurrentUser();

  const days = useMemo(() => nextDays(10), []);
  const [selectedDate, setSelectedDate] = useState(days[0] ?? todayIst());
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [appointmentType, setAppointmentType] = useState<'in_clinic' | 'online'>('in_clinic');
  const [clinicId, setClinicId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [paymentOption, setPaymentOption] = useState<'online' | 'pay_at_clinic'>('online');
  const [stage, setStage] = useState<Stage>('details');
  const [appointment, setAppointment] = useState<AppointmentSummary | null>(null);
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [paymentBusy, setPaymentBusy] = useState(false);

  const doctorQuery = useQuery({
    queryKey: ['doctor', doctorId],
    queryFn: () => apiRequest<DoctorDetail>(`/doctors/${doctorId}`),
    enabled: Boolean(doctorId),
  });

  const profileQuery = useQuery({
    queryKey: ['patient', 'profile'],
    queryFn: () => apiRequest<PatientProfile>('/patients/me'),
    enabled: user.data?.role === 'patient',
    retry: false,
  });

  const slotsQuery = useQuery({
    queryKey: ['slots', doctorId, selectedDate],
    queryFn: () => apiRequest<{ date: string; timezone: string; slots: Slot[] }>(
      `/doctors/${doctorId}/slots`,
      { query: { date: selectedDate } },
    ),
    enabled: Boolean(doctorId && selectedDate),
  });

  const doctor = doctorQuery.data;
  const selectedClinic = doctor?.clinics.find((clinic) => clinic.id === clinicId) ?? doctor?.clinics[0];
  const fee = appointmentType === 'online' ? doctor?.onlineConsultationFee ?? 0 : selectedClinic?.consultationFee ?? doctor?.consultationFee ?? 0;

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
            doctorId,
            clinicId: appointmentType === 'in_clinic' ? selectedClinic?.id : undefined,
            startsAt: selectedSlot?.startsAt,
            appointmentType,
            reason: reason || undefined,
            paymentOption,
          },
        },
      ),
    onSuccess: async (result) => {
      setAppointment(result.appointment);
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      if (paymentOption === 'pay_at_clinic') {
        setStage('success');
        toast.success('Appointment booked. Please pay at the clinic.');
        return;
      }
      if (result.paymentInit) {
        setOrder(result.paymentInit);
        setStage('payment');
      } else {
        try {
          const created = await apiRequest<PaymentOrder>('/payments/orders', {
            method: 'POST',
            body: { appointmentId: result.appointment.id },
          });
          setOrder(created);
          setStage('payment');
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Unable to start payment');
        }
      }
    },
    onError: (error) => {
      if (error instanceof ApiError) toast.error(error.message);
      else toast.error('Unable to create the booking. Please try again.');
    },
  });

  async function handlePayOnline() {
    if (!order || !appointment) return;
    if (order.mode === 'dev') {
      setPaymentBusy(true);
      try {
        await apiRequest('/payments/dev-confirm', { method: 'POST', body: { orderId: order.orderId } });
        toast.success('Payment successful. Appointment confirmed.');
        await queryClient.invalidateQueries({ queryKey: ['appointments'] });
        setStage('success');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Payment failed');
      } finally {
        setPaymentBusy(false);
      }
      return;
    }

    const loaded = await loadRazorpay();
    if (!loaded || !window.Razorpay) {
      toast.error('Unable to load the secure payment window. Please try again.');
      return;
    }
    setPaymentBusy(true);
    const razorpay = new window.Razorpay({
      key: order.keyId,
      amount: order.amountPaise,
      currency: order.currency,
      name: 'MediBook',
      description: order.description,
      order_id: order.orderId,
      prefill: order.prefill,
      theme: { color: '#1d4ed8' },
      handler: async (response: { razorpay_payment_id?: string; razorpay_order_id?: string; razorpay_signature?: string }) => {
        try {
          await apiRequest('/payments/verify', {
            method: 'POST',
            body: {
              orderId: response.razorpay_order_id ?? order.orderId,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            },
          });
          toast.success('Payment successful. Appointment confirmed.');
          await queryClient.invalidateQueries({ queryKey: ['appointments'] });
          setStage('success');
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'We could not verify the payment');
        } finally {
          setPaymentBusy(false);
        }
      },
      modal: {
        ondismiss: () => setPaymentBusy(false),
      },
    });
    razorpay.on('payment.failed', () => {
      toast.error('Payment failed. You can try again from your appointments page.');
      setPaymentBusy(false);
    });
    razorpay.open();
  }

  if (doctorQuery.isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex-1 surface-gradient">
          <div className="container-page py-10">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="mt-6 h-[520px] rounded-2xl" />
          </div>
        </main>
      </div>
    );
  }

  if (doctorQuery.isError || !doctor) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex flex-1 items-center justify-center px-4 py-16">
          <div className="max-w-md text-center">
            <h1 className="text-xl font-semibold text-slate-900">Doctor not available</h1>
            <p className="mt-2 text-sm text-slate-500">This profile may have been removed.</p>
            <Button asChild className="mt-5">
              <Link href="/doctors">Browse doctors</Link>
            </Button>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (stage === 'success' && appointment) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex flex-1 items-center justify-center surface-gradient px-4 py-16">
          <Card className="w-full max-w-lg text-center">
            <CardContent className="p-8">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </span>
              <h1 className="mt-5 text-2xl font-bold text-slate-900">Appointment booked</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Your appointment <span className="font-semibold text-slate-700">{appointment.appointmentNumber}</span> with{' '}
                {doctor.fullName} is scheduled for {formatDate(appointment.startsAt)} at {formatTime(appointment.startsAt)}.
              </p>
              <div className="mt-5 rounded-xl bg-slate-50 p-4 text-left text-sm">
                <div className="flex justify-between gap-3 py-1">
                  <span className="text-slate-500">Status</span>
                  <span className="font-medium text-slate-900">{appointment.status.replace('_', ' ')}</span>
                </div>
                <div className="flex justify-between gap-3 py-1">
                  <span className="text-slate-500">Payment</span>
                  <span className="font-medium text-slate-900">
                    {appointment.paymentStatus === 'paid' ? 'Paid online' : 'Pay at clinic'}
                  </span>
                </div>
                <div className="flex justify-between gap-3 py-1">
                  <span className="text-slate-500">Consultation fee</span>
                  <span className="font-medium text-slate-900">{formatCurrency(appointment.consultationFee)}</span>
                </div>
              </div>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <Button asChild className="flex-1">
                  <Link href={`/patient/appointments/${appointment.id}`}>View appointment</Link>
                </Button>
                <Button asChild variant="outline" className="flex-1">
                  <Link href="/patient">Go to dashboard</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (stage === 'payment' && appointment && order) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex flex-1 items-center justify-center surface-gradient px-4 py-12">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LockKeyhole className="h-5 w-5 text-blue-600" /> Secure your appointment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Slot held temporarily</AlertTitle>
                <AlertDescription>
                  We are holding this slot for 30 minutes. Complete payment to confirm appointment{' '}
                  {appointment.appointmentNumber}.
                </AlertDescription>
              </Alert>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Doctor</span>
                  <span className="font-medium text-slate-900">{doctor.fullName}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-slate-500">Date & time</span>
                  <span className="font-medium text-slate-900">
                    {formatDayLabel(appointment.startsAt)}, {formatTime(appointment.startsAt)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-slate-500">Consultation</span>
                  <span className="font-medium capitalize text-slate-900">{appointment.appointmentType.replace('_', ' ')}</span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-sm font-medium text-slate-700">Amount payable</span>
                  <span className="text-xl font-bold text-slate-900">{formatCurrency(order.amount)}</span>
                </div>
              </div>

              {order.mode === 'dev' && (
                <Alert variant="warning">
                  <Info className="h-4 w-4" />
                  <AlertTitle>Development payment mode</AlertTitle>
                  <AlertDescription>
                    Razorpay is not configured locally. Use the button below to simulate a successful payment.
                  </AlertDescription>
                </Alert>
              )}

              <Button size="lg" className="w-full" onClick={handlePayOnline} loading={paymentBusy}>
                <CreditCard className="h-4 w-4" />
                {order.mode === 'dev' ? 'Simulate successful payment' : `Pay ${formatCurrency(order.amount)} securely`}
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5" /> Payments are verified server-side. MediBook never stores card details.
              </p>
            </CardContent>
          </Card>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const requiresLogin = !user.isLoading && !user.data;
  const isStaff = user.data && user.data.role !== 'patient';

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 surface-gradient">
        <div className="container-page py-8 sm:py-10">
          <Link href={`/doctors/${doctor.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-blue-600">
            <ArrowLeft className="h-4 w-4" /> Back to profile
          </Link>

          <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-5">
              <Card>
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-teal-100 text-lg font-semibold text-blue-700">
                      {doctor.fullName.replace(/^Dr\.?\s*/i, '').slice(0, 1)}
                    </span>
                    <div>
                      <p className="flex items-center gap-1.5 font-semibold text-slate-900">
                        {doctor.fullName} <BadgeCheck className="h-4 w-4 text-emerald-500" />
                      </p>
                      <p className="text-sm text-slate-500">
                        {doctor.qualification} · {doctor.primarySpecialty}
                      </p>
                    </div>
                  </div>
                  <div className="text-sm text-slate-500">
                    <p className="font-semibold text-slate-900">{formatCurrency(fee)}</p>
                    <p className="text-xs">Consultation fee</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>1. Choose consultation type</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setAppointmentType('in_clinic')}
                      className={`rounded-xl border p-4 text-left transition ${appointmentType === 'in_clinic' ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                      <Stethoscope className="h-5 w-5 text-blue-600" />
                      <p className="mt-2 text-sm font-semibold text-slate-900">In-clinic visit</p>
                      <p className="mt-1 text-xs text-slate-500">Meet the doctor at the clinic</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{formatCurrency(selectedClinic?.consultationFee ?? doctor.consultationFee)}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAppointmentType('online')}
                      disabled={doctor.onlineConsultationFee === null}
                      className={`rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${appointmentType === 'online' ? 'border-teal-500 bg-teal-50/60 ring-2 ring-teal-100' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                      <Video className="h-5 w-5 text-teal-600" />
                      <p className="mt-2 text-sm font-semibold text-slate-900">Online video</p>
                      <p className="mt-1 text-xs text-slate-500">Consult from anywhere</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {doctor.onlineConsultationFee === null ? 'Not available' : formatCurrency(doctor.onlineConsultationFee)}
                      </p>
                    </button>
                  </div>

                  {appointmentType === 'in_clinic' && doctor.clinics.length > 1 && (
                    <div>
                      <Label className="mb-2 block">Select clinic</Label>
                      <div className="space-y-2">
                        {doctor.clinics.map((clinic) => (
                          <button
                            key={clinic.id}
                            type="button"
                            onClick={() => setClinicId(clinic.id)}
                            className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${selectedClinic?.id === clinic.id ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                          >
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                            <div>
                              <p className="text-sm font-medium text-slate-900">{clinic.name}</p>
                              <p className="text-xs text-slate-500">{clinic.address}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>2. Pick a date and time</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {days.map((day) => {
                      const active = selectedDate === day;
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            setSelectedDate(day);
                            setSelectedSlot(null);
                          }}
                          className={`flex min-w-[72px] flex-col items-center rounded-xl border px-3 py-2 text-center transition ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'}`}
                        >
                          <span className="text-[11px] font-medium uppercase">{formatWeekday(day)}</span>
                          <span className="mt-0.5 text-lg font-bold">{formatDayNumber(day)}</span>
                          <span className="text-[10px]">{formatMonth(day)}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between">
                      <Label className="flex items-center gap-1.5">
                        <CalendarDays className="h-4 w-4 text-slate-400" /> Available slots on {formatDate(selectedDate)}
                      </Label>
                      {slotsQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
                    </div>
                    {slotsQuery.isLoading ? (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {Array.from({ length: 8 }).map((_, index) => (
                          <Skeleton key={index} className="h-10 rounded-lg" />
                        ))}
                      </div>
                    ) : slotsQuery.data?.slots.length ? (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {slotsQuery.data.slots.map((slot) => {
                          const active = selectedSlot?.startsAt === slot.startsAt;
                          return (
                            <button
                              key={slot.startsAt}
                              type="button"
                              onClick={() => setSelectedSlot(slot)}
                              className={`rounded-lg border px-2 py-2.5 text-sm font-medium transition ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-400 hover:text-blue-600'}`}
                            >
                              {slot.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                        No slots on this date. Try another day.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>3. Payment and details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="reason" className="mb-2 block">
                      Reason for visit <span className="font-normal text-slate-400">(optional)</span>
                    </Label>
                    <Textarea
                      id="reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Briefly describe your symptoms or reason for the consultation"
                      maxLength={500}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setPaymentOption('online')}
                      className={`rounded-xl border p-4 text-left transition ${paymentOption === 'online' ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-100' : 'border-slate-200'}`}
                    >
                      <CreditCard className="h-5 w-5 text-blue-600" />
                      <p className="mt-2 text-sm font-semibold text-slate-900">Pay online</p>
                      <p className="mt-1 text-xs text-slate-500">Instant confirmation after payment</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentOption('pay_at_clinic')}
                      className={`rounded-xl border p-4 text-left transition ${paymentOption === 'pay_at_clinic' ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-100' : 'border-slate-200'}`}
                    >
                      <Stethoscope className="h-5 w-5 text-teal-600" />
                      <p className="mt-2 text-sm font-semibold text-slate-900">Pay at clinic</p>
                      <p className="mt-1 text-xs text-slate-500">Confirm now, pay at the front desk</p>
                    </button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <aside>
              <Card className="sticky top-24">
                <CardHeader>
                  <CardTitle>Booking summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-xl bg-slate-50 p-4 text-sm">
                    <div className="flex justify-between gap-3 py-1">
                      <span className="text-slate-500">Doctor</span>
                      <span className="text-right font-medium text-slate-900">{doctor.fullName}</span>
                    </div>
                    <div className="flex justify-between gap-3 py-1">
                      <span className="text-slate-500">Consultation</span>
                      <span className="font-medium capitalize text-slate-900">{appointmentType.replace('_', ' ')}</span>
                    </div>
                    <div className="flex justify-between gap-3 py-1">
                      <span className="text-slate-500">Date</span>
                      <span className="font-medium text-slate-900">{selectedSlot ? formatDate(selectedSlot.startsAt) : formatDate(selectedDate)}</span>
                    </div>
                    <div className="flex justify-between gap-3 py-1">
                      <span className="text-slate-500">Time</span>
                      <span className="font-medium text-slate-900">{selectedSlot ? formatTime(selectedSlot.startsAt) : 'Not selected'}</span>
                    </div>
                    {appointmentType === 'in_clinic' && selectedClinic && (
                      <div className="flex justify-between gap-3 py-1">
                        <span className="text-slate-500">Clinic</span>
                        <span className="max-w-[180px] text-right font-medium text-slate-900">{selectedClinic.name}</span>
                      </div>
                    )}
                    <div className="mt-2 flex justify-between gap-3 border-t border-slate-200 pt-2">
                      <span className="font-medium text-slate-700">Total</span>
                      <span className="text-lg font-bold text-slate-900">{formatCurrency(fee)}</span>
                    </div>
                  </div>

                  {requiresLogin && (
                    <Alert>
                      <LockKeyhole className="h-4 w-4" />
                      <AlertTitle>Sign in to book</AlertTitle>
                      <AlertDescription>
                        <Link href={`/login?next=${encodeURIComponent(`/book/${doctor.id}`)}`} className="font-semibold text-blue-700 underline">
                          Sign in or create a free account
                        </Link>{' '}
                        to confirm this appointment.
                      </AlertDescription>
                    </Alert>
                  )}

                  {isStaff && (
                    <Alert variant="warning">
                      <Info className="h-4 w-4" />
                      <AlertTitle>Staff account</AlertTitle>
                      <AlertDescription>Use the reception portal to book appointments for patients.</AlertDescription>
                    </Alert>
                  )}

                  <Button
                    size="lg"
                    className="w-full"
                    disabled={!selectedSlot || requiresLogin || Boolean(isStaff) || profileQuery.isError}
                    loading={createBooking.isPending}
                    onClick={() => createBooking.mutate()}
                  >
                    {paymentOption === 'pay_at_clinic' ? 'Confirm appointment' : 'Continue to payment'}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  {!selectedSlot && <p className="text-center text-xs text-slate-400">Select a time slot to continue</p>}
                  <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
                    <ShieldCheck className="h-3.5 w-3.5" /> Your data is encrypted and protected
                  </p>
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
