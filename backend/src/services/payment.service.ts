import { many, one, query, withTransaction } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { Errors, AppError } from '../utils/errors';
import { randomToken } from '../utils/crypto';
import { formatIstHuman } from '../utils/time';
import * as paymentRepo from '../repositories/payment.repo';
import * as appointmentRepo from '../repositories/appointment.repo';
import { AuthUser } from '../types/express';
import * as razorpay from '../integrations/razorpay/client';
import { notify } from './notification.service';
import { appointmentDedupe } from './notification.service';
import { writeAudit } from './audit.service';

function assertAppointmentAccess(appointment: appointmentRepo.AppointmentRow, actor: AuthUser): void {
  if (actor.role === 'patient' && appointment.patient_profile_id !== actor.id) {
    throw Errors.forbidden();
  }
  if (actor.role === 'doctor' && appointment.doctor_id !== actor.doctorId) {
    throw Errors.forbidden();
  }
  if (!['patient', 'doctor', 'admin', 'receptionist'].includes(actor.role)) {
    throw Errors.forbidden();
  }
}

export async function createOrderForAppointment(appointmentId: string, actor: AuthUser) {
  const appointment = await appointmentRepo.findAppointment(appointmentId);
  if (!appointment) throw Errors.notFound('Appointment');
  assertAppointmentAccess(appointment, actor);

  if (new Date(appointment.starts_at) <= new Date()) {
    throw Errors.validation('Cannot pay for a past appointment');
  }
  if (appointment.payment_status === 'paid') throw Errors.conflict('This appointment is already paid', 'ALREADY_PAID');
  if (!['pending', 'confirmed'].includes(appointment.status)) {
    throw Errors.conflict('This appointment can no longer be paid', 'INVALID_STATE');
  }

  let payment = await paymentRepo.findPaymentByAppointment(appointment.id);
  if (!payment) throw Errors.notFound('Payment');
  if (payment.payment_provider === 'pay_at_clinic') {
    throw Errors.conflict('This appointment is set to be paid at the clinic', 'PAY_AT_CLINIC');
  }
  if (payment.payment_provider === 'manual') {
    throw Errors.conflict('This payment is handled manually', 'MANUAL_PAYMENT');
  }

  let orderId = payment.provider_order_id;
  if (!orderId) {
    if (env.PAYMENTS_MODE === 'razorpay') {
      const order = await razorpay.createOrder({
        amountPaise: Math.round(Number(payment.amount) * 100),
        receipt: appointment.appointment_number,
        notes: {
          appointmentId: appointment.id,
          appointmentNumber: appointment.appointment_number,
          doctorId: appointment.doctor_id,
        },
      });
      orderId = order.id;
    } else {
      orderId = `order_dev_${randomToken(8)}`;
    }
    await query('update payments set provider_order_id = $1 where id = $2', [orderId, payment.id]);
    payment = { ...payment, provider_order_id: orderId };
  }

  return {
    paymentId: payment.id,
    appointmentId: appointment.id,
    appointmentNumber: appointment.appointment_number,
    orderId,
    amount: Number(payment.amount),
    amountPaise: Math.round(Number(payment.amount) * 100),
    currency: payment.currency,
    keyId: env.RAZORPAY_KEY_ID || 'rzp_test_medibook_dev',
    mode: env.PAYMENTS_MODE,
    prefill: {
      name: appointment.patient_name,
      email: appointment.patient_email,
      contact: appointment.patient_phone ?? '',
    },
    description: `Consultation with Dr. ${appointment.doctor_name}`,
  };
}

interface CaptureResult {
  alreadyProcessed: boolean;
  needsRefund: boolean;
  appointmentId: string;
  appointmentNumber: string;
  patientProfileId: string;
  doctorProfileId: string;
}

