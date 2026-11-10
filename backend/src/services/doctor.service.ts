import { many, one, withTransaction } from '../config/database';
import * as doctorRepo from '../repositories/doctor.repo';
import * as availability from './availability.service';
import { Errors } from '../utils/errors';
import { weekdayName } from '../utils/time';
import { updateProfileRow } from '../repositories/profile.repo';
import { writeAudit } from './audit.service';
import { invalidateSettingsCache } from '../utils/settings';

export interface DoctorSummaryDto {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  qualification: string;
  experienceYears: number;
  consultationFee: number;
  onlineConsultationFee: number | null;
  rating: number;
  totalReviews: number;
  languages: string[];
  specialties: string[];
  primarySpecialty: string | null;
  clinic: { id: string; name: string; area: string | null; city: string } | null;
  nextAvailableAt: string | null;
}

export function toDoctorSummary(row: doctorRepo.DoctorListRow, nextAvailableAt?: string | null): DoctorSummaryDto {
  return {
    id: row.id,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    qualification: row.qualification,
    experienceYears: row.experience_years,
    consultationFee: Number(row.consultation_fee),
    onlineConsultationFee: row.online_consultation_fee === null ? null : Number(row.online_consultation_fee),
    rating: Number(row.average_rating),
    totalReviews: row.total_reviews,
    languages: row.languages ?? [],
    specialties: row.specialties ?? [],
    primarySpecialty: row.primary_specialty,
    clinic: row.clinic_id
      ? { id: row.clinic_id, name: row.clinic_name!, area: row.clinic_area, city: row.clinic_city! }
      : null,
    nextAvailableAt: nextAvailableAt ?? null,
  };
}

export async function searchDoctors(filters: doctorRepo.DoctorFilters) {
  const { rows, total } = await doctorRepo.searchDoctors(filters);
  const nextMap = await availability.getNextAvailableForDoctors(rows.map((r) => r.id), 14);
  const items = rows.map((row) => toDoctorSummary(row, nextMap.get(row.id)?.startsAt ?? null));
  return { items, total };
}

export async function getDoctorProfile(id: string) {
  const detail = await doctorRepo.findDoctorDetail(id);
  if (!detail || !detail.is_active) throw Errors.notFound('Doctor');

  const [clinics, availabilityRows, reviews, stats, nextSlot] = await Promise.all([
    doctorRepo.listDoctorClinics(id),
    doctorRepo.listDoctorAvailability(id),
    doctorRepo.getDoctorReviews(id, 5, 0),
    one<{ completed: string; total: string }>(
      `select count(*) filter (where status = 'completed')::text as completed, count(*)::text as total
         from appointments where doctor_id = $1`,
      [id],
    ),
    availability.getNextAvailableSlot(id),
  ]);

  const ratingBreakdown = new Map(reviews.distribution.map((d) => [d.rating, Number(d.count)]));

  return {
    ...toDoctorSummary(detail, nextSlot?.startsAt ?? null),
    registrationNumber: detail.registration_number,
    biography: detail.biography,
    verifiedAt: detail.verified_at,
    clinics: clinics.map((c) => ({
      id: c.id,
      name: c.name,
      address: `${c.address_line1}${c.area ? `, ${c.area}` : ''}, ${c.city} ${c.pincode}`,
      city: c.city,
      phone: c.phone,
      consultationFee: c.consultation_fee === null ? Number(detail.consultation_fee) : Number(c.consultation_fee),
      isPrimary: c.is_primary,
    })),
    workingHours: availabilityRows.map((row) => ({
      weekday: row.weekday,
      weekdayName: weekdayName(row.weekday),
      startTime: row.start_time.slice(0, 5),
      endTime: row.end_time.slice(0, 5),
      slotMinutes: row.slot_minutes,
      breakStart: row.break_start?.slice(0, 5) ?? null,
      breakEnd: row.break_end?.slice(0, 5) ?? null,
    })),
    reviews: {
      total: reviews.total,
      items: reviews.rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        patientName: r.patient_name,
        appointmentNumber: r.appointment_number,
        createdAt: r.created_at,
      })),
      distribution: [5, 4, 3, 2, 1].map((rating) => ({ rating, count: ratingBreakdown.get(rating) ?? 0 })),
    },
    stats: {
      completedConsultations: Number(stats?.completed ?? 0),
      totalAppointments: Number(stats?.total ?? 0),
    },
  };
}

export async function getSpecialties() {
  return many<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    icon: string | null;
    doctor_count: number;
  }>(
    `select s.id, s.name, s.slug, s.description, s.icon,
            (select count(*)::int from doctor_specialties ds
              join doctors d on d.id = ds.doctor_id
              join profiles p on p.id = d.profile_id
             where ds.specialty_id = s.id and d.verification_status = 'verified'
               and d.is_active and p.is_active) as doctor_count
       from specialties s where s.is_active order by s.name`,
  );
}

export async function getSpecialtyBySlug(slug: string) {
  return one<{ id: string; name: string; slug: string; description: string | null; icon: string | null }>(
    'select id, name, slug, description, icon from specialties where slug = $1 and is_active = true',
    [slug],
  );
}

