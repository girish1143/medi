import type { Prisma, PrismaClient, Session } from '@prisma/client';
import { prisma } from '../../config/database';

type DbClient = Prisma.TransactionClient | PrismaClient;

export class SessionRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async createSession(
    data: {
      id: string;
      sessionToken: string;
      refreshTokenHash: string;
      tokenFamilyId: string;
      userId: string;
      expires: Date;
      ipHash?: string | null;
      userAgentHash?: string | null;
    },
    client: DbClient = this.db,
  ): Promise<Session> {
    return client.session.create({
      data: {
        id: data.id,
        sessionToken: data.sessionToken,
        refreshTokenHash: data.refreshTokenHash,
        tokenFamilyId: data.tokenFamilyId,
        userId: data.userId,
        expires: data.expires,
        ipHash: data.ipHash ?? null,
        userAgentHash: data.userAgentHash ?? null,
      },
    });
  }

  async findById(id: string, client: DbClient = this.db): Promise<Session | null> {
    return client.session.findUnique({ where: { id } });
  }

  async findByRefreshTokenHash(
    refreshTokenHash: string,
    client: DbClient = this.db,
  ): Promise<Session | null> {
    return client.session.findUnique({ where: { refreshTokenHash } });
  }

  async rotateSessionRefreshHash(
    params: {
      oldSessionId: string;
      newSessionId: string;
      newSessionToken: string;
      newRefreshTokenHash: string;
      tokenFamilyId: string;
      userId: string;
      expires: Date;
      ipHash?: string | null;
      userAgentHash?: string | null;
    },
    client: DbClient = this.db,
  ): Promise<Session> {
    const now = new Date();
    await client.session.update({
      where: { id: params.oldSessionId },
      data: { revokedAt: now },
    });

    return client.session.create({
      data: {
        id: params.newSessionId,
        sessionToken: params.newSessionToken,
        refreshTokenHash: params.newRefreshTokenHash,
        tokenFamilyId: params.tokenFamilyId,
        userId: params.userId,
        expires: params.expires,
        ipHash: params.ipHash ?? null,
        userAgentHash: params.userAgentHash ?? null,
      },
    });
  }

  async revokeSessionById(id: string, client: DbClient = this.db): Promise<void> {
    await client.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeTokenFamily(tokenFamilyId: string, client: DbClient = this.db): Promise<number> {
    const result = await client.session.updateMany({
      where: { tokenFamilyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async revokeAllForUser(userId: string, client: DbClient = this.db): Promise<number> {
    const result = await client.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await client.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
    });
    return result.count;
  }
}
