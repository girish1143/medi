import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import NextAuth from 'next-auth';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { isAdminUserRole, type UserRole } from '../domain/enums';
import { recordAuditLog } from '../services/audit.service';
import { verifyPassword } from './password';

const credentialsSchema = z.object({
  email: z.string().email().transform((val) => val.toLowerCase().trim()),
  password: z.string().min(1),
});

export const authConfig: NextAuthConfig = {
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 8, // 8 hours
  },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          select: {
            id: true,
            email: true,
            fullName: true,
            passwordHash: true,
            role: true,
            accountStatus: true,
            adminRoleId: true,
            deletedAt: true,
          },
        });

        if (!user || !user.passwordHash || user.deletedAt !== null) {
          return null;
        }

        if (user.accountStatus !== 'ACTIVE') {
          await recordAuditLog({
            actorUserId: user.id,
            actorRole: user.role,
            action: 'AUTH_SIGN_IN_BLOCKED_INACTIVE',
            resourceType: 'User',
            resourceId: user.id,
            outcome: 'DENIED',
            metadata: { accountStatus: user.accountStatus },
          });
          return null;
        }

        const passwordValid = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!passwordValid) {
          await recordAuditLog({
            actorUserId: user.id,
            actorRole: user.role,
            action: 'AUTH_SIGN_IN_INVALID_PASSWORD',
            resourceType: 'User',
            resourceId: user.id,
            outcome: 'DENIED',
          });
          return null;
        }

        if (isAdminUserRole(user.role)) {
          if (!user.adminRoleId) {
            return null;
          }
          const adminRole = await prisma.adminRole.findUnique({
            where: { id: user.adminRoleId },
            select: { code: true, isActive: true },
          });
          if (!adminRole || !adminRole.isActive || adminRole.code !== user.role) {
            return null;
          }
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        await recordAuditLog({
          actorUserId: user.id,
          actorRole: user.role,
          action: 'AUTH_SIGN_IN_SUCCESS',
          resourceType: 'User',
          resourceId: user.id,
          outcome: 'SUCCESS',
        });

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: user.role as UserRole,
          accountStatus: user.accountStatus,
          adminRoleId: user.adminRoleId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = user.role;
        token.accountStatus = user.accountStatus;
        token.adminRoleId = user.adminRoleId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId;
        session.user.role = token.role;
        session.user.accountStatus = token.accountStatus;
        session.user.adminRoleId = token.adminRoleId ?? null;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
