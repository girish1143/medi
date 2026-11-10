import { many, one } from '../config/database';

export interface PrescriptionRow {
  id: string;
  prescription_number: string;
  appointment_id: string;
  patient_id: string;
  doctor_id: string;
  diagnosis: string;
  notes: string | null;
  follow_up_date: Date | null;
  created_at: Date;
  appointment_number: string;
  starts_at: Date;
  patient_name: string;
  patient_email: string;
  patient_phone: string | null;
  date_of_birth: Date | null;
  gender: string | null;
  doctor_name: string;
  doctor_qualification: string;
  registration_number: string;
  specialty: string | null;
  items?: Array<{
    id: string;
    medicine_name: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions: string | null;
    sort_order: number;
  }>;
}

const SELECT = `
  select pr.id, pr.prescription_number, pr.appointment_id, pr.patient_id, pr.doctor_id,
         pr.diagnosis, pr.notes, pr.follow_up_date, pr.created_at,
         a.appointment_number, a.starts_at,
         pp.full_name as patient_name, pp.email as patient_email, pp.phone as patient_phone,
         pt.date_of_birth, pt.gender,
         dp.full_name as doctor_name, d.qualification as doctor_qualification,
         d.registration_number,
         (select s.name from doctor_specialties ds join specialties s on s.id = ds.specialty_id
           where ds.doctor_id = d.id and ds.is_primary limit 1) as specialty
    from prescriptions pr
    join appointments a on a.id = pr.appointment_id
    join patients pt on pt.id = pr.patient_id
    join profiles pp on pp.id = pt.profile_id
    join doctors d on d.id = pr.doctor_id
    join profiles dp on dp.id = d.profile_id
`;

export interface PrescriptionItemRow {
  id: string;
  prescription_id: string;
  medicine_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string | null;
  sort_order: number;
}

export async function findPrescription(id: string): Promise<PrescriptionRow | null> {
  const row = await one<PrescriptionRow>(`${SELECT} where pr.id = $1`, [id]);
  if (!row) return null;
  row.items = await many<PrescriptionItemRow>(
    `select id, prescription_id, medicine_name, dosage, frequency, duration, instructions, sort_order
       from prescription_items where prescription_id = $1 order by sort_order, id`,
    [id],
  );
  return row;
}

export async function listPrescriptions(params: {
  patientId?: string;
  doctorId?: string;
  limit: number;
  offset: number;
}) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (params.patientId) {
    values.push(params.patientId);
    clauses.push(`pr.patient_id = $${values.length}`);
  }
  if (params.doctorId) {
    values.push(params.doctorId);
    clauses.push(`pr.doctor_id = $${values.length}`);
  }
  const where = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const totalRow = await one<{ count: string }>(
    `select count(*)::text as count from prescriptions pr ${where}`,
    values,
  );
  values.push(params.limit, params.offset);
  const rows = await many<PrescriptionRow>(
    `${SELECT} ${where} order by pr.created_at desc limit $${values.length - 1} offset $${values.length}`,
    values,
  );
  const items = rows.length
    ? await many<PrescriptionItemRow>(
        `select id, prescription_id, medicine_name, dosage, frequency, duration, instructions, sort_order
           from prescription_items where prescription_id = any($1::uuid[]) order by sort_order, id`,
        [rows.map((r) => r.id)],
      )
    : [];
  const grouped = new Map<string, PrescriptionItemRow[]>();
  for (const item of items) {
    const list = grouped.get(item.prescription_id) ?? [];
    list.push(item);
    grouped.set(item.prescription_id, list);
  }
  for (const row of rows) row.items = grouped.get(row.id) ?? [];
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function appointmentForPrescription(appointmentId: string) {
  return one<{
    id: string;
    doctor_id: string;
    patient_id: string;
    status: string;
    appointment_number: string;
  }>(
    'select id, doctor_id, patient_id, status, appointment_number from appointments where id = $1',
    [appointmentId],
  );
}
