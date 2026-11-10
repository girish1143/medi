import { env } from '../config/env';
import { AuthUser } from '../types/express';
import { AppError, Errors } from '../utils/errors';
import * as recordRepo from '../repositories/medicalRecord.repo';
import { createSignedUrl, deleteFile, uploadFile } from '../integrations/supabase/storage';
import { writeAudit } from './audit.service';
import { one } from '../config/database';

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

async function assertPatientAccess(patientId: string, actor: AuthUser, write = false): Promise<void> {
  if (actor.role === 'patient') {
    if (actor.patientId !== patientId) throw Errors.forbidden();
    return;
  }
  if (actor.role === 'admin') return;
  if (actor.role === 'doctor') {
    if (!actor.doctorId) throw Errors.forbidden();
    const relation = await one<{ exists: boolean }>(
      'select exists(select 1 from appointments where patient_id = $1 and doctor_id = $2) as exists',
      [patientId, actor.doctorId],
    );
    if (!relation?.exists) throw Errors.forbidden('You are not authorised to view this patient');
    return;
  }
  throw Errors.forbidden('Medical records are not available to this role');
}

async function resolvePatientId(patientIdFromQuery: string | undefined, actor: AuthUser): Promise<string> {
  if (actor.role === 'patient') {
    if (!actor.patientId) throw Errors.forbidden();
    if (patientIdFromQuery && patientIdFromQuery !== actor.patientId) throw Errors.forbidden();
    return actor.patientId;
  }
  if (!patientIdFromQuery) {
    throw Errors.validation('patientId is required');
  }
  return patientIdFromQuery;
}

function toDto(row: recordRepo.MedicalRecordRow) {
  return {
    id: row.id,
    patientId: row.patient_id,
    appointmentId: row.appointment_id,
    appointmentNumber: row.appointment_number ?? null,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    recordType: row.record_type,
    uploadedBy: row.uploaded_by_name ?? null,
    createdAt: row.created_at,
  };
}

export async function listMedicalRecords(
  actor: AuthUser,
  input: { patientId?: string; recordType?: string; search?: string; limit: number; offset: number },
) {
  const patientId = await resolvePatientId(input.patientId, actor);
  await assertPatientAccess(patientId, actor);
  const { rows, total } = await recordRepo.listRecords({
    patientId,
    recordType: input.recordType,
    search: input.search,
    limit: input.limit,
    offset: input.offset,
  });
  return { items: rows.map(toDto), total };
}

export async function uploadMedicalRecord(
  actor: AuthUser,
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  input: { patientId?: string; appointmentId?: string; recordType?: string },
) {
  if (!file) throw Errors.validation('Select a file to upload');
  if (file.size > MAX_SIZE) throw Errors.validation('File must be 10 MB or smaller');
  if (!ALLOWED_TYPES.has(file.mimetype)) {
    throw Errors.validation('Only PDF, JPEG, PNG and WebP files are supported');
  }

  let patientId = input.patientId;
  if (actor.role === 'patient') {
    patientId = actor.patientId ?? undefined;
  }
  if (!patientId) throw Errors.validation('patientId is required');
  await assertPatientAccess(patientId, actor, true);

  if (input.appointmentId) {
    const appointment = await one<{ patient_id: string }>(
      'select patient_id from appointments where id = $1',
      [input.appointmentId],
    );
    if (!appointment || appointment.patient_id !== patientId) {
      throw Errors.validation('The appointment does not belong to this patient');
    }
  }

  const filePath = await uploadFile({
    buffer: file.buffer,
    fileName: file.originalname,
    contentType: file.mimetype,
    folder: `patients/${patientId}`,
  });

  const id = await recordRepo.createRecord({
    patientId,
    appointmentId: input.appointmentId ?? null,
    filePath,
    fileName: file.originalname.slice(0, 180),
    fileType: file.mimetype,
    fileSize: file.size,
    recordType: input.recordType ?? 'other',
    uploadedBy: actor.id,
  });

  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'medical_record.uploaded',
    entityType: 'medical_record',
    entityId: id,
    metadata: { patientId, fileName: file.originalname, size: file.size },
  });

  const row = await recordRepo.findRecord(id);
  return row ? toDto(row) : null;
}

export async function getMedicalRecordDownload(recordId: string, actor: AuthUser) {
  const record = await recordRepo.findRecord(recordId);
  if (!record) throw Errors.notFound('Medical record');
  await assertPatientAccess(record.patient_id, actor);
  const signed = await createSignedUrl(record.file_path, env.SUPABASE_MEDICAL_BUCKET);
  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'medical_record.downloaded',
    entityType: 'medical_record',
    entityId: recordId,
    metadata: { patientId: record.patient_id },
  });
  return {
    url: signed.url,
    expiresIn: signed.expiresIn,
    fileName: record.file_name,
    fileType: record.file_type,
  };
}

export async function deleteMedicalRecord(recordId: string, actor: AuthUser) {
  const record = await recordRepo.findRecord(recordId);
  if (!record) throw Errors.notFound('Medical record');
  if (actor.role !== 'admin' && record.patient_id !== actor.patientId) {
    throw Errors.forbidden();
  }
  const deleted = await recordRepo.softDeleteRecord(recordId);
  if (!deleted) throw Errors.conflict('Record is already deleted', 'ALREADY_DELETED');
  if (deleted) {
    await deleteFile(record.file_path, env.SUPABASE_MEDICAL_BUCKET);
  }
  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'medical_record.deleted',
    entityType: 'medical_record',
    entityId: recordId,
  });
  return { deleted: true };
}

export { AppError };
