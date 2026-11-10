'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarDays,
  CreditCard,
  Download,
  FileText,
  Loader2,
  RotateCcw,
  Star,
  Stethoscope,
  Video,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest, downloadFile } from '@/lib/api';
import type { AppointmentDetail, PaymentOrder, Slot } from '@/types';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { payForOrder } from '@/lib/payments';
import { cn, formatCurrency, formatDate, formatDateTime, formatTime, nextDaysIst, titleCase } from '@/lib/utils';

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}

export default function PatientAppointmentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const queryClient = useQueryClient();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const [selectedDate, setSelectedDate] = useState(nextDaysIst(10)[0]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [rescheduleReason, setRescheduleReason] = useState('');

  const query = useQuery({
    queryKey: ['appointment', id],
    queryFn: () => apiRequest<AppointmentDetail>(`/appointments/${id}`),
    enabled: Boolean(id),
  });
  const appointment = query.data;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['appointment', id] });
    void queryClient.invalidateQueries({ queryKey: ['patient', 'appointments'] });
    void queryClient.invalidateQueries({ queryKey: ['patient', 'dashboard'] });
  };

  const slotsQuery = useQuery({
    queryKey: ['reschedule-slots', appointment?.doctor.id, selectedDate, appointment?.appointmentType],
    queryFn: () =>
      apiRequest<{ date: string; timezone: string; slots: Slot[] }>(`/doctors/${appointment!.doctor.id}/slots`, {
        query: { date: selectedDate, type: appointment!.appointmentType },
      }),
    enabled: Boolean(rescheduleOpen && appointment?.doctor.id && selectedDate),
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/appointments/${id}/cancel`, { method: 'POST', body: { reason: cancelReason } }),
    onSuccess: () => {
      toast.success('Appointment cancelled');
      setCancelOpen(false);
      setCancelReason('');
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to cancel'),
  });

  const rescheduleMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/appointments/${id}/reschedule`, {
        method: 'PATCH',
        body: { startsAt: selectedSlot?.startsAt, reason: rescheduleReason || undefined },
      }),
    onSuccess: () => {
      toast.success('Appointment rescheduled');
      setRescheduleOpen(false);
      setSelectedSlot(null);
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to reschedule'),
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/appointments/${id}/review`, { method: 'POST', body: { rating, comment: comment || undefined } }),
    onSuccess: () => {
      toast.success('Thank you for your feedback');
      setReviewOpen(false);
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to submit review'),
  });

  async function handlePay() {
    setPayBusy(true);
    try {
      const order = await apiRequest<PaymentOrder>('/payments/orders', {
        method: 'POST',
        body: { appointmentId: id },
      });
      await payForOrder(order);
      toast.success('Payment successful. Appointment confirmed.');
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to complete payment');
    } finally {
      setPayBusy(false);
    }
  }

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
        <PageHeader title="Appointment details" />
        <ErrorState
          title="Appointment not found"
          description="This appointment may have been removed, or you do not have access to it."
          onRetry={() => void query.refetch()}
        />
        <div className="mt-4 text-center">
          <Button asChild variant="outline">
            <Link href="/patient/appointments">Back to appointments</Link>
          </Button>
        </div>
      </div>
    );
  }

  const canCancel = ['pending', 'confirmed', 'checked_in'].includes(appointment.status);
  const canReschedule = appointment.status === 'confirmed' && new Date(appointment.startsAt).getTime() > Date.now();
  const canPay = appointment.paymentStatus === 'pending' && !['cancelled', 'rejected', 'completed'].includes(appointment.status);
  const canReview = appointment.status === 'completed' && !appointment.review;

  return (
    <div>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-slate-500">
          <Link href="/patient/appointments">
            <ArrowLeft /> All appointments
          </Link>
        </Button>
      </div>

      <PageHeader
        title="Appointment details"
        description={`Reference ${appointment.appointmentNumber}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {canPay && (
              <Button onClick={handlePay} loading={payBusy}>
                <CreditCard /> Pay {formatCurrency(appointment.consultationFee)}
              </Button>
            )}
            {canReschedule && (
              <Button variant="outline" onClick={() => setRescheduleOpen(true)}>
                <RotateCcw /> Reschedule
              </Button>
            )}
            {canCancel && (
              <Button variant="outline" className="text-rose-600" onClick={() => setCancelOpen(true)}>
                <XCircle /> Cancel
              </Button>
            )}
            {canReview && (
              <Button variant="teal" onClick={() => setReviewOpen(true)}>
                <Star /> Rate consultation
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                    {appointment.appointmentType === 'online' ? <Video className="h-6 w-6" /> : <Stethoscope className="h-6 w-6" />}
                  </span>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Dr. {appointment.doctor.name}</h2>
                    <p className="text-sm text-slate-500">
                      {appointment.doctor.specialty ?? 'Consultation'} · {appointment.doctor.qualification}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <StatusBadge status={appointment.status} />
                      <StatusBadge status={appointment.paymentStatus} kind="payment" />
                    </div>
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-3 text-right">
                  <p className="text-xs text-slate-500">Consultation fee</p>
                  <p className="text-xl font-bold text-slate-900">{formatCurrency(appointment.consultationFee)}</p>
                </div>
              </div>

              <Separator className="my-5" />

              <div className="grid gap-x-8 sm:grid-cols-2">
                <div>
                  <DetailRow label="Date" value={formatDate(appointment.startsAt, { weekday: 'short' })} />
                  <DetailRow label="Time" value={`${formatTime(appointment.startsAt)} – ${formatTime(appointment.endsAt)} IST`} />
                  <DetailRow label="Type" value={titleCase(appointment.appointmentType)} />
                  <DetailRow label="Booked on" value={formatDateTime(appointment.createdAt)} />
                </div>
                <div>
                  <DetailRow
                    label="Location"
                    value={
                      appointment.clinic ? (
                        <span>
                          {appointment.clinic.name}
                          <span className="block text-xs font-normal text-slate-500">
                            {appointment.clinic.address}, {appointment.clinic.city}
                          </span>
                        </span>
                      ) : (
                        'Online video consultation'
                      )
                    }
                  />
                  <DetailRow label="Reason" value={appointment.reason || 'Not specified'} />
                  <DetailRow label="Checked in" value={appointment.checkedInAt ? formatDateTime(appointment.checkedInAt) : '—'} />
                  <DetailRow label="Completed" value={appointment.completedAt ? formatDateTime(appointment.completedAt) : '—'} />
                </div>
              </div>

              {appointment.cancellationReason && (
                <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-800">
                  <p className="font-semibold">Cancellation reason</p>
                  <p className="mt-0.5">{appointment.cancellationReason}</p>
                </div>
              )}

              {appointment.doctorNotes && (
                <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                  <p className="font-semibold">Doctor&apos;s notes</p>
                  <p className="mt-1 whitespace-pre-wrap leading-relaxed">{appointment.doctorNotes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Visit timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {appointment.history.length ? (
                <ol className="relative space-y-5 border-l border-slate-200 pl-5">
                  {appointment.history.map((entry, index) => (
                    <li key={entry.id} className="relative">
                      <span
                        className={cn(
                          'absolute -left-[27px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-4 ring-white',
                          index === 0 ? 'bg-blue-600' : 'bg-slate-300',
                        )}
                      />
                      <p className="text-sm font-semibold text-slate-800">
                        {entry.fromStatus ? `${titleCase(entry.fromStatus)} → ` : ''}
                        {titleCase(entry.toStatus)}
                      </p>
                      {entry.note && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{entry.note}</p>}
                      <p className="mt-1 text-[11px] text-slate-400">
                        {formatDateTime(entry.createdAt)}
                        {entry.changedByName ? ` · ${entry.changedByName}` : ''}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-slate-500">No status changes recorded yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {appointment.paymentDetail ? (
                <>
                  <DetailRow label="Status" value={<StatusBadge status={appointment.paymentDetail.status} kind="payment" />} />
                  <DetailRow label="Provider" value={titleCase(appointment.paymentDetail.provider)} />
                  <DetailRow label="Amount" value={formatCurrency(appointment.paymentDetail.amount)} />
                  <DetailRow label="Paid at" value={appointment.paymentDetail.paidAt ? formatDateTime(appointment.paymentDetail.paidAt) : '—'} />
                  {appointment.paymentDetail.providerPaymentId && (
                    <DetailRow
                      label="Payment ID"
                      value={<span className="break-all font-mono text-[11px]">{appointment.paymentDetail.providerPaymentId}</span>}
                    />
                  )}
                  {appointment.paymentDetail.refunds.length > 0 && (
                    <div className="mt-2 rounded-xl bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Refunds</p>
                      {appointment.paymentDetail.refunds.map((refund) => (
                        <div key={refund.id} className="mt-2 text-xs text-slate-600">
                          <span className="font-semibold text-slate-800">{formatCurrency(refund.amount)}</span> · {titleCase(refund.status)}
                          <p className="text-slate-400">{refund.reason}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-500">
                  {appointment.paymentStatus === 'pending' ? 'Payment is due for this appointment.' : 'No payment recorded.'}
                </p>
              )}
              {canPay && (
                <Button className="mt-3 w-full" onClick={handlePay} loading={payBusy}>
                  <CreditCard /> Pay now
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full"
                onClick={() =>
                  void downloadFile(`/appointments/${appointment.id}/invoice`, `MediBook-Invoice-${appointment.appointmentNumber}.pdf`).catch(
                    (error) => toast.error(error instanceof Error ? error.message : 'Unable to download invoice'),
                  )
                }
              >
                <Download /> Download invoice
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {appointment.prescription ? (
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href={`/patient/prescriptions/${appointment.prescription.id}`}>
                    <FileText /> Prescription {appointment.prescription.number}
                  </Link>
                </Button>
              ) : (
                <p className="text-sm text-slate-500">A prescription will appear here after your consultation.</p>
              )}
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/patient/records">
                  <FileText /> My health records
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Need help?</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              <p>If something looks wrong with this appointment, our support team can help.</p>
              <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                <Link href="/patient/support">Contact support</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel appointment</DialogTitle>
            <DialogDescription>
              This will free the slot for other patients. Refund eligibility depends on the cancellation policy and how
              close the appointment is.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="cancel-reason">Reason for cancellation</Label>
            <Textarea
              id="cancel-reason"
              className="mt-2"
              rows={3}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Please tell us why you need to cancel"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Keep appointment</Button>
            <Button
              variant="destructive"
              disabled={cancelReason.trim().length < 3}
              loading={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              Cancel appointment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reschedule appointment</DialogTitle>
            <DialogDescription>Choose a new available slot with Dr. {appointment.doctor.name}.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {nextDaysIst(10).map((date) => (
              <button
                key={date}
                type="button"
                onClick={() => {
                  setSelectedDate(date);
                  setSelectedSlot(null);
                }}
                className={cn(
                  'flex min-w-[64px] flex-col items-center rounded-xl border px-3 py-2 text-xs transition',
                  selectedDate === date
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300',
                )}
              >
                <span className="text-[10px] font-medium uppercase opacity-80">
                  {formatDate(date, { weekday: 'short' })}
                </span>
                <span className="mt-0.5 text-base font-bold">{new Date(`${date}T12:00:00+05:30`).getDate()}</span>
              </button>
            ))}
          </div>
          {slotsQuery.isLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading available slots…
            </div>
          ) : slotsQuery.data?.slots.length ? (
            <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {slotsQuery.data.slots.map((slot) => (
                <button
                  key={slot.startsAt}
                  type="button"
                  onClick={() => setSelectedSlot(slot)}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-xs font-medium transition',
                    selectedSlot?.startsAt === slot.startsAt
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:border-blue-300',
                  )}
                >
                  {slot.time}
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">
              No slots available on this day. Try another date.
            </p>
          )}
          <div>
            <Label htmlFor="reschedule-reason">Reason (optional)</Label>
            <Textarea
              id="reschedule-reason"
              className="mt-2"
              rows={2}
              value={rescheduleReason}
              onChange={(event) => setRescheduleReason(event.target.value)}
              placeholder="Let the clinic know about the change"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleOpen(false)}>Cancel</Button>
            <Button disabled={!selectedSlot} loading={rescheduleMutation.isPending} onClick={() => rescheduleMutation.mutate()}>
              Confirm new time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How was your consultation?</DialogTitle>
            <DialogDescription>Your feedback helps other patients choose the right doctor.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center gap-2 py-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                aria-label={`${value} star${value > 1 ? 's' : ''}`}
                className="rounded-lg p-1 transition hover:scale-110"
              >
                <Star
                  className={cn('h-8 w-8', value <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300')}
                />
              </button>
            ))}
          </div>
          <Textarea
            rows={3}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Share a few words about your experience (optional)"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Not now</Button>
            <Button loading={reviewMutation.isPending} onClick={() => reviewMutation.mutate()}>
              Submit review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
