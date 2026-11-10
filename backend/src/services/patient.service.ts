import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { many, one, query, withTransaction } from '../config/database';
import { env } from '../config/env';
import { AuthUser } from '../types/express';
import { AppError, Errors } from '../utils/errors';
import * as doctorRepo from '../repositories/doctor.repo';
import { writeAudit } from './audit.service';
import { getSupabaseAdmin } from '../integrations/supabase/client';
import { notify } from './notification.service';

export async function getPatientProfile(actor: AuthUser) {
  if (!actor.patientId) throw Errors.forbidden('Patient profile not found');
  const patient = await one<{
    id: string;
    profile_id: string;
    full_name: string;
    email: string;
    phone: string | null;
    avatar_url: string | null;
    date_of_birth: Date | null;
    gender: string | null;
    blood_group: string | null;
    emergency_contact: string | null;
    address: string | null;
    created_at: Date;
  }>(
    `select pt.id, pt.profile_id, p.full_name, p.email, p.phone, p.avatar_url,
            pt.date_of_birth, pt.gender, pt.blood_group, pt.emergency_contact, pt.address, pt.created_at
       from patients pt join profiles p on p.id = pt.profile_id
      where pt.id = $1`,
    [actor.patientId],
  );
  if (!patient) throw Errors.notFound('Patient');

  const addresses = await many<{
    id: string;
    label: string;
    line1: string;
    line2: string | null;
    area: string | null;
    city: string;
    state: string;
    pincode: string;
    is_default: boolean;
  }>(
    `select id, label, line1, line2, area, city, state, pincode, is_default
       from user_addresses where profile_id = $1 order by is_default desc, created_at desc`,
    [actor.id],
  );

  return {
    id: patient.id,
    profileId: patient.profile_id,
    fullName: patient.full_name,
    email: patient.email,
    phone: patient.phone,
    avatarUrl: patient.avatar_url,
    dateOfBirth: patient.date_of_birth ? new Date(patient.date_of_birth).toISOString().slice(0, 10) : null,
    gender: patient.gender,
    bloodGroup: patient.blood_group,
    emergencyContact: patient.emergency_contact,
    address: patient.address,
    memberSince: patient.created_at,
    addresses: addresses.map((a) => ({
      id: a.id,
      label: a.label,
      line1: a.line1,
      line2: a.line2,
      area: a.area,
      city: a.city,
      state: a.state,
      pincode: a.pincode,
      isDefault: a.is_default,
    })),
  };
}

export async function updatePatientProfile(
  actor: AuthUser,
  input: {
    fullName?: string;
    phone?: string | null;
    address?: string;
    dateOfBirth?: string | null;
    gender?: string | null;
    bloodGroup?: string | null;
    emergencyContact?: string | null;
  },
) {
  if (!actor.patientId) throw Errors.forbidden('Patient profile not found');

  await withTransaction(async (client) => {
    if (input.fullName !== undefined || input.phone !== undefined) {
      const fields: string[] = [];
      const values: unknown[] = [];
      if (input.fullName !== undefined) {
        values.push(input.fullName);
        fields.push(`full_name = $${values.length}`);
      }
      if (input.phone !== undefined) {
        values.push(input.phone);
        fields.push(`phone = $${values.length}`);
      }
      values.push(actor.id);
      await client.query(`update profiles set ${fields.join(', ')} where id = $${values.length}`, values);
    }

    const patientFields: string[] = [];
    const patientValues: unknown[] = [];
    const map: Record<string, unknown> = {
      address: input.address,
      date_of_birth: input.dateOfBirth,
      gender: input.gender,
      blood_group: input.bloodGroup,
      emergency_contact: input.emergencyContact,
    };
    for (const [column, value] of Object.entries(map)) {
      if (value !== undefined) {
        patientValues.push(value);
        patientFields.push(`${column} = $${patientValues.length}`);
      }
    }
    if (patientFields.length) {
      patientValues.push(actor.patientId);
      await client.query(
        `update patients set ${patientFields.join(', ')} where id = $${patientValues.length}`,
        patientValues,
      );
    }
  });

  await writeAudit({
    actorId: actor.id,
    actorRole: 'patient',
    action: 'patient.profile_updated',
    entityType: 'patient',
    entityId: actor.patientId,
  });

  return getPatientProfile(actor);
}

