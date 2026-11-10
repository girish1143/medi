import { PoolClient } from 'pg';
import { many, one, query } from '../config/database';
import { AuthUser, UserRole } from '../types/express';

interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  avatar_url: string | null;
  is_active: boolean;
  patient_id: string | null;
  doctor_id: string | null;
  verification_status: string | null;
}

const PROFILE_SELECT = `
  select p.id, p.full_name, p.email, p.phone, p.role, p.avatar_url, p.is_active,
         pt.id as patient_id, d.id as doctor_id, d.verification_status
    from profiles p
    left join patients pt on pt.profile_id = p.id
    left join doctors d on d.profile_id = p.id
`;

export async function findProfileById(id: string): Promise<AuthUser | null> {
  const row = await one<ProfileRow>(`${PROFILE_SELECT} where p.id = $1`, [id]);
  return row ? mapProfile(row) : null;
}

export async function findProfileByEmail(email: string): Promise<ProfileRow | null> {
  return one<ProfileRow>(`${PROFILE_SELECT} where lower(p.email) = lower($1)`, [email]);
}

export async function emailExists(email: string): Promise<boolean> {
  const row = await one<{ exists: boolean }>(
    'select exists(select 1 from profiles where lower(email) = lower($1)) as exists',
    [email],
  );
  return Boolean(row?.exists);
}

export async function updateProfileRow(
  id: string,
  patch: Record<string, unknown>,
  client?: PoolClient,
): Promise<void> {
  const allowed = ['full_name', 'phone', 'avatar_url'];
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      values.push(patch[key]);
      fields.push(`${key} = $${values.length}`);
    }
  }
  if (!fields.length) return;
  values.push(id);
  const sql = `update profiles set ${fields.join(', ')} where id = $${values.length}`;
  if (client) await client.query(sql, values);
  else await query(sql, values);
}

export async function listProfiles(params: {
  role?: string;
  search?: string;
  limit: number;
  offset: number;
}): Promise<{ rows: AuthUser[]; total: number }> {
  const where: string[] = [];
  const values: unknown[] = [];
  if (params.role) {
    values.push(params.role);
    where.push(`p.role = $${values.length}`);
  }
  if (params.search) {
    values.push(`%${params.search}%`);
    where.push(`(p.full_name ilike $${values.length} or p.email ilike $${values.length} or p.phone ilike $${values.length})`);
  }
  const clause = where.length ? `where ${where.join(' and ')}` : '';

  const totalRow = await one<{ count: string }>(
    `select count(*)::text as count from profiles p ${clause}`,
    values,
  );

  values.push(params.limit, params.offset);
  const rows = await many<ProfileRow>(
    `${PROFILE_SELECT} ${clause}
     order by p.created_at desc
     limit $${values.length - 1} offset $${values.length}`,
    values,
  );

  return { rows: rows.map(mapProfile), total: Number(totalRow?.count ?? 0) };
}

function mapProfile(row: ProfileRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    fullName: row.full_name,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    isActive: row.is_active,
    patientId: row.patient_id,
    doctorId: row.doctor_id,
    doctorVerificationStatus: row.verification_status,
  };
}
