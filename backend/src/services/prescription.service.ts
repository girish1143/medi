import { one, withTransaction } from '../config/database';
import { AuthUser } from '../types/express';
import { Errors, isPgError } from '../utils/errors';
import * as prescriptionRepo from '../repositories/prescription.repo';
import { writeAudit } from './audit.service';
import { notify, appointmentDedupe } from './notification.service';
import { renderPrescriptionPdf } from '../utils/pdf';

function calculateAge(dateOfBirth: Date | null): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age -= 1;
  return Math.max(0, age);
}

export function toPrescriptionDto(row: prescriptionRepo.PrescriptionRow) {
  return {
    id: row.id,
    prescriptionNumber: row.prescription_number,
    appointmentId: row.appointment_id,
    appointmentNumber: row.appointment_number,
    diagnosis: row.diagnosis,
    notes: row.notes,
    followUpDate: row.follow_up_date ? new Date(row.follow_up_date).toISOString().slice(0, 10) : null,
    createdAt: row.created_at,
    doctor: {
      id: row.doctor_id,
      name: row.doctor_name,
      qualification: row.doctor_qualification,
      registrationNumber: row.registration_number,
      specialty: row.specialty,
    },
    patient: {
      id: row.patient_id,
      name: row.patient_name,
      email: row.patient_email,
      phone: row.patient_phone,
      age: calculateAge(row.date_of_birth),
      gender: row.gender,
    },
    items: (row.items ?? []).map((item) => ({
      id: item.id,
      medicineName: item.medicine_name,
      dosage: item.dosage,
      frequency: item.frequency,
      duration: item.duration,
      instructions: item.instructions,
    })),
  };
}

function assertAccess(row: prescriptionRepo.PrescriptionRow, actor: AuthUser): void {
  if (actor.role === 'patient' && row.patient_id !== actor.patientId) throw Errors.forbidden();
  if (actor.role === 'doctor' && row.doctor_id !== actor.doctorId) throw Errors.forbidden();
  if (!['patient', 'doctor', 'admin'].includes(actor.role)) throw Errors.forbidden();
}

export async function listPrescriptionsFor(
  actor: AuthUser,
  input: { patientId?: string; limit: number; offset: number },
) {
  let patientId = input.patientId;
  let doctorId: string | undefined;
  if (actor.role === 'patient') {
    patientId = actor.patientId ?? undefined;
    if (!patientId) throw Errors.forbidden();
  } else if (actor.role === 'doctor') {
    doctorId = actor.doctorId ?? undefined;
    if (!doctorId) throw Errors.forbidden();
  } else if (actor.role !== 'admin') {
    throw Errors.forbidden();
  }

  const { rows, total } = await prescriptionRepo.listPrescriptions({
    patientId,
    doctorId,
    limit: input.limit,
    offset: input.offset,
  });
  return { items: rows.map(toPrescriptionDto), total };
}

export async function getPrescription(id: string, actor: AuthUser) {
  const row = await prescriptionRepo.findPrescription(id);
  if (!row) throw Errors.notFound('Prescription');
  assertAccess(row, actor);
  return toPrescriptionDto(row);
}

export interface CreatePrescriptionInput {
  appointmentId: string;
  diagnosis: string;
  notes?: string;
  followUpDate?: string | null;
  items: Array<{
    medicineName: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions?: string;
  }>;
}