export async function capturePayment(input: {
  paymentId: string;
  providerPaymentId: string;
  signature?: string | null;
}): Promise<CaptureResult> {
  const result = await withTransaction(async (client) => {
    const paymentResult = await client.query<{
      id: string;
      appointment_id: string;
      patient_id: string;
      amount: string;
      status: string;
      payment_provider: string;
    }>('select id, appointment_id, patient_id, amount, status, payment_provider from payments where id = $1 for update', [
      input.paymentId,
    ]);
    const payment = paymentResult.rows[0];
    if (!payment) throw Errors.notFound('Payment');
    if (payment.status === 'captured') {
      const appointment = await client.query<{ appointment_number: string }>(
        'select appointment_number from appointments where id = $1',
        [payment.appointment_id],
      );
      return {
        alreadyProcessed: true,
        needsRefund: false,
        appointmentId: payment.appointment_id,
        appointmentNumber: appointment.rows[0]?.appointment_number ?? '',
        patientProfileId: '',
        doctorProfileId: '',
      } satisfies CaptureResult;
    }

    const appointmentResult = await client.query<{
      id: string;
      appointment_number: string;
      status: string;
      starts_at: Date;
      patient_profile_id: string;
      doctor_profile_id: string;
      patient_name: string;
      doctor_name: string;
    }>(
      `select a.id, a.appointment_number, a.status, a.starts_at,
              pp.id as patient_profile_id, dp.id as doctor_profile_id,
              pp.full_name as patient_name, dp.full_name as doctor_name
         from appointments a
         join patients pt on pt.id = a.patient_id
         join profiles pp on pp.id = pt.profile_id
         join doctors d on d.id = a.doctor_id
         join profiles dp on dp.id = d.profile_id
        where a.id = $1
        for update of a`,
      [payment.appointment_id],
    );
    const appointment = appointmentResult.rows[0];
    if (!appointment) throw Errors.notFound('Appointment');

    await client.query(
      `update payments set status = 'captured', paid_at = now(), provider_payment_id = $1,
              provider_signature = $2, failure_reason = null where id = $3`,
      [input.providerPaymentId, input.signature ?? null, payment.id],
    );

    const inactive = ['cancelled', 'rejected'].includes(appointment.status);
    if (!inactive) {
      const wasPending = appointment.status === 'pending';
      await client.query(
        `update appointments
            set payment_status = 'paid',
                status = case when status = 'pending' then 'confirmed'::appointment_status else status end
          where id = $1`,
        [appointment.id],
      );
      if (wasPending) {
        await client.query(
          `insert into appointment_status_history (appointment_id, from_status, to_status, note)
           values ($1, 'pending', 'confirmed', 'Payment captured successfully')`,
          [appointment.id],
        );
      }
    }

    return {
      alreadyProcessed: false,
      needsRefund: inactive,
      appointmentId: appointment.id,
      appointmentNumber: appointment.appointment_number,
      patientProfileId: appointment.patient_profile_id,
      doctorProfileId: appointment.doctor_profile_id,
    } satisfies CaptureResult;
  });

  if (result.alreadyProcessed) return result;

  if (result.needsRefund) {
    await processRefund({
      paymentId: input.paymentId,
      reason: 'Appointment was no longer active when payment was captured',
      actorId: null,
      auto: true,
    }).catch((error) => logger.error({ err: error }, 'Automatic refund after late payment failed'));
    return result;
  }

  const appointment = await appointmentRepo.findAppointment(result.appointmentId);
  const when = appointment ? formatIstHuman(new Date(appointment.starts_at)) : '';

  await notify({
    profileId: result.patientProfileId,
    appointmentId: result.appointmentId,
    type: 'payment_confirmed',
    title: 'Payment successful — appointment confirmed',
    body: `Your payment was received and appointment ${result.appointmentNumber} is confirmed for ${when}.`,
    email: true,
    sms: true,
    dedupeKey: appointmentDedupe('payment_confirmed', result.appointmentId, result.patientProfileId),
  });
  await notify({
    profileId: result.doctorProfileId,
    appointmentId: result.appointmentId,
    type: 'appointment_confirmed',
    title: 'New confirmed appointment',
    body: `Appointment ${result.appointmentNumber} with ${appointment?.patient_name ?? 'a patient'} is confirmed for ${when}.`,
    email: true,
    dedupeKey: appointmentDedupe('appointment_confirmed', result.appointmentId, result.doctorProfileId),
  });

  await writeAudit({
    actorId: null,
    action: 'payment.captured',
    entityType: 'payment',
    entityId: input.paymentId,
    metadata: { providerPaymentId: input.providerPaymentId },
  });

  return result;
}

export async function verifyPayment(
  input: { orderId: string; paymentId: string; signature: string },
  actor: AuthUser,
) {
  const payment = await paymentRepo.findPaymentByOrderId(input.orderId);
  if (!payment) throw Errors.notFound('Payment order');

  const appointment = await appointmentRepo.findAppointment(payment.appointment_id);
  if (!appointment) throw Errors.notFound('Appointment');
  assertAppointmentAccess(appointment, actor);

  if (payment.status === 'captured') {
    return { status: 'captured', appointmentId: appointment.id, appointmentNumber: appointment.appointment_number };
  }

  if (env.PAYMENTS_MODE !== 'razorpay') {
    throw new AppError(400, 'INVALID_PAYMENT_MODE', 'Online signature verification is disabled in development mode');
  }

  if (!razorpay.verifyPaymentSignature(input.orderId, input.paymentId, input.signature)) {
    throw new AppError(400, 'INVALID_SIGNATURE', 'Payment signature verification failed');
  }

  // Defence in depth: confirm the payment with Razorpay rather than trusting
  // the checkout response.
  const providerPayment = await razorpay.fetchPayment(input.paymentId);
  if (providerPayment.order_id !== input.orderId) {
    throw new AppError(400, 'PAYMENT_MISMATCH', 'Payment does not belong to this order');
  }
  if (providerPayment.status !== 'captured' && providerPayment.status !== 'authorized') {
    throw new AppError(400, 'PAYMENT_NOT_CAPTURED', 'Payment has not been captured yet');
  }
  if (providerPayment.amount !== Math.round(Number(payment.amount) * 100)) {
    throw new AppError(400, 'AMOUNT_MISMATCH', 'Payment amount does not match the order');
  }

  await capturePayment({
    paymentId: payment.id,
    providerPaymentId: input.paymentId,
    signature: input.signature,
  });

  return { status: 'captured', appointmentId: appointment.id, appointmentNumber: appointment.appointment_number };
}

