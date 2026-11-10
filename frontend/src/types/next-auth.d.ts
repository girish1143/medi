import type { DefaultSession } from 'next-auth';
import '@auth/core/jwt';
import type { UserRole } from '../lib/domain/enums';

declare module 'next-auth' {
  interface User {
    role: UserRole;
    accountStatus: string;
    adminRoleId?: string | null;
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
      accountStatus: string;
      adminRoleId: string | null;
    } & DefaultSession['user'];
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    userId?: string;
    role: UserRole;
    accountStatus: string;
    adminRoleId: string | null;
  }
}
