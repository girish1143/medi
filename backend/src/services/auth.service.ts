import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PoolClient } from 'pg';
import { env } from '../config/env';
import { one, query, withTransaction } from '../config/database';
import { AuthUser, RequestMeta } from '../types/express';
import { AppError, Errors } from '../utils/errors';
import { randomToken, sha256 } from '../utils/crypto';
import { emailExists, findProfileByEmail, findProfileById } from '../repositories/profile.repo';
import { getSupabaseAdmin, getSupabaseAnon } from '../integrations/supabase/client';
import { notify } from './notification.service';
import { writeAudit } from './audit.service';
import { logger } from '../config/logger';

export const ACCESS_COOKIE = 'mb_access';
export const REFRESH_COOKIE = 'mb_refresh';

export interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
}

export interface SessionResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

interface LocalCredentialRow {
  id: string;
  password_hash: string;
  is_active: boolean;
}

function signAccessToken(profile: AuthUser): string {
  return jwt.sign({ sub: profile.id, role: profile.role, type: 'access' }, env.JWT_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
}

async function createLocalSession(
  profile: AuthUser,
  meta: RequestMeta,
  client?: PoolClient,
): Promise<{ accessToken: string; refreshToken: string }> {
  const refreshToken = randomToken(48);
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const sql = `insert into auth_sessions (profile_id, refresh_token_hash, auth_provider, user_agent, ip_address, expires_at)
               values ($1, $2, 'local', $3, $4, $5)`;
  const params = [profile.id, sha256(refreshToken), meta.userAgent ?? null, meta.ip ?? null, expiresAt];
  if (client) await client.query(sql, params);
  else await query(sql, params);
  return { accessToken: signAccessToken(profile), refreshToken };
}

async function sendWelcome(profile: AuthUser): Promise<void> {
  void notify({
    profileId: profile.id,
    type: 'welcome',
    title: 'Welcome to MediBook',
    body: 'Your MediBook account is ready. You can now find verified doctors and book appointments in seconds.',
    email: true,
    dedupeKey: `welcome:${profile.id}`,
  });
}

export async function register(input: RegisterInput, meta: RequestMeta): Promise<SessionResult> {
  if (await emailExists(input.email)) {
    throw Errors.conflict('An account with this email already exists', 'EMAIL_IN_USE');
  }

  if (env.AUTH_PROVIDER === 'supabase') {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName, phone: input.phone },
    });
    if (error || !data.user) {
      throw new AppError(400, 'SIGNUP_FAILED', error?.message ?? 'Unable to create account');
    }

    try {
      await withTransaction(async (client) => {
        await client.query(
          `insert into profiles (id, full_name, email, phone, role) values ($1, $2, $3, $4, 'patient')`,
          [data.user.id, input.fullName, input.email.toLowerCase(), input.phone ?? null],
        );
        await client.query('insert into patients (profile_id) values ($1)', [data.user.id]);
      });
    } catch (error) {
      await admin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
      throw error;
    }

    const anon = getSupabaseAnon();
    const signIn = await anon.auth.signInWithPassword({ email: input.email, password: input.password });
    if (signIn.error || !signIn.data.session) {
      throw new AppError(500, 'SESSION_FAILED', 'Account created, but sign-in failed. Please log in.');
    }

    const profile = await findProfileById(data.user.id);
    if (!profile) throw Errors.notFound('Profile');
    await writeAudit({ actorId: profile.id, actorRole: profile.role, action: 'auth.register', ip: meta.ip });
    await sendWelcome(profile);

    return {
      user: profile,
      accessToken: signIn.data.session.access_token,
      refreshToken: signIn.data.session.refresh_token,
    };
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const profileId = await withTransaction(async (client) => {
    const inserted = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [input.email.toLowerCase()],
    );
    const id = inserted.rows[0].id;
    await client.query(
      `insert into profiles (id, full_name, email, phone, role) values ($1, $2, $3, $4, 'patient')`,
      [id, input.fullName, input.email.toLowerCase(), input.phone ?? null],
    );
    await client.query('insert into patients (profile_id) values ($1)', [id]);
    await client.query('insert into dev_credentials (profile_id, password_hash) values ($1, $2)', [id, passwordHash]);
    return id;
  });

  const profile = await findProfileById(profileId);
  if (!profile) throw Errors.notFound('Profile');
  const tokens = await createLocalSession(profile, meta);

  await writeAudit({ actorId: profile.id, actorRole: profile.role, action: 'auth.register', ip: meta.ip });
  await sendWelcome(profile);

  return { user: profile, ...tokens };
}

export async function login(email: string, password: string, meta: RequestMeta): Promise<SessionResult> {
  if (env.AUTH_PROVIDER === 'supabase') {
    const anon = getSupabaseAnon();
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) throw Errors.invalidCredentials();

    const profile = await findProfileById(data.user.id);
    if (!profile) throw Errors.invalidCredentials();
    if (!profile.isActive) throw Errors.forbidden('This account has been suspended');

    await query('update profiles set last_login_at = now() where id = $1', [profile.id]);
    await writeAudit({ actorId: profile.id, actorRole: profile.role, action: 'auth.login', ip: meta.ip });

    return {
      user: profile,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  }

  const row = await one<LocalCredentialRow>(
    `select p.id, p.is_active, dc.password_hash
       from profiles p join dev_credentials dc on dc.profile_id = p.id
      where lower(p.email) = lower($1)`,
    [email],
  );
  if (!row) throw Errors.invalidCredentials();

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) throw Errors.invalidCredentials();
  if (!row.is_active) throw Errors.forbidden('This account has been suspended');

  const profile = await findProfileById(row.id);
  if (!profile) throw Errors.invalidCredentials();

  await query('update profiles set last_login_at = now() where id = $1', [profile.id]);
  const tokens = await createLocalSession(profile, meta);
  await writeAudit({ actorId: profile.id, actorRole: profile.role, action: 'auth.login', ip: meta.ip });

  return { user: profile, ...tokens };
}

