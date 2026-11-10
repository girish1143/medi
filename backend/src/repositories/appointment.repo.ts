import { many, one } from '../config/database';

export interface AppointmentRow {
  id: string;
  appointment_number: string;
  starts_at: Date;
  ends_at: Date;
  appointment_date: string;
  appointment_type: 'in_clinic' | 'online';
  status: string;
  consultation_fee: string;
  payment_status: string;
  reason: string | null;
  doctor_notes: string | null;
  cancellation_reason: string | null;
  created_at: Date;
  checked_in_at: Date | null;
  completed_at: Date | null;
  patient_id: string;
  patient_name: string;
  patient_phone: string | null;
  patient_email: string;
  patient_profile_id: string;
  date_of_birth: Date | null;
  gender: string | null;
  doctor_id: string;
  doctor_name: string;
  doctor_avatar: string | null;
  doctor_profile_id: string;
  qualification: string;
  specialty: string | null;
  clinic_id: string | null;
  clinic_name: string | null;
  clinic_address: string | null;
  clinic_city: string | null;
  payment_id: string | null;
  payment_txn_status: string | null;
  payment_provider: string | null;
  provider_payment_id: string | null;
  paid_at: Date | null;
  prescription_id: string | null;
  prescription_number: string | null;
  review_id: string | null;
  review_rating: number | null;
  total_count?: string;
}

export const APPOINTMENT_SELECT = `
  select a.id, a.appointment_number, a.starts_at, a.ends_at, a.appointment_date, a.appointment_type,
         a.status, a.consultation_fee, a.payment_status, a.reason, a.doctor_notes, a.cancellation_reason,
         a.created_at, a.checked_in_at, a.completed_at,
         pt.id as patient_id, pp.full_name as patient_name, pp.phone as patient_phone,
         pp.email as patient_email, pp.id as patient_profile_id, pt.date_of_birth, pt.gender,
         d.id as doctor_id, dp.id as doctor_profile_id, dp.full_name as doctor_name,
         dp.avatar_url as doctor_avatar, d.qualification,
         (select s.name from doctor_specialties ds join specialties s on s.id = ds.specialty_id
           where ds.doctor_id = d.id and ds.is_primary limit 1) as specialty,
         c.id as clinic_id, c.name as clinic_name,
         case when c.id is null then null else concat_ws(', ', c.address_line1, c.area, c.city) end as clinic_address,
         c.city as clinic_city,
         pay.id as payment_id, pay.status as payment_txn_status, pay.payment_provider,
         pay.provider_payment_id, pay.paid_at,
         pr.id as prescription_id, pr.prescription_number,
         rev.id as review_id, rev.rating as review_rating
    from appointments a
    join patients pt on pt.id = a.patient_id
    join profiles pp on pp.id = pt.profile_id
    join doctors d on d.id = a.doctor_id
    join profiles dp on dp.id = d.profile_id
    left join clinics c on c.id = a.clinic_id
    left join lateral (
      select p.id, p.status, p.payment_provider, p.provider_payment_id, p.paid_at
        from payments p where p.appointment_id = a.id
       order by p.created_at desc limit 1
    ) pay on true
    left join prescriptions pr on pr.appointment_id = a.id
    left join reviews rev on rev.appointment_id = a.id
`;

export interface ListAppointmentsParams {
  patientId?: string;
  doctorId?: string;
  statuses?: string[];
  view?: 'upcoming' | 'past' | 'today' | 'all';
  date?: string;
  from?: string;
  to?: string;
  search?: string;
  sort?: 'recent' | 'upcoming';
  limit: number;
  offset: number;
}

