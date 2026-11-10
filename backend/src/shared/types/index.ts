import type { AccountStatus, UserRole } from '../constants';

export interface AuthenticatedPrincipal {
  userId: string;
  email: string;
  role: UserRole;
  accountStatus: AccountStatus;
  adminRoleId: string | null;
  sessionId: string;
  sessionVersion: number;
  permissions: readonly string[];
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  requestId?: string;
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
}
