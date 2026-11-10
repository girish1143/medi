import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { many, one, query, withTransaction } from '../config/database';
import { env } from '../config/env';
import { AuthUser } from '../types/express';
import { AppError, Errors } from '../utils/errors';
import * as profileRepo from '../repositories/profile.repo';
import * as paymentRepo from '../repositories/payment.repo';
import { getSettings, invalidateSettingsCache, DEFAULT_SETTINGS, PlatformSettings } from '../utils/settings';
import { writeAudit } from './audit.service';
import { notify } from './notification.service';
import { getSupabaseAdmin } from '../integrations/supabase/client';
import { getAdminDashboard } from './dashboard.service';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export async function listUsers(params: { role?: string; search?: string; limit: number; offset: number }) {
  const { rows, total } = await profileRepo.listProfiles(params);
  return { items: rows, total };
}

export async function listDoctorsAdmin(params: {
  status?: string;
  search?: string;
  limit: number;
  offset: number;
}) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (params.status) {
    values.push(params.status);
    clauses.push(`d.verification_status = $${values.length}`);
  }
  if (params.search) {
    values.push(`%${params.search}%`);
    clauses.push(`(p.full_name ilike $${values.length} or p.email ilike $${values.length} or d.registration_number ilike $${values.length})`);
  }
  const where = clauses.length ? `where ${clauses.join(' and ')}` : '';

  const totalRow = await one<{ count: string }>(
    `select count(*)::text as count from doctors d join profiles p on p.id = d.profile_id ${where}`,
    values,
  );

  values.push(params.limit, params.offset);
  const rows = await many<{
    id: string;
    profile_id: string;
    full_name: string;
    email: string;
    phone: string | null;
    avatar_url: string | null;
    registration_number: string;
    qualification: string;
    experience_years: number;
    consultation_fee: string;
    verification_status: string;
    is_active: boolean;
    average_rating: string;
    total_reviews: number;
    created_at: Date;
    specialty: string | null;
    appointments: string;
    revenue: string;
  }>(
    `select d.id, p.id as profile_id, p.full_name, p.email, p.phone, p.avatar_url, d.registration_number,
            d.qualification, d.experience_years, d.consultation_fee, d.verification_status::text,
            d.is_active, d.average_rating::text, d.total_reviews, d.created_at,
            (select s.name from doctor_specialties ds join specialties s on s.id = ds.specialty_id
              where ds.doctor_id = d.id and ds.is_primary limit 1) as specialty,
            (select count(*)::text from appointments a where a.doctor_id = d.id) as appointments,
            coalesce((select sum(pay.amount) from payments pay
              join appointments a on a.id = pay.appointment_id
              where a.doctor_id = d.id and pay.status in ('captured','partially_refunded')), 0)::text as revenue
       from doctors d join profiles p on p.id = d.profile_id
       ${where}
      order by d.created_at desc limit $${values.length - 1} offset $${values.length}`,
    values,
  );

  return {
    items: rows.map((row) => ({
      id: row.id,
      profileId: row.profile_id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      avatarUrl: row.avatar_url,
      registrationNumber: row.registration_number,
      qualification: row.qualification,
      experienceYears: row.experience_years,
      consultationFee: Number(row.consultation_fee),
      verificationStatus: row.verification_status,
      isActive: row.is_active,
      rating: Number(row.average_rating),
      totalReviews: row.total_reviews,
      specialty: row.specialty,
      appointments: Number(row.appointments),
      revenue: Number(row.revenue),
      createdAt: row.created_at,
    })),
    total: Number(totalRow?.count ?? 0),
  };
}

export async function setDoctorVerification(
  doctorId: string,
  status: 'verified' | 'rejected' | 'suspended' | 'pending',
  note: string | undefined,
  actor: AuthUser,
) {
  const doctor = await one<{ profile_id: string; full_name: string; email: string }>(
    `select d.profile_id, p.full_name, p.email from doctors d join profiles p on p.id = d.profile_id where d.id = $1`,
    [doctorId],
  );
  if (!doctor) throw Errors.notFound('Doctor');

  const isActive = status === 'verified';
  await query(
    `update doctors
        set verification_status = $1::verification_status,
            is_active = $2,
            verified_at = case when $1 = 'verified' then now() else verified_at end,
            verified_by = $3
      where id = $4`,
    [status, isActive, actor.id, doctorId],
  );

  await notify({
    profileId: doctor.profile_id,
    type: 'doctor_verification',
    title:
      status === 'verified'
        ? 'Your MediBook profile is verified'
        : status === 'suspended'
          ? 'Your MediBook profile has been suspended'
          : 'Profile verification update',
    body:
      status === 'verified'
        ? 'Your profile is now live. Patients can find you and book appointments.'
        : `Your verification status is now ${status}. ${note ?? 'Please contact support for more information.'}`,
    email: true,
    dedupeKey: `doctor_verification:${doctorId}:${status}:${Date.now()}`,
  });

  await writeAudit({
    actorId: actor.id,
    actorRole: 'admin',
    action: 'admin.doctor_verification',
    entityType: 'doctor',
    entityId: doctorId,
    metadata: { status, note: note ?? null },
  });

  return { id: doctorId, verificationStatus: status, isActive };
}

