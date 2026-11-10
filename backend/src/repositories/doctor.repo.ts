import { many, one, query } from '../config/database';

export interface DoctorListRow {
  id: string;
  full_name: string;
  avatar_url: string | null;
  qualification: string;
  experience_years: number;
  consultation_fee: string;
  online_consultation_fee: string | null;
  average_rating: string;
  total_reviews: number;
  languages: string[];
  specialties: string[];
  primary_specialty: string | null;
  primary_specialty_slug: string | null;
  clinic_id: string | null;
  clinic_name: string | null;
  clinic_area: string | null;
  clinic_city: string | null;
}

export interface DoctorFilters {
  q?: string;
  specialty?: string;
  city?: string;
  area?: string;
  minFee?: number;
  maxFee?: number;
  minExperience?: number;
  minRating?: number;
  availableToday?: boolean;
  consultationType?: 'in_clinic' | 'online';
  sort?: string;
  limit: number;
  offset: number;
}

const BASE = `
  select d.id, p.full_name, p.avatar_url, d.qualification, d.experience_years,
         d.consultation_fee, d.online_consultation_fee, d.average_rating, d.total_reviews, d.languages,
         coalesce((
           select array_agg(s.name order by s.name)
             from doctor_specialties ds join specialties s on s.id = ds.specialty_id
            where ds.doctor_id = d.id
         ), '{}') as specialties,
         (
           select s.name from doctor_specialties ds join specialties s on s.id = ds.specialty_id
            where ds.doctor_id = d.id and ds.is_primary limit 1
         ) as primary_specialty,
         (
           select s.slug from doctor_specialties ds join specialties s on s.id = ds.specialty_id
            where ds.doctor_id = d.id and ds.is_primary limit 1
         ) as primary_specialty_slug,
         pc.clinic_id, pc.clinic_name, pc.clinic_area, pc.clinic_city
    from doctors d
    join profiles p on p.id = d.profile_id
    left join lateral (
      select c.id as clinic_id, c.name as clinic_name, c.area as clinic_area, c.city as clinic_city
        from doctor_clinics dc join clinics c on c.id = dc.clinic_id
       where dc.doctor_id = d.id
       order by dc.is_primary desc, c.name
       limit 1
    ) pc on true
`;

const SORT_MAP: Record<string, string> = {
  rating: 'average_rating desc, total_reviews desc',
  fee_asc: 'consultation_fee asc',
  fee_desc: 'consultation_fee desc',
  experience: 'experience_years desc',
  name: 'full_name asc',
  next_available: 'average_rating desc',
};

function buildWhere(filters: DoctorFilters, params: unknown[]): string {
  const clauses = [
    "d.verification_status = 'verified'",
    'd.is_active = true',
    'p.is_active = true',
  ];

  if (filters.q) {
    params.push(`%${filters.q}%`);
    clauses.push(`(
      p.full_name ilike $${params.length}
      or d.qualification ilike $${params.length}
      or exists (
        select 1 from doctor_specialties ds join specialties s on s.id = ds.specialty_id
        where ds.doctor_id = d.id and s.name ilike $${params.length}
      )
    )`);
  }
  if (filters.specialty) {
    params.push(filters.specialty);
    clauses.push(`exists (
      select 1 from doctor_specialties ds join specialties s on s.id = ds.specialty_id
      where ds.doctor_id = d.id and s.slug = $${params.length}
    )`);
  }
  if (filters.city) {
    params.push(filters.city);
    clauses.push(`exists (
      select 1 from doctor_clinics dc join clinics c on c.id = dc.clinic_id
      where dc.doctor_id = d.id and lower(c.city) = lower($${params.length})
    )`);
  }
  if (filters.area) {
    params.push(`%${filters.area}%`);
    clauses.push(`exists (
      select 1 from doctor_clinics dc join clinics c on c.id = dc.clinic_id
      where dc.doctor_id = d.id and c.area ilike $${params.length}
    )`);
  }
  if (filters.minFee !== undefined) {
    params.push(filters.minFee);
    clauses.push(`d.consultation_fee >= $${params.length}`);
  }
  if (filters.maxFee !== undefined) {
    params.push(filters.maxFee);
    clauses.push(`d.consultation_fee <= $${params.length}`);
  }
  if (filters.minExperience !== undefined) {
    params.push(filters.minExperience);
    clauses.push(`d.experience_years >= $${params.length}`);
  }
  if (filters.minRating !== undefined) {
    params.push(filters.minRating);
    clauses.push(`d.average_rating >= $${params.length}`);
  }
  if (filters.availableToday) {
    params.push(new Date().getUTCDay());
    clauses.push(`exists (
      select 1 from doctor_availability da
      where da.doctor_id = d.id and da.is_active and da.weekday = $${params.length}
    )`);
  }
  if (filters.consultationType === 'online') {
    clauses.push('d.online_consultation_fee is not null');
  }
  if (filters.consultationType === 'in_clinic') {
    clauses.push('exists (select 1 from doctor_clinics dc where dc.doctor_id = d.id)');
  }

  return `where ${clauses.join(' and ')}`;
}

