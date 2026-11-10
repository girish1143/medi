import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import { getEnv } from '../../config/env';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../security/jwt';
import { hashToken, timingSafeEqualHex } from '../../security/token-hash';
import type { UserRole } from '../../shared/constants';
import { UnauthorizedError } from '../../shared/errors';
import type { RequestAuditContext } from '../../shared/interfaces';
import { recordAuditLog } from '../audit-logs/audit-log.service';
import { SessionRepository } from './session.repository';

export interface IssuedTokenPair {
  sessionId: string;
  tokenFamilyId: string;
  accessToken: string;
  refreshToken: string;
}

export class SessionService {
  private readonly sessionRepo: SessionRepository;

  constructor(private readonly db: PrismaClient = prisma) {
    this.sessionRepo = new SessionRepository(db);
  }

  async createSessionTokens(
    user: { id: string; email: string; role: UserRole; sessionVersion: number },
    ctx: RequestAuditContext = {},
  ): Promise<IssuedTokenPair> {
    const env = getEnv();
    const sessionId = crypto.randomUUID();
    const tokenFamilyId = crypto.randomUUID();
    const expires = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    const refreshToken = signRefreshToken({
      userId: user.id,
      sessionId,
      tokenFamilyId,
    });
    const refreshTokenHash = hashToken(refreshToken);

    await this.sessionRepo.createSession({
      id: sessionId,
      sessionToken: crypto.randomUUID(),
      refreshTokenHash,
      tokenFamilyId,
      userId: user.id,
      expires,
      ipHash: ctx.ipHash,
      userAgentHash: ctx.userAgentHash,
    });

    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId,
      sessionVersion: user.sessionVersion,
    });

    return { sessionId, tokenFamilyId, accessToken, refreshToken };
  }

  async rotateRefreshToken(
    rawRefreshToken: string,
    ctx: RequestAuditContext = {},
  ): Promise<IssuedTokenPair> {
    const payload = verifyRefreshToken(rawRefreshToken);
    const incomingHash = hashToken(rawRefreshToken);

    const existing = await this.sessionRepo.findById(payload.sid);

    // Reuse or stolen token detection: if session already rotated/revoked, nuke whole family!
    if (!existing || !existing.refreshTokenHash) {
      if (payload.fid) {
        await this.sessionRepo.revokeTokenFamily(payload.fid);
      }
      await recordAuditLog(
        {
          actorUserId: payload.sub,
          action: 'AUTH_REFRESH_TOKEN_REUSE_OR_MISSING',
          resourceType: 'Session',
          resourceId: payload.sid,
          outcome: 'DENIED',
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
          userAgentHash: ctx.userAgentHash,
          metadata: { tokenFamilyId: payload.fid },
        },
        this.db,
      );
      throw new UnauthorizedError('SESSION_REVOKED', 'Refresh session revoked or invalid.');
    }

    if (
      existing.revokedAt !== null ||
      !timingSafeEqualHex(existing.refreshTokenHash, incomingHash)
    ) {
      const familyId = existing.tokenFamilyId ?? payload.fid;
      if (familyId) {
        await this.sessionRepo.revokeTokenFamily(familyId);
      } else {
        await this.sessionRepo.revokeAllForUser(existing.userId);
      }

      await recordAuditLog(
        {
          actorUserId: existing.userId,
          action: 'AUTH_REFRESH_REUSE_DETECTED_FAMILY_REVOKED',
          resourceType: 'Session',
          resourceId: existing.id,
          outcome: 'DENIED',
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
          userAgentHash: ctx.userAgentHash,
          metadata: { tokenFamilyId: familyId },
        },
        this.db,
      );

      throw new UnauthorizedError(
        'REFRESH_TOKEN_REUSE_DETECTED',
        'Refresh token reuse detected. Session family has been revoked.',
      );
    }

    if (existing.expires.getTime() <= Date.now()) {
      await this.sessionRepo.revokeSessionById(existing.id);
      throw new UnauthorizedError('REFRESH_TOKEN_EXPIRED', 'Session has expired.');
    }

    const user = await this.db.user.findUnique({
      where: { id: existing.userId },
      select: {
        id: true,
        email: true,
        role: true,
        accountStatus: true,
        emailVerified: true,
        sessionVersion: true,
        deletedAt: true,
      },
    });

    if (!user || user.deletedAt !== null || !user.emailVerified || user.accountStatus !== 'ACTIVE') {
      await this.sessionRepo.revokeAllForUser(existing.userId);
      throw new UnauthorizedError('ACCOUNT_INACTIVE', 'Account is not active.');
    }

    const env = getEnv();
    const newSessionId = crypto.randomUUID();
    const familyId = existing.tokenFamilyId ?? payload.fid;
    const expires = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    const newRefreshToken = signRefreshToken({
      userId: user.id,
      sessionId: newSessionId,
      tokenFamilyId: familyId,
    });
    const newRefreshHash = hashToken(newRefreshToken);

    await this.db.$transaction(async (tx) => {
      await this.sessionRepo.rotateSessionRefreshHash(
        {
          oldSessionId: existing.id,
          newSessionId,
          newSessionToken: crypto.randomUUID(),
          newRefreshTokenHash: newRefreshHash,
          tokenFamilyId: familyId,
          userId: user.id,
          expires,
          ipHash: ctx.ipHash,
          userAgentHash: ctx.userAgentHash,
        },
        tx,
      );

      await recordAuditLog(
        {
          actorUserId: user.id,
          actorRole: user.role,
          action: 'AUTH_REFRESH_ROTATED',
          resourceType: 'Session',
          resourceId: newSessionId,
          outcome: 'SUCCESS',
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
          userAgentHash: ctx.userAgentHash,
        },
        tx,
      );
    });

    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role as UserRole,
      sessionId: newSessionId,
      sessionVersion: user.sessionVersion,
    });

    return {
      sessionId: newSessionId,
      tokenFamilyId: familyId,
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async revokeSession(sessionId: string, actorUserId?: string, ctx: RequestAuditContext = {}): Promise<void> {
    await this.sessionRepo.revokeSessionById(sessionId);
    if (actorUserId) {
      await recordAuditLog(
        {
          actorUserId,
          action: 'AUTH_SESSION_REVOKED',
          resourceType: 'Session',
          resourceId: sessionId,
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
          userAgentHash: ctx.userAgentHash,
        },
        this.db,
      );
    }
  }

  async revokeAllUserSessions(
    userId: string,
    reasonAction: string,
    ctx: RequestAuditContext = {},
  ): Promise<number> {
    const count = await this.db.$transaction(async (tx) => {
      const revokedCount = await this.sessionRepo.revokeAllForUser(userId, tx);
      await recordAuditLog(
        {
          actorUserId: userId,
          action: reasonAction,
          resourceType: 'User',
          resourceId: userId,
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
          userAgentHash: ctx.userAgentHash,
          metadata: { revokedSessionsCount: revokedCount },
        },
        tx,
      );
      return revokedCount;
    });
    return count;
  }
}
