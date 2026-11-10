import { many, one, query } from '../config/database';

export interface MedicalRecordRow {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  record_type: string;
  uploaded_by: string;
  created_at: Date;
  appointment_number?: string | null;
  uploaded_by_name?: string | null;
}

export async function createRecord(input: {
  patientId: string;
  appointmentId?: string | null;
  filePath: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  recordType: string;
  uploadedBy: string;
}): Promise<string> {
  const row = await one<{ id: string }>(
    `insert into medical_records
       (patient_id, appointment_id, file_path, file_name, file_type, file_size, record_type, uploaded_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [
      input.patientId,
      input.appointmentId ?? null,
      input.filePath,
      input.fileName,
      input.fileType,
      input.fileSize,
      input.recordType,
      input.uploadedBy,
    ],
  );
  return row!.id;
}

export async function findRecord(id: string): Promise<MedicalRecordRow | null> {
  return one<MedicalRecordRow>(
    `select mr.*, a.appointment_number, p.full_name as uploaded_by_name
       from medical_records mr
       left join appointments a on a.id = mr.appointment_id
       join profiles p on p.id = mr.uploaded_by
      where mr.id = $1 and mr.deleted_at is null`,
    [id],
  );
}

export async function listRecords(params: {
  patientId: string;
  recordType?: string;
  search?: string;
  limit: number;
  offset: number;
}): Promise<{ rows: MedicalRecordRow[]; total: number }> {
  const values: unknown[] = [params.patientId];
  const clauses = ['mr.patient_id = $1', 'mr.deleted_at is null'];
  if (params.recordType) {
    values.push(params.recordType);
    clauses.push(`mr.record_type = $${values.length}::record_type`);
  }
  if (params.search) {
    values.push(`%${params.search}%`);
    clauses.push(`mr.file_name ilike $${values.length}`);
  }
  const where = `where ${clauses.join(' and ')}`;
  const totalRow = await one<{ count: string }>(
    `select count(*)::text as count from medical_records mr ${where}`,
    values,
  );

  values.push(params.limit, params.offset);
  const rows = await many<MedicalRecordRow>(
    `select mr.*, a.appointment_number, p.full_name as uploaded_by_name
       from medical_records mr
       left join appointments a on a.id = mr.appointment_id
       join profiles p on p.id = mr.uploaded_by
       ${where}
      order by mr.created_at desc
      limit $${values.length - 1} offset $${values.length}`,
    values,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function softDeleteRecord(id: string): Promise<boolean> {
  const result = await query(
    `update medical_records set deleted_at = now() where id = $1 and deleted_at is null`,
    [id],
  );
  return (result.rowCount ?? 0) > 0;
}
