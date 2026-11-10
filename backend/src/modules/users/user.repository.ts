import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';

type DbClient = Prisma.TransactionClient | PrismaClient;

export class UserRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async listUsers(params: {
    q?: string;
    role?: string;
    status?: string;
    skip: number;
    take: number;
  }) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(params.role ? { role: params.role } : {}),
      ...(params.status ? { accountStatus: params.status } : {}),
      ...(params.q
        ? {
            OR: [
              { fullName: { contains: params.q } },
              { email: { contains: params.q.toLowerCase() } },
              { phone: { contains: params.q } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.db.user.count({ where }),
      this.db.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
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
          updatedAt: true,
        },
      }),
    ]);

    return { total, items };
  }

  async findByIdSafe(id: string, client: DbClient = this.db) {
    return client.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        phone: true,
        fullName: true,
        role: true,
        accountStatus: true,
        adminRoleId: true,
        emailVerified: true,
        lastLoginAt: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        patient: true,
        doctor: { include: { specializations: true } },
        hospital: { include: { departments: true } },
        adminProfile: true,
      },
    });
  }
}
