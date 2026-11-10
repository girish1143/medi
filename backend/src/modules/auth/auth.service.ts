import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/database';
import {
  assertRateLimitNotLocked,
  clearRateLimit,
  LOGIN_RATE_POLICY,
  PASSWORD_RESET_RATE_POLICY,
  recordRateLimitFailure,
} from '../../middleware/rate-limiter';
import { hashPassword, verifyPassword } from '../../security/password';
import { generateOpaqueToken, hashToken } from '../../security/token-hash';
import type { UserRole } from '../../shared/constants';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../shared/errors';
import type { RequestAuditContext } from '../../shared/interfaces';
import { recordAuditLog } from '../audit-logs/audit-log.service';
import { SessionRepository } from '../sessions/session.repository';
import { SessionService, type IssuedTokenPair } from '../sessions/session.service';
import { AuthRepository } from './auth.repository';
import {
  changePasswordBodySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  registerDoctorBodySchema,
  registerHospitalBodySchema,
  registerPatientBodySchema,
  resetPasswordBodySchema,
  verifyEmailBodySchema,
} from './auth.validation';

export type TokenDispatcher = (payload: {
  email: string;
  purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
  rawToken: string;
}) => Promise<void> | void;

export class AuthService {
  private readonly repo: AuthRepository;
  private readonly sessionRepo: SessionRepository;
  private readonly sessionService: SessionService;
  private readonly dispatchToken: TokenDispatcher;

  constructor(
    private readonly db: PrismaClient = prisma,
    dispatchToken?: TokenDispatcher,
  ) {
    this.repo = new AuthRepository(db);
    this.sessionRepo = new SessionRepository(db);
    this.sessionService = new SessionService(db);
    this.dispatchToken = dispatchToken ?? (() => undefined);
  }

  async registerUnified(input: unknown, ctx: RequestAuditContext = {}) {
    const requestedRole =
      typeof input === 'object' && input !== null && 'role' in input
        ? String((input as { role?: unknown }).role ?? 'PATIENT').toUpperCase()
        : 'PATIENT';

    if (
      requestedRole !== 'PATIENT' &&
      requestedRole !== 'DOCTOR' &&
      requestedRole !== 'HOSPITAL'
    ) {
      throw new ForbiddenError(
        'PUBLIC_ROLE_RESTRICTED',
        'Public registration cannot assign administrative roles.',
      );
    }

    if (requestedRole === 'DOCTOR') {
      return this.registerDoctor(input, ctx);
    }
    if (requestedRole === 'HOSPITAL') {
      return this.registerHospital(input, ctx);
    }
    return this.registerPatient(input, ctx);
  }

