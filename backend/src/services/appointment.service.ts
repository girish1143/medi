import { pgAdvisoryLockKey } from '../utils/lock';
import { many, one, query, withTransaction } from '../config/database';
import { AppError, Errors, isPgError } from '../utils/errors';
import { getSettings } from '../utils/settings';
import { AuthUser } from '../types/express';
import * as appointmentRepo from '../repositories/appointment.repo';
import * as paymentRepo from '../repositories/payment.repo';
import { findDoctorDetail } from '../repositories/doctor.repo';
import * as availability from './availability.service';
import * as paymentService from './payment.service';
import { notify, appointmentDedupe } from './notification.service';
import { writeAudit } from './audit.service';
import { addMinutes, formatIstHuman, minutesBetween } from '../utils/time';
import { renderInvoicePdf } from '../utils/pdf';

export interface AppointmentDto {
  id: string;
  appointmentNumber: string;
  startsAt: string;
  endsAt: string;
  appointmentDate: string;
  appointmentType: string;
  status: string;
  consultationFee: number;
  paymentStatus: string;
  reason: string | null;
  doctorNotes: string | null;
  cancellationReason: string | null;
  createdAt: string;
  checkedInAt: string | null;
  completedAt: string | null;
  patient: {
    id: string;
    profileId: string;
    name: string;
    phone: string | null;
    email: string;
    dateOfBirth: string | null;
    gender: string | null;
  };
  doctor: {
    id: string;
    profileId: string;
    name: string;
    avatarUrl: string | null;
    qualification: string;
    specialty: string | null;
  };
  clinic: { id: string; name: string; address: string; city: string } | null;
  payment: {
    id: string;
    status: string;
    provider: string;
    providerPaymentId: string | null;
    paidAt: string | null;
    amount: number;
  } | null;
  prescription: { id: string; number: string } | null;
  review: { id: string; rating: number } | null;
}

export function toAppointmentDto(row: appointmentRepo.AppointmentRow): AppointmentDto {
  return {
    id: row.id,
    appointmentNumber: row.appointment_number,
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    appointmentDate: row.appointment_date,
    appointmentType: row.appointment_type,
    status: row.status,
    consultationFee: Number(row.consultation_fee),
    paymentStatus: row.payment_status,
    reason: row.reason,
    doctorNotes: row.doctor_notes,
    cancellationReason: row.cancellation_reason,
    createdAt: new Date(row.created_at).toISOString(),
    checkedInAt: row.checked_in_at ? new Date(row.checked_in_at).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    patient: {
      id: row.patient_id,
      profileId: row.patient_profile_id,
      name: row.patient_name,
      phone: row.patient_phone,
      email: row.patient_email,
      dateOfBirth: row.date_of_birth ? new Date(row.date_of_birth).toISOString().slice(0, 10) : null,
      gender: row.gender,
    },
    doctor: {
      id: row.doctor_id,
      profileId: row.doctor_profile_id,
      name: row.doctor_name,
      avatarUrl: row.doctor_avatar,
      qualification: row.qualification,
      specialty: row.specialty,
    },
    clinic: row.clinic_id
      ? {
          id: row.clinic_id,
          name: row.clinic_name ?? '',
          address: row.clinic_address ?? '',
          city: row.clinic_city ?? '',
        }
      : null,
    payment: row.payment_id
      ? {
          id: row.payment_id,
          status: row.payment_txn_status ?? 'created',
          provider: row.payment_provider ?? 'razorpay',
          providerPaymentId: row.provider_payment_id,
          paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
          amount: Number(row.consultation_fee),
        }
      : null,
    prescription: row.prescription_id
      ? { id: row.prescription_id, number: row.prescription_number ?? '' }
      : null,
    review: row.review_id ? { id: row.review_id, rating: row.review_rating ?? 0 } : null,
  };
}

function assertScope(row: appointmentRepo.AppointmentRow, actor: AuthUser): void {
  if (actor.role === 'patient' && row.patient_profile_id !== actor.id) throw Errors.forbidden();
  if (actor.role === 'doctor' && row.doctor_id !== actor.doctorId) throw Errors.forbidden();
}