export async function listPaymentsAdmin(params: paymentRepo.PaymentFilters) {
  const { rows, total } = await paymentRepo.listPayments(params);
  return {
    items: rows.map((row) => ({
      id: row.id,
      appointmentId: row.appointment_id,
      appointmentNumber: row.appointment_number,
      patientName: row.patient_name,
      doctorName: row.doctor_name,
      amount: Number(row.amount),
      currency: row.currency,
      provider: row.payment_provider,
      providerPaymentId: row.provider_payment_id,
      status: row.status,
      appointmentStatus: row.appointment_status,
      paidAt: row.paid_at,
      createdAt: row.created_at,
    })),
    total,
  };
}

export async function listRefundsAdmin(limit: number, offset: number) {
  const { rows, total } = await paymentRepo.listRefunds(limit, offset);
  return {
    items: rows.map((row) => ({
      id: row.id,
      amount: Number(row.amount),
      reason: row.reason,
      status: row.status,
      providerRefundId: row.provider_refund_id,
      appointmentNumber: row.appointment_number,
      patientName: row.patient_name,
      createdAt: row.created_at,
      processedAt: row.processed_at,
    })),
    total,
  };
}

export async function getPlatformSettings() {
  const settings = await getSettings(true);
  const rows = await many<{ key: string; description: string | null; updated_at: Date }>(
    'select key, description, updated_at from platform_settings order by key',
  );
  return {
    settings,
    meta: rows.map((r) => ({ key: r.key, description: r.description, updatedAt: r.updated_at })),
  };
}