export async function listAppointments(params: ListAppointmentsParams): Promise<{
  rows: AppointmentRow[];
  total: number;
}> {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (params.patientId) {
    values.push(params.patientId);
    clauses.push(`a.patient_id = $${values.length}`);
  }
  if (params.doctorId) {
    values.push(params.doctorId);
    clauses.push(`a.doctor_id = $${values.length}`);
  }
  if (params.statuses?.length) {
    values.push(params.statuses);
    clauses.push(`a.status = any($${values.length}::appointment_status[])`);
  }
  if (params.date) {
    values.push(params.date);
    clauses.push(`a.appointment_date = $${values.length}::date`);
  }
  if (params.from) {
    values.push(params.from);
    clauses.push(`a.starts_at >= $${values.length}::timestamptz`);
  }
  if (params.to) {
    values.push(params.to);
    clauses.push(`a.starts_at <= $${values.length}::timestamptz`);
  }
  if (params.view === 'upcoming') {
    clauses.push(
      `a.starts_at >= now() and a.status in ('pending','confirmed','checked_in','in_progress')`,
    );
  } else if (params.view === 'past') {
    clauses.push(`(a.starts_at < now() or a.status in ('completed','cancelled','rejected','no_show'))`);
  } else if (params.view === 'today') {
    clauses.push(`a.appointment_date = (now() at time zone 'Asia/Kolkata')::date`);
  }
  if (params.search) {
    values.push(`%${params.search}%`);
    const idx = values.length;
    clauses.push(
      `(a.appointment_number ilike $${idx} or pp.full_name ilike $${idx} or dp.full_name ilike $${idx})`,
    );
  }

  const where = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const order =
    params.sort === 'upcoming'
      ? 'order by a.starts_at asc'
      : params.view === 'upcoming'
        ? 'order by a.starts_at asc'
        : 'order by a.starts_at desc';

  values.push(params.limit, params.offset);
  const rows = await many<AppointmentRow>(
    `${APPOINTMENT_SELECT} ${where} ${order} limit $${values.length - 1} offset $${values.length}`,
    values,
  );

  const total = rows.length ? Number(rows[0].total_count ?? rows.length) : 0;
  // total_count is not selected above; perform a lightweight count for accuracy.
  const countValues = values.slice(0, -2);
  const countRow = await one<{ count: string }>(
    `select count(*)::text as count
       from appointments a
       join patients pt on pt.id = a.patient_id
       join profiles pp on pp.id = pt.profile_id
       join doctors d on d.id = a.doctor_id
       join profiles dp on dp.id = d.profile_id
       ${where}`,
    countValues,
  );

  return { rows, total: Number(countRow?.count ?? total) };
}

export async function findAppointment(id: string): Promise<AppointmentRow | null> {
  return one<AppointmentRow>(`${APPOINTMENT_SELECT} where a.id = $1`, [id]);
}

export async function findAppointmentForUpdate(client: { query: Function }, id: string) {
  const result = await client.query(
    `select a.*, pt.profile_id as patient_profile_id, d.profile_id as doctor_profile_id
       from appointments a
       join patients pt on pt.id = a.patient_id
       join doctors d on d.id = a.doctor_id
      where a.id = $1
      for update of a`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function getStatusHistory(appointmentId: string) {
  return many<{
    id: string;
    from_status: string | null;
    to_status: string;
    note: string | null;
    created_at: Date;
    changed_by_name: string | null;
  }>(
    `select h.id, h.from_status, h.to_status, h.note, h.created_at, p.full_name as changed_by_name
       from appointment_status_history h
       left join profiles p on p.id = h.changed_by
      where h.appointment_id = $1
      order by h.created_at asc, h.id asc`,
    [appointmentId],
  );
}

export async function countAppointments(params: {
  patientId?: string;
  doctorId?: string;
  status?: string;
  from?: string;
  to?: string;
}): Promise<number> {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (params.patientId) {
    values.push(params.patientId);
    clauses.push(`patient_id = $${values.length}`);
  }
  if (params.doctorId) {
    values.push(params.doctorId);
    clauses.push(`doctor_id = $${values.length}`);
  }
  if (params.status) {
    values.push(params.status);
    clauses.push(`status = $${values.length}`);
  }
  if (params.from) {
    values.push(params.from);
    clauses.push(`starts_at >= $${values.length}`);
  }
  if (params.to) {
    values.push(params.to);
    clauses.push(`starts_at < $${values.length}`);
  }
  const where = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const row = await one<{ count: string }>(`select count(*)::text as count from appointments ${where}`, values);
  return Number(row?.count ?? 0);
}