export function scopeFor(
  actor: AuthUser,
  requested: { patientId?: string; doctorId?: string },
): { patientId?: string; doctorId?: string } {
  if (actor.role === 'patient') {
    if (!actor.patientId) throw Errors.forbidden();
    return { patientId: actor.patientId };
  }
  if (actor.role === 'doctor') {
    if (!actor.doctorId) throw Errors.forbidden();
    return { doctorId: actor.doctorId };
  }
  return { patientId: requested.patientId, doctorId: requested.doctorId };
}

export async function listAppointmentsFor(
  actor: AuthUser,
  input: appointmentRepo.ListAppointmentsParams,
) {
  const scoped = scopeFor(actor, input);
  const { rows, total } = await appointmentRepo.listAppointments({ ...input, ...scoped });
  return { items: rows.map(toAppointmentDto), total };
}

export async function getAppointmentDetail(id: string, actor: AuthUser) {
  const row = await appointmentRepo.findAppointment(id);
  if (!row) throw Errors.notFound('Appointment');
  assertScope(row, actor);
  const [history, payment] = await Promise.all([
    appointmentRepo.getStatusHistory(id),
    paymentService.getAppointmentPayment(id),
  ]);
  return {
    ...toAppointmentDto(row),
    history: history.map((h) => ({
      id: h.id,
      fromStatus: h.from_status,
      toStatus: h.to_status,
      note: h.note,
      changedByName: h.changed_by_name,
      createdAt: h.created_at,
    })),
    paymentDetail: payment,
  };
}

export interface BookingInput {
  doctorId: string;
  clinicId?: string;
  startsAt: string;
  appointmentType: 'in_clinic' | 'online';
  reason?: string;
  paymentOption: 'online' | 'pay_at_clinic';
  patientId?: string;
}

interface DoctorForBooking {
  id: string;
  profile_id: string;
  full_name: string;
  avatar_url: string | null;
  consultation_fee: string;
  online_consultation_fee: string | null;
  verification_status: string;
  is_active: boolean;
  profile_active: boolean;
}

