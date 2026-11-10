import type { Request } from 'express';
import type { AccountStatus, AdminScope, AppRole } from '../types/domain.js';

export interface AuthContext {
  userId: string;
  email: string;
  role: AppRole;
  accountStatus: AccountStatus;
  adminScope: AdminScope | null;
  accessToken: string;
}

export interface RequestWithContext extends Request {
  requestId: string;
  auth?: AuthContext;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
}