export async function searchDoctors(
  filters: DoctorFilters,
): Promise<{ rows: DoctorListRow[]; total: number }> {
  const params: unknown[] = [];
  const where = buildWhere(filters, params);
  const countRow = await one<{ count: string }>(
    `select count(*)::text as count from doctors d join profiles p on p.id = d.profile_id ${where}`,
    params,
  );

  const order = SORT_MAP[filters.sort ?? 'rating'] ?? SORT_MAP.rating;
  params.push(filters.limit, filters.offset);
  const rows = await many<DoctorListRow>(
    `${BASE} ${where} order by ${order} limit $${params.length - 1} offset $${params.length}`,
    params,
  );

  return { rows, total: Number(countRow?.count ?? 0) };
}

export async function findDoctorSummary(id: string): Promise<DoctorListRow | null> {
  return one<DoctorListRow>(
    `${BASE} where d.id = $1 and d.verification_status = 'verified' and d.is_active = true`,
    [id],
  );
}

export interface DoctorDetailRow extends DoctorListRow {
  profile_id: string;
  phone: string | null;
  biography: string | null;
  registration_number: string;
  verified_at: Date | null;
  verification_status: string;
  is_active: boolean;
  created_at: Date;
}

export async function findDoctorDetail(id: string): Promise<DoctorDetailRow | null> {
  return one<DoctorDetailRow>(
    `select d.id, p.full_name, p.avatar_url, p.phone, d.qualification, d.experience_years,
            d.consultation_fee, d.online_consultation_fee, d.average_rating, d.total_reviews, d.languages,
            d.biography, d.registration_number, d.verified_at, d.verification_status::text, d.is_active, d.created_at,
            p.id as profile_id,
            coalesce((
              select array_agg(s.name order by s.name) from doctor_specialties ds
              join specialties s on s.id = ds.specialty_id where ds.doctor_id = d.id
            ), '{}') as specialties,
            (select s.name from doctor_specialties ds join specialties s on s.id = ds.specialty_id
              where ds.doctor_id = d.id and ds.is_primary limit 1) as primary_specialty,
            (select s.slug from doctor_specialties ds join specialties s on s.id = ds.specialty_id
              where ds.doctor_id = d.id and ds.is_primary limit 1) as primary_specialty_slug,
            pc.clinic_id, pc.clinic_name, pc.clinic_area, pc.clinic_city
       from doctors d
       join profiles p on p.id = d.profile_id
       left join lateral (
         select c.id as clinic_id, c.name as clinic_name, c.area as clinic_area, c.city as clinic_city
           from doctor_clinics dc join clinics c on c.id = dc.clinic_id
          where dc.doctor_id = d.id order by dc.is_primary desc limit 1
       ) pc on true
      where d.id = $1`,
    [id],
  );
}

export async function listDoctorClinics(doctorId: string) {
  return many<{
    id: string;
    name: string;
    address_line1: string;
    area: string | null;
    city: string;
    state: string;
    pincode: string;
    phone: string | null;
    consultation_fee: string | null;
    is_primary: boolean;
  }>(
    `select c.id, c.name, c.address_line1, c.area, c.city, c.state, c.pincode, c.phone,
            dc.consultation_fee, dc.is_primary
       from doctor_clinics dc join clinics c on c.id = dc.clinic_id
      where dc.doctor_id = $1
      order by dc.is_primary desc, c.name`,
    [doctorId],
  );
}