export async function registerWalkInPatient(
  input: {
    fullName: string;
    email?: string;
    phone: string;
    dateOfBirth?: string;
    gender?: string;
    address?: string;
  },
  actor: AuthUser,
) {
  const email = input.email?.trim().toLowerCase() || `walkin.${Date.now()}.${crypto.randomBytes(2).toString('hex')}@medibook.local`;
  const existing = await one<{ id: string; profile_id: string }>(
    `select pt.id, pt.profile_id from patients pt join profiles p on p.id = pt.profile_id
      where p.phone = $1 or lower(p.email) = lower($2) limit 1`,
    [input.phone, email],
  );
  if (existing) {
    return {
      id: existing.id,
      profileId: existing.profile_id,
      existed: true,
      temporaryPassword: null as string | null,
    };
  }

  const temporaryPassword = `Mb${crypto.randomBytes(3).toString('hex')}!7`;
  let profileId: string;

  if (env.AUTH_PROVIDER === 'supabase') {
    const created = await getSupabaseAdmin().auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: input.fullName, phone: input.phone, walk_in: true },
    });
    if (created.error || !created.data.user) {
      throw new AppError(400, 'PATIENT_CREATE_FAILED', created.error?.message ?? 'Unable to create patient');
    }
    profileId = created.data.user.id;
    await withTransaction(async (client) => {
      await client.query(
        `insert into profiles (id, full_name, email, phone, role) values ($1, $2, $3, $4, 'patient')`,
        [profileId, input.fullName, email, input.phone],
      );
      await client.query(
        `insert into patients (profile_id, date_of_birth, gender, address) values ($1, $2, $3, $4)`,
        [profileId, input.dateOfBirth ?? null, input.gender ?? null, input.address ?? null],
      );
    });
  } else {
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    profileId = await withTransaction(async (client) => {
      const inserted = await client.query<{ id: string }>(
        'insert into auth.users (email) values ($1) returning id',
        [email],
      );
      const id = inserted.rows[0].id;
      await client.query(
        `insert into profiles (id, full_name, email, phone, role) values ($1, $2, $3, $4, 'patient')`,
        [id, input.fullName, email, input.phone],
      );
      await client.query(
        `insert into patients (profile_id, date_of_birth, gender, address) values ($1, $2, $3, $4)`,
        [id, input.dateOfBirth ?? null, input.gender ?? null, input.address ?? null],
      );
      await client.query('insert into dev_credentials (profile_id, password_hash) values ($1, $2)', [
        id,
        passwordHash,
      ]);
      return id;
    });
  }

  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'patient.walk_in_registered',
    entityType: 'profile',
    entityId: profileId,
  });

  const patient = await one<{ id: string }>('select id from patients where profile_id = $1', [profileId]);
  return {
    id: patient!.id,
    profileId,
    existed: false,
    temporaryPassword: env.isProd ? null : temporaryPassword,
  };
}

