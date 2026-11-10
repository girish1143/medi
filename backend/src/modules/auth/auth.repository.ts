import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';

type DbClient = Prisma.TransactionClient | PrismaClient;

export class AuthRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async findUserByEmailForLogin(email: string, client: DbClient = this.db) {
    return client.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        fullName: true,
        passwordHash: true,
        role: true,
        accountStatus: true,
        adminRoleId: true,
        emailVerified: true,
        sessionVersion: true,
        deletedAt: true,
      },
    });
  }

  async findUserProfileById(userId: string, client: DbClient = this.db) {
    return client.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        fullName: true,
        role: true,
        accountStatus: true,
        emailVerified: true,
        lastLoginAt: true,
        createdAt: true,
        patient: { select: { id: true, city: true, stateProvince: true, countryCode: true } },
        doctor: {
          select: {
            id: true,
            verificationStatus: true,
            medicalLicenseNumber: true,
            city: true,
            stateProvince: true,
          },
        },
        hospital: {
          select: {
            id: true,
            displayName: true,
            verificationStatus: true,
            registrationNumber: true,
            city: true,
            stateProvince: true,
          },
        },
      },
    });
  }

  async findExistingContact(email: string, phone?: string, client: DbClient = this.db) {
    return client.user.findFirst({
      where: {
        OR: [{ email }, ...(phone ? [{ phone }] : [])],
      },
      select: { id: true, email: true, phone: true },
    });
  }

  async createEmailVerificationToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    client: DbClient = this.db,
  ) {
    await client.authToken.updateMany({
      where: { userId, purpose: 'EMAIL_VERIFICATION', consumedAt: null },
      data: { consumedAt: new Date() },
    });

    return client.authToken.create({
      data: {
        userId,
        tokenHash,
        purpose: 'EMAIL_VERIFICATION',
        expiresAt,
      },
    });
  }

  async findValidEmailVerificationToken(tokenHash: string, client: DbClient = this.db) {
    return client.authToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: { id: true, role: true, accountStatus: true, deletedAt: true },
        },
      },
    });
  }

  async createPasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    client: DbClient = this.db,
  ) {
    await client.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    return client.passwordResetToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
  }

  async findPasswordResetToken(tokenHash: string, client: DbClient = this.db) {
    return client.passwordResetToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: { id: true, email: true, role: true, deletedAt: true },
        },
      },
    });
  }
}