export async function createBooking(input: BookingInput, actor: AuthUser) {
  const settings = await getSettings();
  if (settings.maintenance_mode) {
    throw new AppError(503, 'MAINTENANCE_MODE', 'Online booking is temporarily paused. Please try again later.');
  }
  if (input.paymentOption === 'pay_at_clinic' && !settings.pay_at_clinic_enabled) {
    throw Errors.validation('Pay at clinic is not available. Please pay online to confirm.');
  }

  let patientId: string | undefined;
  if (actor.role === 'patient') {
    patientId = actor.patientId ?? undefined;
  } else if (actor.role === 'receptionist' || actor.role === 'admin') {
    patientId = input.patientId;
    if (!patientId) throw Errors.validation('Select a patient before booking');
  } else {
    throw Errors.forbidden('Only patients and front-desk staff can create bookings');
  }
  if (!patientId) throw Errors.forbidden('Patient profile not found');

  const patient = await one<{ id: string; profile_id: string; full_name: string }>(
    `select pt.id, pt.profile_id, p.full_name from patients pt join profiles p on p.id = pt.profile_id
      where pt.id = $1 and p.is_active = true`,
    [patientId],
  );
  if (!patient) throw Errors.notFound('Patient');

  const doctor = await one<DoctorForBooking>(
    `select d.id, d.profile_id, p.full_name, p.avatar_url, d.consultation_fee, d.online_consultation_fee,
            d.verification_status, d.is_active, p.is_active as profile_active
       from doctors d join profiles p on p.id = d.profile_id where d.id = $1`,
    [input.doctorId],
  );
  if (!doctor || !doctor.is_active || !doctor.profile_active) throw Errors.notFound('Doctor');
  if (doctor.verification_status !== 'verified') {
    throw Errors.validation('This doctor is not currently accepting appointments');
  }

  const resolved = await availability.resolveRequestedSlot(doctor.id, input.startsAt);
  await availability.assertSlotBookable(doctor.id, resolved);

  let clinicId: string | null = null;
  let fee = Number(doctor.consultation_fee);
  if (input.appointmentType === 'in_clinic') {
    const clinics = await many<{ id: string; consultation_fee: string | null; is_primary: boolean }>(
      `select c.id, dc.consultation_fee, dc.is_primary
         from doctor_clinics dc join clinics c on c.id = dc.clinic_id
        where dc.doctor_id = $1 and c.is_active = true
        order by dc.is_primary desc`,
      [doctor.id],
    );
    if (!clinics.length) throw Errors.validation('This doctor has no active clinic for in-clinic consultation');
    const selected = input.clinicId ? clinics.find((c) => c.id === input.clinicId) : clinics[0];
    if (!selected) throw Errors.validation('The selected clinic is not linked to this doctor');
    clinicId = selected.id;
    fee = selected.consultation_fee === null ? Number(doctor.consultation_fee) : Number(selected.consultation_fee);
  } else {
    if (doctor.online_consultation_fee === null) {
      throw Errors.validation('Online consultation is not available with this doctor');
    }
    fee = Number(doctor.online_consultation_fee);
  }

  const appointmentNumber = await withTransaction(async (client) => {
    // Serialize bookings for this doctor before evaluating overlap constraints.
    await client.query('select pg_advisory_xact_lock($1, $2)', [7841, pgAdvisoryLockKey(doctor.id)]);

    const conflict = await client.query(
      `select 1 from appointments
        where doctor_id = $1 and status in ('pending','confirmed','checked_in','in_progress')
          and starts_at < $3 and ends_at > $2 limit 1`,
      [doctor.id, resolved.startsAt, resolved.endsAt],
    );
    if (conflict.rowCount) throw Errors.slotUnavailable();

    const timeOff = await client.query(
      'select 1 from doctor_time_off where doctor_id = $1 and starts_at < $3 and ends_at > $2 limit 1',
      [doctor.id, resolved.startsAt, resolved.endsAt],
    );
    if (timeOff.rowCount) throw Errors.slotUnavailable('The doctor is unavailable at this time');

    const sequence = await client.query<{ seq: string }>("select nextval('appointment_number_seq')::text as seq");
    const year = new Date().getFullYear().toString().slice(-2);
    const number = `MB-${year}${(sequence.rows[0]?.seq ?? '0').padStart(4, '0')}`;

    const status = input.paymentOption === 'pay_at_clinic' && settings.auto_confirm_appointments
      ? 'confirmed'
      : 'pending';

    const inserted = await client.query<{ id: string }>(
      `insert into appointments
         (appointment_number, patient_id, doctor_id, clinic_id, starts_at, ends_at, appointment_type,
          status, consultation_fee, payment_status, reason, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $11)
       returning id`,
      [
        number,
        patientId,
        doctor.id,
        clinicId,
        resolved.startsAt,
        resolved.endsAt,
        input.appointmentType,
        status,
        fee,
        input.reason ?? null,
        actor.id,
      ],
    );
    const appointmentId = inserted.rows[0].id;

    await client.query(
      `insert into appointment_status_history (appointment_id, to_status, changed_by, note)
       values ($1, $2, $3, $4)`,
      [appointmentId, status, actor.id, 'Booking created'],
    );

    await client.query(
      `insert into payments (appointment_id, patient_id, amount, currency, payment_provider, status, idempotency_key)
       values ($1, $2, $3, $4, $5, 'created', $6)`,
      [
        appointmentId,
        patientId,
        fee,
        'INR',
        input.paymentOption === 'pay_at_clinic' ? 'pay_at_clinic' : 'razorpay',
        `booking-payment:${appointmentId}`,
      ],
    );

    return { id: appointmentId, number, status };
  }).catch((error) => {
    if (isPgError(error) && (error.code === '23P01' || error.constraint === 'appointments_active_slot_uniq')) {
      throw Errors.slotUnavailable();
    }
    throw error;
  });

  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'appointment.created',
    entityType: 'appointment',
    entityId: appointmentNumber.id,
    metadata: { number: appointmentNumber.number, doctorId: doctor.id, startsAt: resolved.startsAt.toISOString() },
  });

  const detail = await appointmentRepo.findAppointment(appointmentNumber.id);
  if (!detail) throw Errors.internal('Appointment was created but could not be loaded');
  const when = formatIstHuman(new Date(detail.starts_at));

  if (appointmentNumber.status === 'confirmed') {
    await notify({
      profileId: detail.patient_profile_id,
      appointmentId: detail.id,
      type: 'appointment_booked',
      title: 'Appointment confirmed',
      body: `Your appointment ${detail.appointment_number} with Dr. ${doctor.full_name} is confirmed for ${when}. Please pay ₹${fee.toFixed(2)} at the clinic.`,
      email: true,
      sms: true,
      dedupeKey: appointmentDedupe('appointment_booked', detail.id, detail.patient_profile_id),
    });
    await notify({
      profileId: detail.doctor_profile_id,
      appointmentId: detail.id,
      type: 'appointment_booked',
      title: 'New appointment booked',
      body: `${detail.patient_name} booked appointment ${detail.appointment_number} for ${when}.`,
      email: true,
      dedupeKey: appointmentDedupe('appointment_booked', detail.id, detail.doctor_profile_id),
    });
  } else {
    await notify({
      profileId: detail.patient_profile_id,
      appointmentId: detail.id,
      type: 'appointment_booked',
      title: 'Booking created — complete payment',
      body: `Your slot with Dr. ${doctor.full_name} on ${when} is held for 30 minutes. Complete payment to confirm appointment ${detail.appointment_number}.`,
      email: true,
      dedupeKey: appointmentDedupe('appointment_pending', detail.id, detail.patient_profile_id),
    });
  }

  let paymentInit: Awaited<ReturnType<typeof paymentService.createOrderForAppointment>> | null = null;
  let paymentError: string | null = null;
  if (input.paymentOption === 'online') {
    try {
      paymentInit = await paymentService.createOrderForAppointment(detail.id, actor);
    } catch (error) {
      paymentError = error instanceof Error ? error.message : 'Unable to initialise payment';
    }
  }

  return {
    appointment: toAppointmentDto(detail),
    paymentInit,
    paymentError,
  };
}