export async function getPatientDashboard(actor: AuthUser) {
  if (!actor.patientId) throw Errors.forbidden('Patient profile not found');
  const patientId = actor.patientId;

  const stats = await one<{
    total: string;
    upcoming: string;
    completed: string;
    cancelled: string;
    pending_payment: string;
  }>(
    `select count(*)::text as total,
            count(*) filter (where starts_at >= now() and status in ('pending','confirmed','checked_in'))::text as upcoming,
            count(*) filter (where status = 'completed')::text as completed,
            count(*) filter (where status in ('cancelled','rejected','no_show'))::text as cancelled,
            count(*) filter (where payment_status = 'pending' and status not in ('cancelled','rejected'))::text as pending_payment
       from appointments where patient_id = $1`,
    [patientId],
  );

  const upcoming = await many<{
    id: string;
    appointment_number: string;
    starts_at: Date;
    status: string;
    appointment_type: string;
    doctor_name: string;
    doctor_avatar: string | null;
    qualification: string;
    specialty: string | null;
    clinic_name: string | null;
    clinic_city: string | null;
    consultation_fee: string;
    payment_status: string;
  }>(
    `select a.id, a.appointment_number, a.starts_at, a.status, a.appointment_type,
            dp.full_name as doctor_name, dp.avatar_url as doctor_avatar, d.qualification,
            (select s.name from doctor_specialties ds join specialties s on s.id = ds.specialty_id
              where ds.doctor_id = d.id and ds.is_primary limit 1) as specialty,
            c.name as clinic_name, c.city as clinic_city, a.consultation_fee, a.payment_status
       from appointments a
       join doctors d on d.id = a.doctor_id
       join profiles dp on dp.id = d.profile_id
       left join clinics c on c.id = a.clinic_id
      where a.patient_id = $1 and a.starts_at >= now()
        and a.status in ('pending','confirmed','checked_in')
      order by a.starts_at asc limit 3`,
    [patientId],
  );

  const activity = await many<{ id: string; title: string; body: string; type: string; created_at: Date; read_at: Date | null }>(
    `select id, title, body, type, created_at, read_at from notifications
      where profile_id = $1 order by created_at desc limit 6`,
    [actor.id],
  );

  const counts = await one<{ prescriptions: string; records: string; reviews: string }>(
    `select
       (select count(*)::text from prescriptions where patient_id = $1) as prescriptions,
       (select count(*)::text from medical_records where patient_id = $1 and deleted_at is null) as records,
       (select count(*)::text from reviews where patient_id = $1) as reviews`,
    [patientId],
  );

  return {
    stats: {
      total: Number(stats?.total ?? 0),
      upcoming: Number(stats?.upcoming ?? 0),
      completed: Number(stats?.completed ?? 0),
      cancelled: Number(stats?.cancelled ?? 0),
      pendingPayment: Number(stats?.pending_payment ?? 0),
    },
    upcoming: upcoming.map((row) => ({
      id: row.id,
      appointmentNumber: row.appointment_number,
      startsAt: row.starts_at,
      status: row.status,
      appointmentType: row.appointment_type,
      doctorName: row.doctor_name,
      doctorAvatar: row.doctor_avatar,
      qualification: row.qualification,
      specialty: row.specialty,
      clinicName: row.clinic_name,
      clinicCity: row.clinic_city,
      consultationFee: Number(row.consultation_fee),
      paymentStatus: row.payment_status,
    })),
    activity: activity.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      type: row.type,
      createdAt: row.created_at,
      read: Boolean(row.read_at),
    })),
    counts: {
      prescriptions: Number(counts?.prescriptions ?? 0),
      records: Number(counts?.records ?? 0),
      reviews: Number(counts?.reviews ?? 0),
    },
  };
}

