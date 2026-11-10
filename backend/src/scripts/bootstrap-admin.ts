import 'dotenv/config';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { connectDatabase, disconnectDatabase, prisma } from '../config/database';
import { recordAuditLog } from '../modules/audit-logs/audit-log.service';
import { hashPassword } from '../security/password';
import { ensureRbacCatalog } from '../security/permissions';
import { emailSchema, passwordPolicySchema } from '../shared/validators';

const bootstrapSchema = z.object({
  email: emailSchema,
  password: passwordPolicySchema,
  fullName: z.string().trim().min(2).max(120),
});

export async function bootstrapInitialSuperAdmin(
  env: {
    BOOTSTRAP_ADMIN_EMAIL?: string;
    BOOTSTRAP_ADMIN_PASSWORD?: string;
    BOOTSTRAP_ADMIN_NAME?: string;
  },
  db: PrismaClient = prisma,
) {
  const existing = await db.user.findFirst({
    where: { role: 'SUPER_ADMIN', deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    throw new Error('SUPER_ADMIN already exists; bootstrap is one-time only.');
  }

  const parsed = bootstrapSchema.parse({
    email: env.BOOTSTRAP_ADMIN_EMAIL,
    password: env.BOOTSTRAP_ADMIN_PASSWORD,
    fullName: env.BOOTSTRAP_ADMIN_NAME,
  });

  const passwordHash = await hashPassword(parsed.password);
  const now = new Date();

  return db.$transaction(async (tx) => {
    await ensureRbacCatalog(tx);

    const role = await tx.adminRole.findUniqueOrThrow({
      where: { code: 'SUPER_ADMIN' },
      select: { id: true },
    });

    const user = await tx.user.create({
      data: {
        email: parsed.email,
        fullName: parsed.fullName,
        passwordHash,
        role: 'SUPER_ADMIN',
        accountStatus: 'ACTIVE',
        adminRoleId: role.id,
        emailVerified: now,
        termsAcceptedAt: now,
      },
      select: { id: true, email: true, role: true, accountStatus: true, adminRoleId: true },
    });

    await tx.admin.create({
      data: {
        userId: user.id,
        employeeCode: `ADM-${user.id.slice(0, 8).toUpperCase()}`,
        department: 'SUPER_ADMIN',
      },
    });

    await recordAuditLog(
      {
        actorUserId: user.id,
        actorRole: 'SUPER_ADMIN',
        action: 'SUPER_ADMIN_BOOTSTRAPPED',
        resourceType: 'User',
        resourceId: user.id,
      },
      tx,
    );

    return user;
  });
}

if (require.main === module) {
  void (async () => {
    try {
      await connectDatabase(prisma);
      const created = await bootstrapInitialSuperAdmin(process.env, prisma);
      console.info(JSON.stringify({ success: true, userId: created.id, role: created.role }));
    } finally {
      await disconnectDatabase(prisma);
    }
  })();
}