export async function rescheduleAppointment(id: string, startsAt: string, actor: AuthUser) {
  const settings = await getSettings();
  const existing = await appointmentRepo.findAppointment(id);
  if (!existing) throw Errors.notFound('Appointment');
  assertScope(existing, actor);
  if (!['pending', 'confirmed'].includes(existing.status)) {
    throw Errors.conflict('Only pending or confirmed appointments can be rescheduled', 'INVALID_STATE');
  }
  if (new Date(existing.starts_at) <= new Date()) {
    throw Errors.conflict('Past appointments cannot be rescheduled', 'INVALID_STATE');
  }
  if (actor.role === 'patient') {
    const hours = minutesBetween(new Date(), new Date(existing.starts_at)) / 60;
    if (hours < settings.reschedule_min_hours) {
      throw new AppError(
        403,
        'RESCHEDULE_WINDOW_PASSED',
        `Appointments must be rescheduled at least ${settings.reschedule_min_hours} hours in advance`,
      );
    }
  }

  const resolved = await availability.resolveRequestedSlot(existing.doctor_id, startsAt);
  if (resolved.startsAt.getTime() === new Date(existing.starts_at).getTime()) {
    throw Errors.validation('Choose a different time slot');
  }
  await availability.assertSlotBookable(existing.doctor_id, resolved, existing.id);

  await withTransaction(async (client) => {
    await client.query('select pg_advisory_xact_lock($1, $2)', [7841, pgAdvisoryLockKey(existing.doctor_id)]);
    const conflict = await client.query(
      `select 1 from appointments
        where doctor_id = $1 and id <> $2 and status in ('pending','confirmed','checked_in','in_progress')
          and starts_at < $4 and ends_at > $3 limit 1`,
      [existing.doctor_id, existing.id, resolved.startsAt, resolved.endsAt],
    );
    if (conflict.rowCount) throw Errors.slotUnavailable();

    await client.query(
      `update appointments set starts_at = $1, ends_at = $2, updated_at = now() where id = $3`,
      [resolved.startsAt, resolved.endsAt, existing.id],
    );
    await client.query(
      `insert into appointment_status_history (appointment_id, from_status, to_status, changed_by, note)
       values ($1, $2, $2, $3, $4)`,
      [
        existing.id,
        existing.status,
        actor.id,
        `Rescheduled from ${formatIstHuman(new Date(existing.starts_at))} to ${formatIstHuman(resolved.startsAt)}`,
      ],
    );
  }).catch((error) => {
    if (isPgError(error) && (error.code === '23P01' || error.constraint === 'appointments_active_slot_uniq')) {
      throw Errors.slotUnavailable();
    }
    throw error;
  });

  const updated = await appointmentRepo.findAppointment(id);
  if (!updated) throw Errors.notFound('Appointment');
  const when = formatIstHuman(new Date(updated.starts_at));

  await notify({
    profileId: updated.patient_profile_id,
    appointmentId: updated.id,
    type: 'appointment_rescheduled',
    title: 'Appointment rescheduled',
    body: `Appointment ${updated.appointment_number} has been moved to ${when}.`,
    email: true,
    sms: true,
    dedupeKey: appointmentDedupe('appointment_rescheduled', updated.id, updated.patient_profile_id, updated.starts_at.toISOString()),
  });
  await notify({
    profileId: updated.doctor_profile_id,
    appointmentId: updated.id,
    type: 'appointment_rescheduled',
    title: 'Appointment rescheduled',
    body: `Appointment ${updated.appointment_number} with ${updated.patient_name} moved to ${when}.`,
    email: true,
    dedupeKey: appointmentDedupe('appointment_rescheduled', updated.id, updated.doctor_profile_id, updated.starts_at.toISOString()),
  });

  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'appointment.rescheduled',
    entityType: 'appointment',
    entityId: id,
    metadata: { previous: existing.starts_at, next: updated.starts_at },
  });

  return getAppointmentDetail(id, actor);
}