export async function listDoctorAvailability(doctorId: string) {
  return many<{
    id: string;
    weekday: number;
    start_time: string;
    end_time: string;
    slot_minutes: number;
    break_start: string | null;
    break_end: string | null;
    is_active: boolean;
  }>(
    `select id, weekday, start_time, end_time, slot_minutes, break_start, break_end, is_active
       from doctor_availability where doctor_id = $1
      order by weekday, start_time`,
    [doctorId],
  );
}

export async function listDoctorTimeOff(doctorId: string, includePast = false) {
  return many<{ id: string; starts_at: Date; ends_at: Date; reason: string | null }>(
    `select id, starts_at, ends_at, reason from doctor_time_off
      where doctor_id = $1 ${includePast ? '' : 'and ends_at > now()'}
      order by starts_at`,
    [doctorId],
  );
}

export async function getDoctorReviews(doctorId: string, limit: number, offset: number) {
  const rows = await many<{
    id: string;
    rating: number;
    comment: string | null;
    created_at: Date;
    patient_name: string;
    appointment_number: string;
  }>(
    `select r.id, r.rating, r.comment, r.created_at,
            split_part(p.full_name, ' ', 1) || ' ' || left(split_part(p.full_name, ' ', 2), 1) || '.' as patient_name,
            a.appointment_number
       from reviews r
       join patients pt on pt.id = r.patient_id
       join profiles p on p.id = pt.profile_id
       join appointments a on a.id = r.appointment_id
      where r.doctor_id = $1 and r.is_visible = true
      order by r.created_at desc
      limit $2 offset $3`,
    [doctorId, limit, offset],
  );
  const totalRow = await one<{ count: string }>(
    'select count(*)::text as count from reviews where doctor_id = $1 and is_visible = true',
    [doctorId],
  );
  const distribution = await many<{ rating: number; count: string }>(
    `select rating, count(*)::text as count from reviews
      where doctor_id = $1 and is_visible = true group by rating order by rating desc`,
    [doctorId],
  );
  return { rows, total: Number(totalRow?.count ?? 0), distribution };
}

export async function updateDoctorRecord(
  doctorId: string,
  patch: {
    qualification?: string;
    experience_years?: number;
    biography?: string;
    consultation_fee?: number;
    online_consultation_fee?: number | null;
    languages?: string[];
  },
  client?: { query: typeof query },
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      values.push(value);
      fields.push(`${key} = $${values.length}`);
    }
  }
  if (!fields.length) return;
  values.push(doctorId);
  const sql = `update doctors set ${fields.join(', ')} where id = $${values.length}`;
  if (client) await client.query(sql, values);
  else await query(sql, values);
}

export async function findDoctorByProfileId(profileId: string) {
  return one<{ id: string; profile_id: string; consultation_fee: string; online_consultation_fee: string | null }>(
    'select id, profile_id, consultation_fee, online_consultation_fee from doctors where profile_id = $1',
    [profileId],
  );
}

export async function listDoctorPatients(doctorId: string) {
  return many<{
    id: string;
    profile_id: string;
    full_name: string;
    email: string;
    phone: string | null;
    gender: string | null;
    date_of_birth: Date | null;
    visits: number;
    last_visit: Date | null;
    next_visit: Date | null;
  }>(
    `select pt.id, pr.id as profile_id, pr.full_name, pr.email, pr.phone, pt.gender, pt.date_of_birth,
            count(a.id) filter (where a.status = 'completed')::int as visits,
            max(a.starts_at) filter (where a.status = 'completed') as last_visit,
            min(a.starts_at) filter (where a.starts_at > now() and a.status in ('pending','confirmed','checked_in')) as next_visit
       from appointments a
       join patients pt on pt.id = a.patient_id
       join profiles pr on pr.id = pt.profile_id
      where a.doctor_id = $1
      group by pt.id, pr.id
      order by max(a.starts_at) desc`,
    [doctorId],
  );
}