export async function updatePlatformSettings(patch: Partial<PlatformSettings>, actor: AuthUser) {
  const allowed = new Set(Object.keys(DEFAULT_SETTINGS));
  const entries = Object.entries(patch).filter(([key, value]) => allowed.has(key) && value !== undefined);
  if (!entries.length) throw Errors.validation('No valid settings provided');

  for (const [key, value] of entries) {
    await query(
      `insert into platform_settings (key, value, updated_by)
       values ($1, $2::jsonb, $3)
       on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
      [key, JSON.stringify(value), actor.id],
    );
  }
  invalidateSettingsCache();

  await writeAudit({
    actorId: actor.id,
    actorRole: 'admin',
    action: 'admin.settings_updated',
    entityType: 'platform_settings',
    metadata: { keys: entries.map(([key]) => key) },
  });

  return getPlatformSettings();
}

export async function listAuditLogs(params: {
  action?: string;
  entityType?: string;
  limit: number;
  offset: number;
}) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (params.action) {
    values.push(`%${params.action}%`);
    clauses.push(`al.action ilike $${values.length}`);
  }
  if (params.entityType) {
    values.push(params.entityType);
    clauses.push(`al.entity_type = $${values.length}`);
  }
  const where = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const totalRow = await one<{ count: string }>(`select count(*)::text as count from audit_logs al ${where}`, values);
  values.push(params.limit, params.offset);
  const rows = await many<{
    id: string;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    actor_role: string | null;
    metadata: Record<string, unknown>;
    ip_address: string | null;
    created_at: Date;
    actor_name: string | null;
  }>(
    `select al.id, al.action, al.entity_type, al.entity_id, al.actor_role::text, al.metadata,
            host(al.ip_address) as ip_address, al.created_at, p.full_name as actor_name
       from audit_logs al left join profiles p on p.id = al.actor_id
       ${where}
      order by al.created_at desc limit $${values.length - 1} offset $${values.length}`,
    values,
  );
  return {
    items: rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      actorRole: row.actor_role,
      actorName: row.actor_name,
      metadata: row.metadata,
      ipAddress: row.ip_address,
      createdAt: row.created_at,
    })),
    total: Number(totalRow?.count ?? 0),
  };
}

export async function listComplaints(limit: number, offset: number) {
  const rows = await many<{
    id: string;
    subject: string;
    description: string;
    status: string;
    resolution: string | null;
    created_at: Date;
    patient_name: string;
    patient_email: string;
    appointment_number: string | null;
  }>(
    `select c.id, c.subject, c.description, c.status::text, c.resolution, c.created_at,
            p.full_name as patient_name, p.email as patient_email, a.appointment_number
       from complaints c
       join profiles p on p.id = c.profile_id
       left join appointments a on a.id = c.appointment_id
      order by c.created_at desc limit $1 offset $2`,
    [limit, offset],
  );
  const totalRow = await one<{ count: string }>('select count(*)::text as count from complaints');
  return {
    items: rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      description: row.description,
      status: row.status,
      resolution: row.resolution,
      patientName: row.patient_name,
      patientEmail: row.patient_email,
      appointmentNumber: row.appointment_number,
      createdAt: row.created_at,
    })),
    total: Number(totalRow?.count ?? 0),
  };
}

export async function updateComplaint(
  id: string,
  input: { status: string; resolution?: string },
  actor: AuthUser,
) {
  const row = await one<{ id: string; profile_id: string }>(
    `update complaints set status = $1::complaint_status, resolution = $2,
            resolved_by = case when $1 in ('resolved','rejected') then $3 else resolved_by end
      where id = $4 returning id, profile_id`,
    [input.status, input.resolution ?? null, actor.id, id],
  );
  if (!row) throw Errors.notFound('Complaint');
  await notify({
    profileId: row.profile_id,
    type: 'complaint_update',
    title: 'Support request updated',
    body: `Your support request status is now ${input.status}. ${input.resolution ?? ''}`.trim(),
    email: true,
    dedupeKey: `complaint:${id}:${input.status}:${Date.now()}`,
  });
  await writeAudit({
    actorId: actor.id,
    actorRole: 'admin',
    action: 'admin.complaint_updated',
    entityType: 'complaint',
    entityId: id,
    metadata: { status: input.status },
  });
  return { id, status: input.status };
}

export async function listReviewsAdmin(limit: number, offset: number) {
  const rows = await many<{
    id: string;
    rating: number;
    comment: string | null;
    is_visible: boolean;
    created_at: Date;
    patient_name: string;
    doctor_name: string;
    appointment_number: string;
  }>(
    `select r.id, r.rating, r.comment, r.is_visible, r.created_at,
            pp.full_name as patient_name, dp.full_name as doctor_name, a.appointment_number
       from reviews r
       join patients pt on pt.id = r.patient_id
       join profiles pp on pp.id = pt.profile_id
       join doctors d on d.id = r.doctor_id
       join profiles dp on dp.id = d.profile_id
       join appointments a on a.id = r.appointment_id
      order by r.created_at desc limit $1 offset $2`,
    [limit, offset],
  );
  const totalRow = await one<{ count: string }>('select count(*)::text as count from reviews');
  return {
    items: rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      isVisible: row.is_visible,
      patientName: row.patient_name,
      doctorName: row.doctor_name,
      appointmentNumber: row.appointment_number,
      createdAt: row.created_at,
    })),
    total: Number(totalRow?.count ?? 0),
  };
}

export async function setReviewVisibility(id: string, isVisible: boolean, actor: AuthUser) {
  const row = await one<{ id: string }>('update reviews set is_visible = $1 where id = $2 returning id', [
    isVisible,
    id,
  ]);
  if (!row) throw Errors.notFound('Review');
  await writeAudit({
    actorId: actor.id,
    actorRole: 'admin',
    action: 'admin.review_moderated',
    entityType: 'review',
    entityId: id,
    metadata: { isVisible },
  });
  return { id, isVisible };
}

export async function createSpecialty(
  input: { name: string; description?: string; icon?: string },
  actor: AuthUser,
) {
  const slug = slugify(input.name);
  const row = await one<{ id: string }>(
    `insert into specialties (name, slug, description, icon) values ($1, $2, $3, $4) returning id`,
    [input.name, slug, input.description ?? null, input.icon ?? null],
  );
  await writeAudit({
    actorId: actor.id,
    actorRole: 'admin',
    action: 'admin.specialty_created',
    entityType: 'specialty',
    entityId: row?.id,
    metadata: { name: input.name },
  });
  return { id: row?.id, name: input.name, slug };
}

export async function updateSpecialty(
  id: string,
  input: { name?: string; description?: string; icon?: string; isActive?: boolean },
  actor: AuthUser,
) {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (input.name !== undefined) {
    values.push(input.name, slugify(input.name));
    fields.push(`name = $${values.length - 1}`, `slug = $${values.length}`);
  }
  if (input.description !== undefined) {
    values.push(input.description);
    fields.push(`description = $${values.length}`);
  }
  if (input.icon !== undefined) {
    values.push(input.icon);
    fields.push(`icon = $${values.length}`);
  }
  if (input.isActive !== undefined) {
    values.push(input.isActive);
    fields.push(`is_active = $${values.length}`);
  }
  if (!fields.length) throw Errors.validation('No changes provided');
  values.push(id);
  const row = await one<{ id: string }>(
    `update specialties set ${fields.join(', ')} where id = $${values.length} returning id`,
    values,
  );
  if (!row) throw Errors.notFound('Specialty');
  await writeAudit({
    actorId: actor.id,
    actorRole: 'admin',
    action: 'admin.specialty_updated',
    entityType: 'specialty',
    entityId: id,
  });
  return { id };
}

export async function listSpecialtiesAdmin() {
  return many<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    icon: string | null;
    is_active: boolean;
    doctor_count: number;
    created_at: string;
  }>(
    `select s.id, s.name, s.slug, s.description, s.icon, s.is_active, s.created_at,
            (select count(*)::int from doctor_specialties ds where ds.specialty_id = s.id) as doctor_count
       from specialties s order by s.name`,
  );
}

export async function listClinics() {
  return many<{
    id: string;
    name: string;
    address_line1: string;
    area: string | null;
    city: string;
    state: string;
    pincode: string;
    phone: string | null;
    is_active: boolean;
  }>(
    `select id, name, address_line1, area, city, state, pincode, phone, is_active
       from clinics order by name`,
  );
}

export async function createClinic(
  input: {
    name: string;
    addressLine1: string;
    area?: string;
    city: string;
    state: string;
    pincode: string;
    phone?: string;
    email?: string;
  },
  actor: AuthUser,
) {
  const row = await one<{ id: string }>(
    `insert into clinics (name, address_line1, area, city, state, pincode, phone, email)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [
      input.name,
      input.addressLine1,
      input.area ?? null,
      input.city,
      input.state,
      input.pincode,
      input.phone ?? null,
      input.email ?? null,
    ],
  );
  await writeAudit({
    actorId: actor.id,
    actorRole: 'admin',
    action: 'admin.clinic_created',
    entityType: 'clinic',
    entityId: row?.id,
    metadata: { name: input.name },
  });
  return { id: row?.id };
}

export async function updateClinic(
  id: string,
  input: {
    name?: string;
    addressLine1?: string;
    area?: string;
    city?: string;
    state?: string;
    pincode?: string;
    phone?: string;
    email?: string;
    isActive?: boolean;
  },
  actor: AuthUser,
) {
  const fields: string[] = [];
  const values: unknown[] = [];
  const push = (column: string, value: unknown) => {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  };
  if (input.name !== undefined) push('name', input.name);
  if (input.addressLine1 !== undefined) push('address_line1', input.addressLine1);
  if (input.area !== undefined) push('area', input.area);
  if (input.city !== undefined) push('city', input.city);
  if (input.state !== undefined) push('state', input.state);
  if (input.pincode !== undefined) push('pincode', input.pincode);
  if (input.phone !== undefined) push('phone', input.phone);
  if (input.email !== undefined) push('email', input.email);
  if (input.isActive !== undefined) push('is_active', input.isActive);
  if (!fields.length) throw Errors.validation('No changes provided');
  values.push(id);
  const row = await one<{ id: string }>(
    `update clinics set ${fields.join(', ')} where id = $${values.length} returning id`,
    values,
  );
  if (!row) throw Errors.notFound('Clinic');
  await writeAudit({
    actorId: actor.id,
    actorRole: 'admin',
    action: 'admin.clinic_updated',
    entityType: 'clinic',
    entityId: id,
    metadata: { isActive: input.isActive },
  });
  return { id };
}

async function createAuthIdentity(email: string, password: string, fullName: string, phone?: string) {
  if (env.AUTH_PROVIDER === 'supabase') {
    const created = await getSupabaseAdmin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone },
    });
    if (created.error || !created.data.user) {
      throw new AppError(400, 'USER_CREATE_FAILED', created.error?.message ?? 'Unable to create user');
    }
    return created.data.user.id;
  }
  const result = await query<{ id: string }>('insert into auth.users (email) values ($1) returning id', [email]);
  return result.rows[0].id;
}