export async function cancelAppointment(id: string, reason: string, actor: AuthUser) {
  const settings = await getSettings();
  const existing = await appointmentRepo.findAppointment(id);
  if (!existing) throw Errors.notFound('Appointment');
  assertScope(existing, actor);
  if (!['pending', 'confirmed', 'checked_in'].includes(existing.status)) {
    throw Errors.conflict('This appointment can no longer be cancelled', 'INVALID_STATE');
  }
  if (new Date(existing.starts_at) <= new Date()) {
    throw Errors.conflict('Past appointments cannot be cancelled', 'INVALID_STATE');
  }

  const hoursUntil = minutesBetween(new Date(), new Date(existing.starts_at)) / 60;
  if (actor.role === 'patient' && hoursUntil < settings.cancellation_min_hours) {
    throw new AppError(
      403,
      'CANCELLATION_WINDOW_PASSED',
      `Cancellations must be made at least ${settings.cancellation_min_hours} hours before the appointment. Please contact the clinic.`,
    );
  }

  await withTransaction(async (client) => {
    const locked = await client.query<{ status: string }>(
      'select status from appointments where id = $1 for update',
      [id],
    );
    if (!locked.rows[0]) throw Errors.notFound('Appointment');
    await client.query(
      `update appointments set status = 'cancelled', cancellation_reason = $1, cancelled_by = $2,
              updated_at = now() where id = $3`,
      [reason, actor.id, id],
    );
    await client.query(
      `insert into appointment_status_history (appointment_id, from_status, to_status, changed_by, note)
       values ($1, $2, 'cancelled', $3, $4)`,
      [id, locked.rows[0].status, actor.id, reason],
    );
  });

  let refund: Awaited<ReturnType<typeof paymentService.processRefund>> | null = null;
  const payment = await paymentRepo.findPaymentByAppointment(id);
  const refundEligible =
    payment &&
    payment.status === 'captured' &&
    payment.payment_provider !== 'pay_at_clinic' &&
    (actor.role !== 'patient' || hoursUntil >= settings.cancellation_min_hours);

  if (refundEligible && payment) {
    try {
      refund = await paymentService.processRefund({
        paymentId: payment.id,
        reason: `Appointment cancelled: ${reason}`,
        actorId: actor.id,
        auto: true,
      });
    } catch {
      // Refund is queued for admin review if the provider call fails.
    }
  }

  const when = formatIstHuman(new Date(existing.starts_at));
  await notify({
    profileId: existing.patient_profile_id,
    appointmentId: id,
    type: 'appointment_cancelled',
    title: 'Appointment cancelled',
    body: `Appointment ${existing.appointment_number} on ${when} has been cancelled.${refund ? ' Your refund is being processed.' : ''}`,
    email: true,
    sms: true,
    dedupeKey: appointmentDedupe('appointment_cancelled', id, existing.patient_profile_id),
  });
  await notify({
    profileId: existing.doctor_profile_id,
    appointmentId: id,
    type: 'appointment_cancelled',
    title: 'Appointment cancelled',
    body: `${existing.patient_name} cancelled appointment ${existing.appointment_number} on ${when}.`,
    email: true,
    dedupeKey: appointmentDedupe('appointment_cancelled', id, existing.doctor_profile_id),
  });

  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'appointment.cancelled',
    entityType: 'appointment',
    entityId: id,
    metadata: { reason, refundId: refund?.refundId ?? null },
  });

  return {
    ...(await getAppointmentDetail(id, actor)),
    cancellation: { refundStatus: refund?.status ?? null, refundAmount: refund?.amount ?? null },
  };
}

const TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled', 'rejected'],
  confirmed: ['checked_in', 'in_progress', 'completed', 'cancelled', 'rejected', 'no_show'],
  checked_in: ['in_progress', 'completed', 'cancelled', 'no_show'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  rejected: [],
  no_show: [],
};

const ROLE_STATUSES: Record<string, string[]> = {
  doctor: ['confirmed', 'in_progress', 'completed', 'rejected', 'no_show'],
  receptionist: ['checked_in', 'in_progress', 'completed', 'no_show'],
  admin: ['confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'rejected', 'no_show'],
};

export async function updateAppointmentStatus(
  id: string,
  target: string,
  note: string | undefined,
  actor: AuthUser,
) {
  const validTargets = ['confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'rejected', 'no_show'];
  if (!validTargets.includes(target)) {
    throw Errors.validation('Invalid appointment status');
  }
  const allowed = ROLE_STATUSES[actor.role];
  if (!allowed || !allowed.includes(target)) {
    throw Errors.forbidden('You cannot set this appointment status');
  }

  const existing = await appointmentRepo.findAppointment(id);
  if (!existing) throw Errors.notFound('Appointment');
  assertScope(existing, actor);

  if (!TRANSITIONS[existing.status]?.includes(target)) {
    throw Errors.conflict(`Cannot move an appointment from ${existing.status} to ${target}`, 'INVALID_TRANSITION');
  }
  if (target === 'confirmed' && existing.payment_status !== 'paid' && existing.payment_provider === 'razorpay') {
    throw Errors.paymentRequired('This appointment must be paid before it can be confirmed');
  }

  await withTransaction(async (client) => {
    const locked = await client.query<{ status: string }>(
      'select status from appointments where id = $1 for update',
      [id],
    );
    if (!locked.rows[0]) throw Errors.notFound('Appointment');

    const timestampField =
      target === 'checked_in' ? ', checked_in_at = now()' : target === 'completed' ? ', completed_at = now()' : '';

    await client.query(
      `update appointments set status = $1::appointment_status${timestampField}, updated_at = now() where id = $2`,
      [target, id],
    );
    await client.query(
      `insert into appointment_status_history (appointment_id, from_status, to_status, changed_by, note)
       values ($1, $2, $3, $4, $5)`,
      [id, locked.rows[0].status, target, actor.id, note ?? null],
    );
  });

  let refund = null;
  if (target === 'rejected' || target === 'cancelled') {
    const payment = await paymentRepo.findPaymentByAppointment(id);
    if (payment && payment.status === 'captured' && payment.payment_provider !== 'pay_at_clinic') {
      refund = await paymentService
        .processRefund({
          paymentId: payment.id,
          reason: `Appointment ${target} by ${actor.role}`,
          actorId: actor.id,
          auto: true,
        })
        .catch(() => null);
    }
  }

  const notificationByStatus: Record<string, { title: string; body: string }> = {
    confirmed: {
      title: 'Appointment confirmed',
      body: `Appointment ${existing.appointment_number} is confirmed for ${formatIstHuman(new Date(existing.starts_at))}.`,
    },
    checked_in: {
      title: 'Checked in',
      body: `You are checked in for appointment ${existing.appointment_number}. Please wait in the clinic lounge.`,
    },
    in_progress: {
      title: 'Consultation started',
      body: `Your consultation for appointment ${existing.appointment_number} has started.`,
    },
    completed: {
      title: 'Consultation completed',
      body: `Your consultation for appointment ${existing.appointment_number} is complete. You can view your prescription and share feedback from your dashboard.`,
    },
    rejected: {
      title: 'Appointment could not be accepted',
      body: `We are sorry, appointment ${existing.appointment_number} could not be accepted. ${refund ? 'A refund has been initiated.' : ''}`,
    },
    no_show: {
      title: 'Marked as no-show',
      body: `Appointment ${existing.appointment_number} was marked as a no-show. Please contact the clinic to rebook.`,
    },
  };

  const message = notificationByStatus[target];
  if (message) {
    await notify({
      profileId: existing.patient_profile_id,
      appointmentId: id,
      type: `appointment_${target}`,
      title: message.title,
      body: message.body,
      email: true,
      dedupeKey: appointmentDedupe(`appointment_${target}`, id, existing.patient_profile_id),
    });
  }

  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: `appointment.${target}`,
    entityType: 'appointment',
    entityId: id,
    metadata: { note: note ?? null, refundId: refund?.refundId ?? null },
  });

  return getAppointmentDetail(id, actor);
}

