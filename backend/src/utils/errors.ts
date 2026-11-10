export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const Errors = {
  unauthorized: (message = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', message),
  invalidCredentials: () => new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'),
  forbidden: (message = 'You do not have permission to perform this action') =>
    new AppError(403, 'FORBIDDEN', message),
  notFound: (entity = 'Resource') => new AppError(404, 'NOT_FOUND', `${entity} not found`),
  conflict: (message = 'Request conflicts with the current state', code = 'CONFLICT') =>
    new AppError(409, code, message),
  validation: (message = 'Validation failed', details?: unknown) =>
    new AppError(422, 'VALIDATION_ERROR', message, details),
  slotUnavailable: (message = 'This time slot is no longer available') =>
    new AppError(409, 'SLOT_UNAVAILABLE', message),
  paymentRequired: (message = 'Payment is required to confirm this appointment') =>
    new AppError(402, 'PAYMENT_REQUIRED', message),
  tooManyRequests: (message = 'Too many requests, please try again later') =>
    new AppError(429, 'RATE_LIMITED', message),
  internal: (message = 'Something went wrong') => new AppError(500, 'INTERNAL_ERROR', message),
};

export function isPgError(error: unknown): error is { code: string; constraint?: string; message: string } {
  return typeof error === 'object' && error !== null && 'code' in error;
}