export async function createDoctorAccount(
  input: {
    fullName: string;
    email: string;
    phone?: string;
    password?: string;
    qualification: string;
    registrationNumber: string;
    experienceYears: number;
    biography?: string;
    consultationFee: number;
    onlineConsultationFee?: number;
    languages?: string[];
    specialtyIds: string[];
    clinicIds?: string[];
  },
  actor: AuthUser,
) {
  if (await profileRepo.emailExists(input.email)) {
    throw Errors.conflict('An account with this email already exists', 'EMAIL_IN_USE');
  }
  if (!input.specialtyIds.length) throw Errors.validation('Select at least one specialty');

  const generated = !input.password;
  const password = input.password ?? `Mb${crypto.randomBytes(4).toString('hex')}!9`;
  const profileId = await createAuthIdentity(input.email, password, input.fullName, input.phone);
  const passwordHash = env.AUTH_PROVIDER === 'local' ? await bcrypt.hash(password, 10) : null;

  try {
    const doctorId = await withTransaction(async (client) => {
      await client.query(
        `insert into profiles (id, full_name, email, phone, role) values ($1, $2, $3, $4, 'doctor')`,
        [profileId, input.fullName, input.email.toLowerCase(), input.phone ?? null],
      );
      if (passwordHash) {
        await client.query('insert into dev_credentials (profile_id, password_hash) values ($1, $2)', [
          profileId,
          passwordHash,
        ]);
      }
      const inserted = await client.query<{ id: string }>(
        `insert into doctors (profile_id, registration_number, qualification, experience_years, biography,
                              languages, consultation_fee, online_consultation_fee, verification_status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'pending') returning id`,
        [
          profileId,
          input.registrationNumber,
          input.qualification,
          input.experienceYears,
          input.biography ?? null,
          input.languages ?? ['English', 'Hindi'],
          input.consultationFee,
          input.onlineConsultationFee ?? Math.round(input.consultationFee * 0.85),
        ],
      );
      const doctorId = inserted.rows[0].id;

      for (const [index, specialtyId] of input.specialtyIds.entries()) {
        await client.query(
          `insert into doctor_specialties (doctor_id, specialty_id, is_primary) values ($1, $2, $3)`,
          [doctorId, specialtyId, index === 0],
        );
      }
      for (const [index, clinicId] of (input.clinicIds ?? []).entries()) {
        await client.query(
          `insert into doctor_clinics (doctor_id, clinic_id, consultation_fee, is_primary) values ($1, $2, $3, $4)`,
          [doctorId, clinicId, input.consultationFee, index === 0],
        );
      }
      for (const weekday of [1, 2, 3, 4, 5, 6]) {
        await client.query(
          `insert into doctor_availability (doctor_id, weekday, start_time, end_time, slot_minutes, break_start, break_end)
           values ($1, $2, '09:00', '17:00', 30, '13:00', '14:00')`,
          [doctorId, weekday],
        );
      }
      return doctorId;
    });

    await writeAudit({
      actorId: actor.id,
      actorRole: 'admin',
      action: 'admin.doctor_created',
      entityType: 'doctor',
      entityId: doctorId,
      metadata: { email: input.email },
    });

    return {
      id: doctorId,
      profileId,
      email: input.email,
      temporaryPassword: generated ? password : null,
      verificationStatus: 'pending',
    };
  } catch (error) {
    if (env.AUTH_PROVIDER === 'supabase') {
      await getSupabaseAdmin().auth.admin.deleteUser(profileId).catch(() => undefined);
    }
    throw error;
  }
}