export async function refreshSession(refreshToken: string | undefined, meta: RequestMeta): Promise<SessionResult> {
  if (!refreshToken) throw Errors.unauthorized('Session expired');

  if (env.AUTH_PROVIDER === 'supabase') {
    const { data, error } = await getSupabaseAnon().auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session || !data.user) throw Errors.unauthorized('Session expired');
    const profile = await findProfileById(data.user.id);
    if (!profile || !profile.isActive) throw Errors.unauthorized('Session expired');
    return {
      user: profile,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  }

  const hash = sha256(refreshToken);
  const session = await one<{ id: string; profile_id: string; expires_at: Date; revoked_at: Date | null }>(
    'select id, profile_id, expires_at, revoked_at from auth_sessions where refresh_token_hash = $1',
    [hash],
  );
  if (!session || session.revoked_at || new Date(session.expires_at) < new Date()) {
    throw Errors.unauthorized('Session expired');
  }

  const profile = await findProfileById(session.profile_id);
  if (!profile || !profile.isActive) throw Errors.unauthorized('Session expired');

  await query('update auth_sessions set revoked_at = now() where id = $1', [session.id]);
  const tokens = await createLocalSession(profile, meta);
  return { user: profile, ...tokens };
}

export async function logout(refreshToken: string | undefined, accessToken: string | undefined): Promise<void> {
  if (env.AUTH_PROVIDER === 'supabase') {
    if (accessToken) {
      await getSupabaseAdmin().auth.admin.signOut(accessToken).catch(() => undefined);
    }
    return;
  }
  if (refreshToken) {
    await query('update auth_sessions set revoked_at = now() where refresh_token_hash = $1 and revoked_at is null', [
      sha256(refreshToken),
    ]);
  }
}

export async function requestPasswordReset(
  email: string,
  meta: RequestMeta,
): Promise<{ devResetUrl?: string }> {
  if (env.AUTH_PROVIDER === 'supabase') {
    await getSupabaseAnon().auth.resetPasswordForEmail(email, {
      redirectTo: `${env.FRONTEND_URL}/reset-password`,
    });
    return {};
  }

  const profile = await findProfileByEmail(email);
  // Always return the same response to avoid account enumeration.
  if (!profile) return {};

  const token = randomToken(32);
  const expires = new Date(Date.now() + 30 * 60 * 1000);
  await query(
    'insert into dev_password_resets (profile_id, token_hash, expires_at) values ($1, $2, $3)',
    [profile.id, sha256(token), expires],
  );

  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
  await notify({
    profileId: profile.id,
    type: 'password_reset',
    title: 'Reset your MediBook password',
    body: `Use this secure link to reset your password. It expires in 30 minutes: ${resetUrl}`,
    email: true,
    dedupeKey: `password_reset:${profile.id}:${Date.now()}`,
  });
  await writeAudit({ actorId: profile.id, actorRole: profile.role, action: 'auth.password_reset_requested', ip: meta.ip });

  return env.isProd ? {} : { devResetUrl: resetUrl };
}

export async function resetPassword(token: string, email: string, password: string): Promise<void> {
  if (env.AUTH_PROVIDER === 'supabase') {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.admin.listUsers();
    if (error) throw new AppError(500, 'RESET_FAILED', 'Unable to verify reset token');
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) throw Errors.validation('Invalid or expired reset token');
    const update = await admin.auth.admin.updateUserById(user.id, { password });
    if (update.error) throw Errors.validation('Unable to reset password');
    return;
  }

  const row = await one<{ id: string; profile_id: string }>(
    `select id, profile_id from dev_password_resets
      where token_hash = $1 and used_at is null and expires_at > now()`,
    [sha256(token)],
  );
  if (!row) throw Errors.validation('Invalid or expired reset token');

  const profile = await one<{ email: string }>('select email from profiles where id = $1', [row.profile_id]);
  if (!profile || profile.email.toLowerCase() !== email.toLowerCase()) {
    throw Errors.validation('Invalid or expired reset token');
  }

  const hash = await bcrypt.hash(password, 12);
  await withTransaction(async (client) => {
    await client.query('update dev_credentials set password_hash = $1 where profile_id = $2', [hash, row.profile_id]);
    await client.query('update dev_password_resets set used_at = now() where id = $1', [row.id]);
    await client.query('update auth_sessions set revoked_at = now() where profile_id = $1 and revoked_at is null', [
      row.profile_id,
    ]);
  });
}

export async function verifyOtp(email: string, token: string): Promise<void> {
  if (env.AUTH_PROVIDER === 'local') {
    // Local development registrations are confirmed immediately.
    return;
  }
  const { error } = await getSupabaseAnon().auth.verifyOtp({ email, token, type: 'signup' });
  if (error) throw Errors.validation(error.message);
}

export async function deleteUserSessions(profileId: string): Promise<void> {
  await query('update auth_sessions set revoked_at = now() where profile_id = $1 and revoked_at is null', [profileId]);
}

export function logAuthError(context: string, error: unknown): void {
  logger.warn({ err: error, context }, 'Authentication flow error');
}

export const __testables = { signAccessToken, createLocalSession };