export async function listPatients(params: { search?: string; id?: string; limit: number; offset: number }) {
  const values: unknown[] = [];
  let where = '';
  if (params.id) {
    values.push(params.id);
    where = `where pt.id = $1`;
  } else if (params.search) {
    values.push(`%${params.search}%`);
    where = `where (p.full_name ilike $1 or p.email ilike $1 or p.phone ilike $1)`;
  }
  const totalRow = await one<{ count: string }>(
    `select count(*)::text as count from patients pt join profiles p on p.id = pt.profile_id ${where}`,
    values,
  );
  values.push(params.limit, params.offset);
  const rows = await many<{
    id: string;
    profile_id: string;
    full_name: string;
    email: string;
    phone: string | null;
    gender: string | null;
    date_of_birth: Date | null;
    created_at: Date;
    appointments: string;
    last_visit: Date | null;
  }>(
    `select pt.id, pt.profile_id, p.full_name, p.email, p.phone, pt.gender, pt.date_of_birth, p.created_at,
            count(a.id)::text as appointments,
            max(a.starts_at) filter (where a.status = 'completed') as last_visit
       from patients pt
       join profiles p on p.id = pt.profile_id
       left join appointments a on a.patient_id = pt.id
       ${where}
      group by pt.id, p.id
      order by p.created_at desc
      limit $${values.length - 1} offset $${values.length}`,
    values,
  );

  return {
    items: rows.map((row) => ({
      id: row.id,
      profileId: row.profile_id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      gender: row.gender,
      dateOfBirth: row.date_of_birth ? new Date(row.date_of_birth).toISOString().slice(0, 10) : null,
      memberSince: row.created_at,
      appointments: Number(row.appointments),
      lastVisit: row.last_visit,
    })),
    total: Number(totalRow?.count ?? 0),
  };
}

export async function listDoctorPatients(
  doctorId: string,
  params: { search?: string; limit: number; offset: number },
) {
  const values: unknown[] = [doctorId];
  let searchClause = '';
  if (params.search) {
    values.push(`%${params.search}%`);
    searchClause = `and (p.full_name ilike $2 or p.email ilike $2 or p.phone ilike $2)`;
  }

  const totalRow = await one<{ count: string }>(
    `select count(distinct pt.id)::text as count
       from patients pt
       join profiles p on p.id = pt.profile_id
       join appointments a on a.patient_id = pt.id and a.doctor_id = $1
      where true ${searchClause}`,
    values,
  );

  values.push(params.limit, params.offset);
  const rows = await many<{
    id: string;
    profile_id: string;
    full_name: string;
    email: string;
    phone: string | null;
    gender: string | null;
    date_of_birth: Date | null;
    created_at: Date;
    appointments: string;
    last_visit: Date | null;
    next_visit: Date | null;
  }>(
    `select pt.id, pt.profile_id, p.full_name, p.email, p.phone, pt.gender, pt.date_of_birth, p.created_at,
            count(a.id)::text as appointments,
            max(a.starts_at) filter (where a.status = 'completed') as last_visit,
            min(a.starts_at) filter (where a.starts_at > now() and a.status in ('pending','confirmed','checked_in')) as next_visit
       from patients pt
       join profiles p on p.id = pt.profile_id
       join appointments a on a.patient_id = pt.id and a.doctor_id = $1
      where true ${searchClause}
      group by pt.id, p.id
      order by max(a.starts_at) desc
      limit $${values.length - 1} offset $${values.length}`,
    values,
  );

  return {
    items: rows.map((row) => ({
      id: row.id,
      profileId: row.profile_id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      gender: row.gender,
      dateOfBirth: row.date_of_birth ? new Date(row.date_of_birth).toISOString().slice(0, 10) : null,
      memberSince: row.created_at,
      appointments: Number(row.appointments),
      lastVisit: row.last_visit,
      nextVisit: row.next_visit,
    })),
    total: Number(totalRow?.count ?? 0),
  };
}