export async function analyticsOverview() {
  const dashboard = await getAdminDashboard();
  return {
    stats: dashboard.stats,
    daily: dashboard.daily,
    monthlyRevenue: dashboard.monthlyRevenue,
    statusDistribution: dashboard.statusDistribution,
    specialtyDistribution: dashboard.specialtyDistribution,
    topDoctors: dashboard.topDoctors,
  };
}

export async function updateUserRole(targetProfileId: string, role: string, actor: AuthUser) {
  if (targetProfileId === actor.id) throw Errors.validation('You cannot change your own role');
  if (!['patient', 'doctor', 'admin', 'receptionist'].includes(role)) {
    throw Errors.validation('Invalid role');
  }
  if (role === 'doctor') {
    throw Errors.validation('Create a doctor through the doctor onboarding flow to provision a clinical profile');
  }
  const row = await one<{ id: string }>('update profiles set role = $1::user_role where id = $2 returning id', [
    role,
    targetProfileId,
  ]);
  if (!row) throw Errors.notFound('User');
  if (role === 'receptionist' || role === 'admin') {
    await query(
      `insert into patients (profile_id) select $1 where $2 = 'patient' on conflict (profile_id) do nothing`,
      [targetProfileId, role],
    );
  }
  await writeAudit({
    actorId: actor.id,
    actorRole: 'admin',
    action: 'admin.user_role_updated',
    entityType: 'profile',
    entityId: targetProfileId,
    metadata: { role },
  });
  return { id: targetProfileId, role };
}