export async function createPrescription(input: CreatePrescriptionInput, actor: AuthUser) {
  if (actor.role !== 'doctor' || !actor.doctorId) throw Errors.forbidden('Only doctors can issue prescriptions');

  const appointment = await prescriptionRepo.appointmentForPrescription(input.appointmentId);
  if (!appointment) throw Errors.notFound('Appointment');
  if (appointment.doctor_id !== actor.doctorId) throw Errors.forbidden();
  if (!['in_progress', 'completed', 'confirmed'].includes(appointment.status)) {
    throw Errors.conflict('A prescription can only be created for an active or completed consultation', 'INVALID_STATE');
  }

  const existing = await one<{ id: string }>('select id from prescriptions where appointment_id = $1', [
    input.appointmentId,
  ]);
  if (existing) throw Errors.conflict('A prescription already exists for this consultation', 'DUPLICATE_PRESCRIPTION');

  const prescriptionId = await withTransaction(async (client) => {
    const sequence = await client.query<{ seq: string }>("select nextval('prescription_number_seq')::text as seq");
    const year = new Date().getFullYear().toString().slice(-2);
    const number = `RX-${year}${(sequence.rows[0]?.seq ?? '0').padStart(4, '0')}`;

    const inserted = await client.query<{ id: string }>(
      `insert into prescriptions
         (prescription_number, appointment_id, patient_id, doctor_id, diagnosis, notes, follow_up_date)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [
        number,
        input.appointmentId,
        appointment.patient_id,
        actor.doctorId,
        input.diagnosis,
        input.notes ?? null,
        input.followUpDate ?? null,
      ],
    );
    const id = inserted.rows[0].id;

    for (const [index, item] of input.items.entries()) {
      await client.query(
        `insert into prescription_items
           (prescription_id, medicine_name, dosage, frequency, duration, instructions, sort_order)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          item.medicineName,
          item.dosage,
          item.frequency,
          item.duration,
          item.instructions ?? null,
          index,
        ],
      );
    }

    // A doctor issuing a prescription implies the consultation is complete.
    await client.query(
      `update appointments set status = 'completed', completed_at = coalesce(completed_at, now())
        where id = $1 and status = 'in_progress'`,
      [input.appointmentId],
    );
    return id;
  }).catch((error) => {
    if (isPgError(error) && error.code === '23505') {
      throw Errors.conflict('A prescription already exists for this consultation', 'DUPLICATE_PRESCRIPTION');
    }
    throw error;
  });

  const row = await prescriptionRepo.findPrescription(prescriptionId);
  if (!row) throw Errors.internal('Prescription could not be loaded');

  const patientProfile = await one<{ profile_id: string }>(
    'select profile_id from patients where id = $1',
    [row.patient_id],
  );
  if (patientProfile) {
    await notify({
      profileId: patientProfile.profile_id,
      appointmentId: row.appointment_id,
      type: 'prescription_issued',
      title: 'Prescription available',
      body: `Dr. ${row.doctor_name} has issued prescription ${row.prescription_number}. You can view and download it from your dashboard.`,
      email: true,
      dedupeKey: appointmentDedupe('prescription_issued', row.appointment_id, patientProfile.profile_id),
    });
  }

  await writeAudit({
    actorId: actor.id,
    actorRole: 'doctor',
    action: 'prescription.created',
    entityType: 'prescription',
    entityId: prescriptionId,
    metadata: { appointmentId: input.appointmentId, items: input.items.length },
  });

  return toPrescriptionDto(row);
}

export async function getPrescriptionPdf(id: string, actor: AuthUser) {
  const row = await prescriptionRepo.findPrescription(id);
  if (!row) throw Errors.notFound('Prescription');
  assertAccess(row, actor);

  const buffer = await renderPrescriptionPdf({
    prescriptionNumber: row.prescription_number,
    createdAt: row.created_at,
    diagnosis: row.diagnosis,
    notes: row.notes,
    followUpDate: row.follow_up_date ? new Date(row.follow_up_date).toISOString().slice(0, 10) : null,
    doctor: {
      name: row.doctor_name,
      qualification: row.doctor_qualification,
      registrationNumber: row.registration_number,
      specialty: row.specialty,
    },
    patient: {
      name: row.patient_name,
      age: calculateAge(row.date_of_birth),
      gender: row.gender,
      phone: row.patient_phone,
    },
    items: (row.items ?? []).map((item) => ({
      medicineName: item.medicine_name,
      dosage: item.dosage,
      frequency: item.frequency,
      duration: item.duration,
      instructions: item.instructions,
    })),
    appointment: {
      number: row.appointment_number,
      date: new Date(row.starts_at).toISOString().slice(0, 10),
    },
  });

  return { buffer, fileName: `MediBook-Prescription-${row.prescription_number}.pdf` };
}