export async function updateDoctorOwnProfile(  profileId: string,
  input: {
    fullName?: string;
    phone?: string | null;
    qualification?: string;
    experienceYears?: number;
    biography?: string;
    consultationFee?: number;
    onlineConsultationFee?: number | null;
    languages?: string[];
  },
  actorId: string,
) {
  const doctor = await doctorRepo.findDoctorByProfileId(profileId);
  if (!doctor) throw Errors.notFound('Doctor profile');

  await withTransaction(async (client) => {
    if (input.fullName !== undefined || input.phone !== undefined) {
      await updateProfileRow(
        profileId,
        { full_name: input.fullName, phone: input.phone },
        client,
      );
    }
    await doctorRepo.updateDoctorRecord(
      doctor.id,
      {
        qualification: input.qualification,
        experience_years: input.experienceYears,
        biography: input.biography,
        consultation_fee: input.consultationFee,
        online_consultation_fee: input.onlineConsultationFee,
        languages: input.languages,
      },
      client as unknown as { query: typeof import('../config/database').query },
    );
  });

  await writeAudit({
    actorId,
    actorRole: 'doctor',
    action: 'doctor.profile_updated',
    entityType: 'doctor',
    entityId: doctor.id,
  });

  return getDoctorProfile(doctor.id);
}

export interface AvailabilityInput {
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  breakStart?: string | null;
  breakEnd?: string | null;
  isActive?: boolean;
}

export async function replaceAvailability(doctorId: string, slots: AvailabilityInput[], actorId: string) {
  // Validate overlaps per weekday.
  const byWeekday = new Map<number, AvailabilityInput[]>();
  for (const slot of slots) {
    const list = byWeekday.get(slot.weekday) ?? [];
    list.push(slot);
    byWeekday.set(slot.weekday, list);
  }
  for (const [weekday, rows] of byWeekday) {
    const sorted = [...rows].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].startTime < sorted[i - 1].endTime) {
        throw Errors.validation(`Overlapping availability blocks on ${weekdayName(weekday)}`);
      }
    }
  }

  await withTransaction(async (client) => {
    await client.query('delete from doctor_availability where doctor_id = $1', [doctorId]);
    for (const slot of slots) {
      await client.query(
        `insert into doctor_availability
           (doctor_id, weekday, start_time, end_time, slot_minutes, break_start, break_end, is_active)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          doctorId,
          slot.weekday,
          slot.startTime,
          slot.endTime,
          slot.slotMinutes,
          slot.breakStart ?? null,
          slot.breakEnd ?? null,
          slot.isActive ?? true,
        ],
      );
    }
  });

  await writeAudit({
    actorId,
    actorRole: 'doctor',
    action: 'doctor.availability_updated',
    entityType: 'doctor',
    entityId: doctorId,
    metadata: { blocks: slots.length },
  });
  invalidateSettingsCache();

  return doctorRepo.listDoctorAvailability(doctorId);
}

export async function addTimeOff(
  doctorId: string,
  input: { startsAt: string; endsAt: string; reason?: string },
  actorId: string,
) {
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw Errors.validation('Invalid leave dates');
  }
  if (endsAt <= startsAt) throw Errors.validation('Leave end must be after start');
  if (endsAt <= new Date()) throw Errors.validation('Leave must end in the future');

  const row = await one<{ id: string }>(
    `insert into doctor_time_off (doctor_id, starts_at, ends_at, reason, created_by)
     values ($1, $2, $3, $4, $5) returning id`,
    [doctorId, startsAt, endsAt, input.reason ?? null, actorId],
  );
  await writeAudit({
    actorId,
    actorRole: 'doctor',
    action: 'doctor.time_off_added',
    entityType: 'doctor',
    entityId: doctorId,
    metadata: { timeOffId: row?.id },
  });
  return row;
}

export async function removeTimeOff(doctorId: string, timeOffId: string, actorId: string) {
  const row = await one<{ id: string }>(
    'delete from doctor_time_off where id = $1 and doctor_id = $2 returning id',
    [timeOffId, doctorId],
  );
  if (!row) throw Errors.notFound('Leave');
  await writeAudit({
    actorId,
    actorRole: 'doctor',
    action: 'doctor.time_off_removed',
    entityType: 'doctor',
    entityId: doctorId,
    metadata: { timeOffId },
  });
}

export async function getDoctorSchedule(doctorId: string) {
  const [rows, timeOff] = await Promise.all([
    doctorRepo.listDoctorAvailability(doctorId),
    doctorRepo.listDoctorTimeOff(doctorId),
  ]);
  return {
    availability: rows.map((row) => ({
      id: row.id,
      weekday: row.weekday,
      weekdayName: weekdayName(row.weekday),
      startTime: row.start_time.slice(0, 5),
      endTime: row.end_time.slice(0, 5),
      slotMinutes: row.slot_minutes,
      breakStart: row.break_start?.slice(0, 5) ?? null,
      breakEnd: row.break_end?.slice(0, 5) ?? null,
      isActive: row.is_active,
    })),
    timeOff: timeOff.map((row) => ({
      id: row.id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      reason: row.reason,
    })),
  };
}

export async function updateDoctorAsAdmin(
  doctorId: string,
  input: {
    fullName?: string;
    phone?: string | null;
    qualification?: string;
    experienceYears?: number;
    biography?: string;
    consultationFee?: number;
    onlineConsultationFee?: number | null;
    languages?: string[];
  },
  actorId: string,
) {
  const detail = await doctorRepo.findDoctorDetail(doctorId);
  if (!detail) throw Errors.notFound('Doctor');

  await withTransaction(async (client) => {
    if (input.fullName !== undefined || input.phone !== undefined) {
      await updateProfileRow(detail.profile_id, { full_name: input.fullName, phone: input.phone }, client);
    }
    await doctorRepo.updateDoctorRecord(
      doctorId,
      {
        qualification: input.qualification,
        experience_years: input.experienceYears,
        biography: input.biography,
        consultation_fee: input.consultationFee,
        online_consultation_fee: input.onlineConsultationFee,
        languages: input.languages,
      },
      client as unknown as { query: typeof import('../config/database').query },
    );
  });

  await writeAudit({
    actorId,
    actorRole: 'admin',
    action: 'admin.doctor_updated',
    entityType: 'doctor',
    entityId: doctorId,
  });
  return getDoctorProfile(doctorId);
}