  async registerPatient(input: unknown, ctx: RequestAuditContext = {}) {
    const data = registerPatientBodySchema.parse(input);

    const duplicate = await this.repo.findExistingContact(data.email, data.phone);
    if (duplicate) {
      throw new ConflictError('ACCOUNT_EXISTS', 'An account with this email or phone already exists.');
    }

    const passwordHash = await hashPassword(data.password);
    const { rawToken, tokenHash } = generateOpaqueToken(32);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const now = new Date();

    const user = await this.db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: data.email,
          phone: data.phone ?? null,
          fullName: data.fullName,
          passwordHash,
          role: 'PATIENT',
          accountStatus: 'PENDING_VERIFICATION',
          termsAcceptedAt: now,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          accountStatus: true,
          createdAt: true,
        },
      });

      await tx.patient.create({
        data: {
          userId: created.id,
          city: data.city ?? null,
          stateProvince: data.stateProvince ?? null,
          countryCode: data.countryCode ?? null,
        },
      });

      await this.repo.createEmailVerificationToken(created.id, tokenHash, expiresAt, tx);

      await recordAuditLog(
        {
          actorUserId: created.id,
          actorRole: 'PATIENT',
          action: 'PATIENT_REGISTERED',
          resourceType: 'User',
          resourceId: created.id,
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
          userAgentHash: ctx.userAgentHash,
        },
        tx,
      );

      return created;
    });

    await this.dispatchToken({ email: user.email, purpose: 'EMAIL_VERIFICATION', rawToken });
    return {
      user,
      ...(process.env.NODE_ENV === 'test' ? { verificationToken: rawToken } : {}),
    };
  }

  async registerDoctor(input: unknown, ctx: RequestAuditContext = {}) {
    const data = registerDoctorBodySchema.parse(input);

    const duplicate = await this.repo.findExistingContact(data.email, data.phone);
    if (duplicate) {
      throw new ConflictError('ACCOUNT_EXISTS', 'An account with this email or phone already exists.');
    }

    const duplicateLicense = await this.db.doctor.findUnique({
      where: {
        licenseCountryCode_medicalLicenseNumber: {
          licenseCountryCode: data.licenseCountryCode,
          medicalLicenseNumber: data.medicalLicenseNumber,
        },
      },
      select: { id: true },
    });
    if (duplicateLicense) {
      throw new ConflictError('LICENSE_EXISTS', 'This medical license number is already registered.');
    }

    const passwordHash = await hashPassword(data.password);
    const { rawToken, tokenHash } = generateOpaqueToken(32);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const now = new Date();

    const user = await this.db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: data.email,
          phone: data.phone,
          fullName: data.fullName,
          passwordHash,
          role: 'DOCTOR',
          accountStatus: 'PENDING_VERIFICATION',
          termsAcceptedAt: now,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          accountStatus: true,
          createdAt: true,
        },
      });

      const doctor = await tx.doctor.create({
        data: {
          userId: created.id,
          medicalLicenseNumber: data.medicalLicenseNumber,
          licensingAuthority: data.licensingAuthority,
          licenseCountryCode: data.licenseCountryCode,
          verificationStatus: 'PENDING',
          isAcceptingLeads: false,
          city: data.city,
          stateProvince: data.stateProvince,
          countryCode: data.countryCode,
        },
      });

      await tx.doctorSpecialization.create({
        data: {
          doctorId: doctor.id,
          specializationCode: data.specializationCode,
          specializationName: data.specializationName,
          isPrimary: true,
        },
      });

      await this.repo.createEmailVerificationToken(created.id, tokenHash, expiresAt, tx);

      await recordAuditLog(
        {
          actorUserId: created.id,
          actorRole: 'DOCTOR',
          action: 'DOCTOR_REGISTERED',
          resourceType: 'Doctor',
          resourceId: doctor.id,
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
          userAgentHash: ctx.userAgentHash,
        },
        tx,
      );

      return created;
    });

    await this.dispatchToken({ email: user.email, purpose: 'EMAIL_VERIFICATION', rawToken });
    return {
      user,
      ...(process.env.NODE_ENV === 'test' ? { verificationToken: rawToken } : {}),
    };
  }

  async registerHospital(input: unknown, ctx: RequestAuditContext = {}) {
    const data = registerHospitalBodySchema.parse(input);

    const duplicate = await this.repo.findExistingContact(data.email, data.phone);
    if (duplicate) {
      throw new ConflictError('ACCOUNT_EXISTS', 'An account with this email or phone already exists.');
    }

    const duplicateReg = await this.db.hospital.findUnique({
      where: {
        countryCode_registrationNumber: {
          countryCode: data.countryCode,
          registrationNumber: data.registrationNumber,
        },
      },
      select: { id: true },
    });
    if (duplicateReg) {
      throw new ConflictError(
        'HOSPITAL_REGISTRATION_EXISTS',
        'A hospital with this registration number is already registered.',
      );
    }

    const passwordHash = await hashPassword(data.password);
    const { rawToken, tokenHash } = generateOpaqueToken(32);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const now = new Date();

    const user = await this.db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: data.email,
          phone: data.phone,
          fullName: data.hospitalName,
          passwordHash,
          role: 'HOSPITAL',
          accountStatus: 'PENDING_VERIFICATION',
          termsAcceptedAt: now,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          accountStatus: true,
          createdAt: true,
        },
      });

      const hospital = await tx.hospital.create({
        data: {
          userId: created.id,
          legalName: data.hospitalName,
          displayName: data.hospitalName,
          registrationNumber: data.registrationNumber,
          accreditationBody: data.accreditationBody ?? null,
          verificationStatus: 'PENDING',
          isAcceptingLeads: false,
          addressLine1: data.addressLine1,
          city: data.city,
          stateProvince: data.stateProvince,
          postalCode: data.postalCode,
          countryCode: data.countryCode,
          contactEmail: data.email,
          contactPhone: data.phone,
        },
      });

      await this.repo.createEmailVerificationToken(created.id, tokenHash, expiresAt, tx);

      await recordAuditLog(
        {
          actorUserId: created.id,
          actorRole: 'HOSPITAL',
          action: 'HOSPITAL_REGISTERED',
          resourceType: 'Hospital',
          resourceId: hospital.id,
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
          userAgentHash: ctx.userAgentHash,
        },
        tx,
      );

      return created;
    });

    await this.dispatchToken({ email: user.email, purpose: 'EMAIL_VERIFICATION', rawToken });
    return {
      user,
      ...(process.env.NODE_ENV === 'test' ? { verificationToken: rawToken } : {}),
    };
  }

  async verifyEmail(input: unknown, ctx: RequestAuditContext = {}) {
    const { token } = verifyEmailBodySchema.parse(input);
    const tokenHash = hashToken(token);
    const now = new Date();

    const record = await this.repo.findValidEmailVerificationToken(tokenHash);
    if (
      !record ||
      record.purpose !== 'EMAIL_VERIFICATION' ||
      record.consumedAt !== null ||
      record.expiresAt.getTime() <= now.getTime() ||
      record.user.deletedAt !== null
    ) {
      throw new UnauthorizedError(
        'TOKEN_INVALID_OR_EXPIRED',
        'Verification token is invalid or expired.',
      );
    }

    return this.db.$transaction(async (tx) => {
      await tx.authToken.update({
        where: { id: record.id },
        data: { consumedAt: now },
      });

      let nextStatus = record.user.accountStatus;
      if (record.user.role === 'PATIENT' && record.user.accountStatus === 'PENDING_VERIFICATION') {
        nextStatus = 'ACTIVE';
      } else if (record.user.role === 'DOCTOR') {
        const doc = await tx.doctor.findUnique({
          where: { userId: record.user.id },
          select: { verificationStatus: true },
        });
        if (doc?.verificationStatus === 'VERIFIED') {
          nextStatus = 'ACTIVE';
        }
      } else if (record.user.role === 'HOSPITAL') {
        const hosp = await tx.hospital.findUnique({
          where: { userId: record.user.id },
          select: { verificationStatus: true },
        });
        if (hosp?.verificationStatus === 'VERIFIED') {
          nextStatus = 'ACTIVE';
        }
      }

      const updated = await tx.user.update({
        where: { id: record.user.id },
        data: { emailVerified: now, accountStatus: nextStatus },
        select: { id: true, email: true, role: true, accountStatus: true, emailVerified: true },
      });

      await recordAuditLog(
        {
          actorUserId: updated.id,
          actorRole: updated.role,
          action: 'AUTH_EMAIL_VERIFIED',
          resourceType: 'User',
          resourceId: updated.id,
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
          userAgentHash: ctx.userAgentHash,
        },
        tx,
      );

      return updated;
    });
  }

  async login(
    input: unknown,
    ctx: RequestAuditContext = {},
  ): Promise<{
    user: {
      id: string;
      email: string;
      fullName: string;
      role: UserRole;
      accountStatus: string;
    };
    tokens: IssuedTokenPair;
  }> {
    const { email, password } = loginBodySchema.parse(input);

    await assertRateLimitNotLocked(LOGIN_RATE_POLICY, email, this.db);

    const user = await this.repo.findUserByEmailForLogin(email);
    if (!user || !user.passwordHash || user.deletedAt !== null) {
      await recordRateLimitFailure(LOGIN_RATE_POLICY, email, this.db);
      await recordAuditLog(
        {
          action: 'AUTH_LOGIN_FAILED_UNKNOWN_EMAIL',
          resourceType: 'User',
          outcome: 'DENIED',
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
          userAgentHash: ctx.userAgentHash,
          metadata: { emailDomain: email.split('@')[1] ?? 'unknown' },
        },
        this.db,
      );
      throw new UnauthorizedError('INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      await recordRateLimitFailure(LOGIN_RATE_POLICY, email, this.db);
      await recordAuditLog(
        {
          actorUserId: user.id,
          actorRole: user.role,
          action: 'AUTH_LOGIN_FAILED_BAD_PASSWORD',
          resourceType: 'User',
          resourceId: user.id,
          outcome: 'DENIED',
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
          userAgentHash: ctx.userAgentHash,
        },
        this.db,
      );
      throw new UnauthorizedError('INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    if (!user.emailVerified) {
      await recordAuditLog(
        {
          actorUserId: user.id,
          actorRole: user.role,
          action: 'AUTH_LOGIN_BLOCKED_UNVERIFIED',
          resourceType: 'User',
          resourceId: user.id,
          outcome: 'DENIED',
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
          userAgentHash: ctx.userAgentHash,
        },
        this.db,
      );
      throw new ForbiddenError('EMAIL_NOT_VERIFIED', 'Please verify your email address first.');
    }

    if (user.accountStatus !== 'ACTIVE') {
      await recordAuditLog(
        {
          actorUserId: user.id,
          actorRole: user.role,
          action: 'AUTH_LOGIN_BLOCKED_STATUS',
          resourceType: 'User',
          resourceId: user.id,
          outcome: 'DENIED',
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
          userAgentHash: ctx.userAgentHash,
          metadata: { accountStatus: user.accountStatus },
        },
        this.db,
      );
      throw new ForbiddenError(
        'ACCOUNT_INACTIVE',
        `Account is '${user.accountStatus}' and cannot sign in.`,
      );
    }

    await clearRateLimit(LOGIN_RATE_POLICY, email, this.db);
    await this.db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.sessionService.createSessionTokens(
      {
        id: user.id,
        email: user.email,
        role: user.role as UserRole,
        sessionVersion: user.sessionVersion,
      },
      ctx,
    );

    await recordAuditLog(
      {
        actorUserId: user.id,
        actorRole: user.role,
        action: 'AUTH_LOGIN_SUCCESS',
        resourceType: 'User',
        resourceId: user.id,
        outcome: 'SUCCESS',
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
        userAgentHash: ctx.userAgentHash,
        metadata: { sessionId: tokens.sessionId },
      },
      this.db,
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role as UserRole,
        accountStatus: user.accountStatus,
      },
      tokens,
    };
  }

  async refresh(rawRefreshToken: string, ctx: RequestAuditContext = {}) {
    return this.sessionService.rotateRefreshToken(rawRefreshToken, ctx);
  }

  async logout(sessionId: string, actorUserId: string, actorRole: string, ctx: RequestAuditContext = {}) {
    await this.sessionService.revokeSession(sessionId, undefined, ctx);
    await recordAuditLog(
      {
        actorUserId,
        actorRole,
        action: 'AUTH_LOGOUT',
        resourceType: 'Session',
        resourceId: sessionId,
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
        userAgentHash: ctx.userAgentHash,
      },
      this.db,
    );
  }

  async getMe(userId: string) {
    const profile = await this.repo.findUserProfileById(userId);
    if (!profile) {
      throw new NotFoundError('USER_NOT_FOUND', 'Authenticated user profile not found.');
    }
    return profile;
  }

  async forgotPassword(input: unknown, ctx: RequestAuditContext = {}) {
    const { email } = forgotPasswordBodySchema.parse(input);
    await assertRateLimitNotLocked(PASSWORD_RESET_RATE_POLICY, email, this.db);
    await recordRateLimitFailure(PASSWORD_RESET_RATE_POLICY, email, this.db);

    const user = await this.repo.findUserByEmailForLogin(email);
    if (!user || user.deletedAt !== null) {
      return { accepted: true };
    }

    const { rawToken, tokenHash } = generateOpaqueToken(32);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await this.repo.createPasswordResetToken(user.id, tokenHash, expiresAt);
    await recordAuditLog(
      {
        actorUserId: user.id,
        actorRole: user.role,
        action: 'AUTH_PASSWORD_RESET_REQUESTED',
        resourceType: 'User',
        resourceId: user.id,
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
        userAgentHash: ctx.userAgentHash,
      },
      this.db,
    );

    await this.dispatchToken({ email: user.email, purpose: 'PASSWORD_RESET', rawToken });
    return {
      accepted: true,
      ...(process.env.NODE_ENV === 'test' ? { resetToken: rawToken } : {}),
    };
  }

  async resetPassword(input: unknown, ctx: RequestAuditContext = {}) {
    const parsed = resetPasswordBodySchema.parse(input);
    const nextPassword = parsed.newPassword ?? parsed.password!;
    const tokenHash = hashToken(parsed.token);
    const now = new Date();

    const record = await this.repo.findPasswordResetToken(tokenHash);
    if (
      !record ||
      record.usedAt !== null ||
      record.expiresAt.getTime() <= now.getTime() ||
      record.user.deletedAt !== null
    ) {
      throw new UnauthorizedError('TOKEN_INVALID_OR_EXPIRED', 'Password reset token is invalid or expired.');
    }

    const passwordHash = await hashPassword(nextPassword);

    await this.db.$transaction(async (tx) => {
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: now },
      });

      await tx.user.update({
        where: { id: record.user.id },
        data: {
          passwordHash,
          sessionVersion: { increment: 1 },
        },
      });

      await tx.session.updateMany({
        where: { userId: record.user.id, revokedAt: null },
        data: { revokedAt: now },
      });

      await recordAuditLog(
        {
          actorUserId: record.user.id,
          actorRole: record.user.role,
          action: 'AUTH_PASSWORD_RESET_COMPLETED',
          resourceType: 'User',
          resourceId: record.user.id,
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
          userAgentHash: ctx.userAgentHash,
        },
        tx,
      );
    });

    await clearRateLimit(LOGIN_RATE_POLICY, record.user.email, this.db);
    return { passwordReset: true };
  }

  async changePassword(
    userId: string,
    currentSessionId: string,
    input: unknown,
    ctx: RequestAuditContext = {},
  ) {
    const { currentPassword, newPassword } = changePasswordBodySchema.parse(input);
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, passwordHash: true, sessionVersion: true, deletedAt: true },
    });

    if (!user || !user.passwordHash || user.deletedAt !== null) {
      throw new NotFoundError('USER_NOT_FOUND', 'User account not found.');
    }

    const matches = await verifyPassword(currentPassword, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedError('INVALID_CURRENT_PASSWORD', 'Current password is incorrect.');
    }

    const nextHash = await hashPassword(newPassword);
    const now = new Date();

    const updatedUser = await this.db.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: nextHash,
          sessionVersion: { increment: 1 },
        },
        select: { id: true, email: true, role: true, sessionVersion: true },
      });

      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      });

      await recordAuditLog(
        {
          actorUserId: user.id,
          actorRole: user.role,
          action: 'AUTH_PASSWORD_CHANGED',
          resourceType: 'User',
          resourceId: user.id,
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
          userAgentHash: ctx.userAgentHash,
          metadata: { invalidatedSessionId: currentSessionId },
        },
        tx,
      );

      return updated;
    });

    const tokens = await this.sessionService.createSessionTokens(
      {
        id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role as UserRole,
        sessionVersion: updatedUser.sessionVersion,
      },
      ctx,
    );

    return { passwordChanged: true, tokens };
  }
}

export const registerRoleParamSchema = z.object({
  role: z.string().optional(),
});