export async function getPatientClinicalView(patientId: string, actor: AuthUser) {
  if (actor.role === 'patient') {
    if (!actor.patientId || actor.patientId !== patientId) {
      throw Errors.forbidden('You can only view your own clinical record');
    }
  }
  if (actor.role === 'receptionist') {
    throw Errors.forbidden('Clinical records are restricted to clinical staff and the patient');
  }

  let doctorId: string | null = null;
  if (actor.role === 'doctor') {
    doctorId = actor.doctorId ?? null;
    if (!doctorId) throw Errors.forbidden();
    const relationship = await one<{ exists: boolean }>(
      'select exists(select 1 from appointments where patient_id = $1 and doctor_id = $2) as exists',
      [patientId, doctorId],
    );
    if (!relationship?.exists) throw Errors.forbidden('You do not have a clinical relationship with this patient');
  }

  const patient = await one<{
    id: string;
    profile_id: string;
    full_name: string;
    email: string;
    phone: string | null;
    avatar_url: string | null;
    date_of_birth: Date | null;
    gender: string | null;
    blood_group: string | null;
    emergency_contact: string | null;
    address: string | null;
  }>(
    `select pt.id, pt.profile_id, p.full_name, p.email, p.phone, p.avatar_url,
            pt.date_of_birth, pt.gender, pt.blood_group, pt.emergency_contact, pt.address
       from patients pt join profiles p on p.id = pt.profile_id where pt.id = $1`,
    [patientId],
  );
  if (!patient) throw Errors.notFound('Patient');

  const history = await many<{
    id: string;
    appointment_number: string;
    starts_at: Date;
    status: string;
    reason: string | null;
    doctor_name: string;
    specialty: string | null;
  }>(
    `select a.id, a.appointment_number, a.starts_at, a.status, a.reason, dp.full_name as doctor_name,
            (select s.name from doctor_specialties ds join specialties s on s.id = ds.specialty_id
              where ds.doctor_id = d.id and ds.is_primary limit 1) as specialty
       from appointments a
       join doctors d on d.id = a.doctor_id
       join profiles dp on dp.id = d.profile_id
      where a.patient_id = $1 ${doctorId ? 'and a.doctor_id = $2' : ''}
      order by a.starts_at desc limit 25`,
    doctorId ? [patientId, doctorId] : [patientId],
  );

  const records = await many<{
    id: string;
    file_name: string;
    file_type: string;
    file_size: number;
    record_type: string;
    created_at: Date;
  }>(
    `select id, file_name, file_type, file_size, record_type, created_at
       from medical_records where patient_id = $1 and deleted_at is null
      order by created_at desc limit 25`,
    [patientId],
  );

  const prescriptions = await many<{
    id: string;
    prescription_number: string;
    diagnosis: string;
    created_at: Date;
    doctor_name: string;
  }>(
    `select pr.id, pr.prescription_number, pr.diagnosis, pr.created_at, dp.full_name as doctor_name
       from prescriptions pr join doctors d on d.id = pr.doctor_id join profiles dp on dp.id = d.profile_id
      where pr.patient_id = $1 ${doctorId ? 'and pr.doctor_id = $2' : ''}
      order by pr.created_at desc limit 25`,
    doctorId ? [patientId, doctorId] : [patientId],
  );

  return {
    patient: {
      id: patient.id,
      profileId: patient.profile_id,
      fullName: patient.full_name,
      email: patient.email,
      phone: patient.phone,
      avatarUrl: patient.avatar_url,
      dateOfBirth: patient.date_of_birth ? new Date(patient.date_of_birth).toISOString().slice(0, 10) : null,
      gender: patient.gender,
      bloodGroup: patient.blood_group,
      emergencyContact: patient.emergency_contact,
      address: patient.address,
    },
    history: history.map((h) => ({
      id: h.id,
      appointmentNumber: h.appointment_number,
      startsAt: h.starts_at,
      status: h.status,
      reason: h.reason,
      doctorName: h.doctor_name,
      specialty: h.specialty,
    })),
    records: records.map((r) => ({
      id: r.id,
      fileName: r.file_name,
      fileType: r.file_type,
      fileSize: r.file_size,
      recordType: r.record_type,
      createdAt: r.created_at,
    })),
    prescriptions: prescriptions.map((p) => ({
      id: p.id,
      prescriptionNumber: p.prescription_number,
      diagnosis: p.diagnosis,
      createdAt: p.created_at,
      doctorName: p.doctor_name,
    })),
  };
}