export async function submitReview(
  appointmentId: string,
  rating: number,
  comment: string | undefined,
  actor: AuthUser,
) {
  if (!actor.patientId) throw Errors.forbidden();
  const appointment = await appointmentRepo.findAppointment(appointmentId);
  if (!appointment) throw Errors.notFound('Appointment');
  if (appointment.patient_id !== actor.patientId) throw Errors.forbidden();
  if (appointment.status !== 'completed') {
    throw Errors.conflict('You can only review completed consultations', 'INVALID_STATE');
  }
  if (appointment.review_id) throw Errors.conflict('You have already reviewed this appointment', 'ALREADY_REVIEWED');

  const row = await one<{ id: string }>(
    `insert into reviews (appointment_id, patient_id, doctor_id, rating, comment)
     values ($1, $2, $3, $4, $5) returning id`,
    [appointmentId, appointment.patient_id, appointment.doctor_id, rating, comment ?? null],
  );
  if (!row) throw Errors.internal('Unable to save review');

  await writeAudit({
    actorId: actor.id,
    actorRole: 'patient',
    action: 'review.created',
    entityType: 'review',
    entityId: row.id,
    metadata: { appointmentId, rating },
  });

  return { id: row.id, rating, comment: comment ?? null };
}

export async function getInvoicePdf(appointmentId: string, actor: AuthUser): Promise<{ buffer: Buffer; fileName: string }> {
  const appointment = await appointmentRepo.findAppointment(appointmentId);
  if (!appointment) throw Errors.notFound('Appointment');
  assertScope(appointment, actor);

  const payment = await paymentRepo.findPaymentByAppointment(appointmentId);
  if (!payment) throw Errors.notFound('Payment');
  if (!['captured', 'refunded', 'partially_refunded'].includes(payment.status)) {
    throw Errors.conflict('An invoice is available only after payment is completed', 'PAYMENT_PENDING');
  }

  const doctor = await findDoctorDetail(appointment.doctor_id);

  const buffer = await renderInvoicePdf({
    invoiceNumber: `INV-${appointment.appointment_number.replace('MB-', '')}`,
    paymentId: payment.provider_payment_id ?? payment.id,
    paidAt: payment.paid_at ? new Date(payment.paid_at) : null,
    provider: payment.payment_provider,
    method:
      payment.payment_provider === 'razorpay'
        ? 'Online payment (Razorpay)'
        : payment.payment_provider === 'pay_at_clinic'
          ? 'Pay at clinic'
          : 'Manual payment',
    appointmentNumber: appointment.appointment_number,
    appointmentDate: new Date(appointment.starts_at).toISOString(),
    patient: {
      name: appointment.patient_name,
      email: appointment.patient_email,
      phone: appointment.patient_phone,
    },
    doctor: {
      name: appointment.doctor_name,
      qualification: doctor?.qualification ?? appointment.qualification,
    },
    clinic: appointment.clinic_name
      ? { name: appointment.clinic_name, address: appointment.clinic_address ?? '' }
      : null,
    consultationFee: Number(appointment.consultation_fee),
    amountPaid: Number(payment.amount),
    currency: payment.currency,
  });

  return {
    buffer,
    fileName: `MediBook-Invoice-${appointment.appointment_number}.pdf`,
  };
}