/** Development-only simulated checkout. Refuses to run outside dev environments. */
export async function devConfirmPayment(input: { orderId: string }, actor: AuthUser) {
  if (env.PAYMENTS_MODE !== 'dev' || env.isProd) {
    throw new AppError(404, 'NOT_FOUND', 'Not found');
  }
  const payment = await paymentRepo.findPaymentByOrderId(input.orderId);
  if (!payment) throw Errors.notFound('Payment order');
  const appointment = await appointmentRepo.findAppointment(payment.appointment_id);
  if (!appointment) throw Errors.notFound('Appointment');
  assertAppointmentAccess(appointment, actor);

  const providerPaymentId = `pay_dev_${randomToken(8)}`;
  await capturePayment({ paymentId: payment.id, providerPaymentId, signature: 'dev_simulated' });
  return { status: 'captured', appointmentId: appointment.id, appointmentNumber: appointment.appointment_number };
}

export async function handleWebhook(rawBody: string, signature: string | undefined) {
  if (!razorpay.verifyWebhookSignature(rawBody, signature)) {
    throw new AppError(400, 'INVALID_WEBHOOK_SIGNATURE', 'Webhook signature verification failed');
  }

  const payload = JSON.parse(rawBody) as {
    event: string;
    payload?: Record<string, { entity?: Record<string, unknown> }>;
  };

  const event = payload.event;
  if (event === 'payment.captured' || event === 'order.paid') {
    const entity = payload.payload?.payment?.entity;
    if (!entity) return { handled: false };
    const orderId = String(entity.order_id ?? '');
    const paymentId = String(entity.id ?? '');
    const amount = Number(entity.amount ?? 0);
    if (!orderId || !paymentId) return { handled: false };

    const payment = await paymentRepo.findPaymentByOrderId(orderId);
    if (!payment) {
      logger.warn({ orderId }, 'Webhook for unknown payment order');
      return { handled: false };
    }
    if (amount !== Math.round(Number(payment.amount) * 100)) {
      logger.warn({ orderId, amount }, 'Webhook amount mismatch');
      return { handled: false };
    }
    await capturePayment({ paymentId: payment.id, providerPaymentId: paymentId, signature: signature });
    return { handled: true };
  }

  if (event === 'payment.failed') {
    const entity = payload.payload?.payment?.entity;
    const orderId = String(entity?.order_id ?? '');
    if (orderId) {
      await query(
        `update payments set status = 'failed', failure_reason = $2
          where provider_order_id = $1 and status <> 'captured'`,
        [orderId, String((entity?.error_description as string) ?? 'Payment failed')],
      );
    }
    return { handled: true };
  }

  if (event === 'refund.processed' || event === 'refund.created') {
    const entity = payload.payload?.refund?.entity;
    const providerRefundId = String(entity?.id ?? '');
    if (providerRefundId) {
      await query(
        `update refunds set status = 'processed', processed_at = coalesce(processed_at, now())
          where provider_refund_id = $1`,
        [providerRefundId],
      );
    }
    return { handled: true };
  }

  return { handled: false };
}

export async function processRefund(input: {
  paymentId: string;
  amount?: number;
  reason: string;
  actorId: string | null;
  auto?: boolean;
}) {
  const payment = await paymentRepo.findPaymentById(input.paymentId);
  if (!payment) throw Errors.notFound('Payment');
  if (payment.status === 'refunded') {
    return { refundId: null, status: 'already_refunded' as const };
  }
  if (!['captured', 'partially_refunded'].includes(payment.status)) {
    throw Errors.conflict('Only captured payments can be refunded', 'NOT_REFUNDABLE');
  }
  if (payment.payment_provider === 'pay_at_clinic') {
    throw Errors.conflict('Pay-at-clinic payments are collected directly at the clinic', 'NOT_REFUNDABLE');
  }

  const alreadyRefunded = await paymentRepo.refundedAmount(payment.id);
  const refundable = Math.round((Number(payment.amount) - alreadyRefunded) * 100) / 100;
  if (refundable <= 0) throw Errors.conflict('This payment has already been fully refunded', 'ALREADY_REFUNDED');

  const amount = input.amount ?? refundable;
  if (amount <= 0 || amount > refundable) {
    throw Errors.validation(`Refund amount must be between ₹1 and ₹${refundable}`);
  }

  const refundRow = await one<{ id: string }>(
    `insert into refunds (payment_id, appointment_id, amount, reason, status, requested_by)
     values ($1, $2, $3, $4, 'requested', $5) returning id`,
    [payment.id, payment.appointment_id, amount, input.reason, input.actorId],
  );
  if (!refundRow) throw Errors.internal('Unable to create refund');

  let status: 'processed' | 'requested' | 'failed' = 'requested';
  let providerRefundId: string | null = null;
  let failureMessage: string | null = null;

  if (env.PAYMENTS_MODE === 'razorpay') {
    try {
      const refund = await razorpay.createRefund({
        paymentId: payment.provider_payment_id!,
        amountPaise: Math.round(amount * 100),
        notes: { reason: input.reason, appointmentId: payment.appointment_id },
      });
      providerRefundId = refund.id;
      status = 'processed';
    } catch (error) {
      status = 'failed';
      failureMessage = error instanceof Error ? error.message : 'Refund failed';
      logger.error({ err: error, paymentId: payment.id }, 'Razorpay refund failed');
      if (!input.auto) throw new AppError(502, 'REFUND_FAILED', 'Refund could not be processed. Please retry.');
    }
  } else {
    providerRefundId = `rfnd_dev_${randomToken(8)}`;
    status = 'processed';
  }

  await withTransaction(async (client) => {
    await client.query(
      `update refunds set status = $1, provider_refund_id = $2, processed_at = $3,
              processed_by = $4
        where id = $5`,
      [status, providerRefundId, status === 'processed' ? new Date() : null, input.actorId, refundRow.id],
    );

    if (status === 'processed') {
      const fullyRefunded = Math.abs(amount - refundable) < 0.01;
      const paymentStatus = fullyRefunded ? 'refunded' : 'partially_refunded';
      await client.query('update payments set status = $1 where id = $2', [paymentStatus, payment.id]);
      await client.query('update appointments set payment_status = $1 where id = $2', [
        paymentStatus,
        payment.appointment_id,
      ]);
    }
  });

  const appointment = await appointmentRepo.findAppointment(payment.appointment_id);
  if (appointment && status === 'processed') {
    await notify({
      profileId: appointment.patient_profile_id,
      appointmentId: appointment.id,
      type: 'refund_processed',
      title: 'Refund processed',
      body: `A refund of ₹${amount.toFixed(2)} for appointment ${appointment.appointment_number} has been processed. It should reflect in your account within 5 working days.`,
      email: true,
      dedupeKey: appointmentDedupe('refund_processed', appointment.id, appointment.patient_profile_id, String(amount)),
    });
  }

  await writeAudit({
    actorId: input.actorId,
    action: 'payment.refunded',
    entityType: 'refund',
    entityId: refundRow.id,
    metadata: { paymentId: payment.id, amount, status, failureMessage },
  });

  return { refundId: refundRow.id, status, providerRefundId, amount };
}

export async function collectPayAtClinic(appointmentId: string, actor: AuthUser) {
  const appointment = await appointmentRepo.findAppointment(appointmentId);
  if (!appointment) throw Errors.notFound('Appointment');
  const payment = await paymentRepo.findPaymentByAppointment(appointmentId);
  if (!payment) throw Errors.notFound('Payment');
  if (payment.payment_provider !== 'pay_at_clinic') {
    throw Errors.conflict('This appointment is not configured for pay at clinic', 'INVALID_PAYMENT_METHOD');
  }
  if (payment.status === 'captured') return { status: 'captured' };

  await capturePayment({
    paymentId: payment.id,
    providerPaymentId: `cash_${randomToken(6)}`,
    signature: `collected_by_${actor.id}`,
  });
  return { status: 'captured' };
}

export async function getAppointmentPayment(appointmentId: string) {
  const payment = await paymentRepo.findPaymentByAppointment(appointmentId);
  if (!payment) return null;
  const refunds = await many<{
    id: string;
    amount: string;
    reason: string;
    status: string;
    created_at: Date;
  }>('select id, amount, reason, status, created_at from refunds where payment_id = $1 order by created_at desc', [
    payment.id,
  ]);
  return {
    id: payment.id,
    amount: Number(payment.amount),
    currency: payment.currency,
    provider: payment.payment_provider,
    status: payment.status,
    providerOrderId: payment.provider_order_id,
    providerPaymentId: payment.provider_payment_id,
    paidAt: payment.paid_at,
    refunds: refunds.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      reason: r.reason,
      status: r.status,
      createdAt: r.created_at,
    })),
  };
}
