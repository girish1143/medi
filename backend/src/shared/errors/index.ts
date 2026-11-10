export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request input.', details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(code = 'UNAUTHORIZED', message = 'Authentication is required.') {
    super(401, code, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(code = 'FORBIDDEN', message = 'You do not have permission to perform this action.') {
    super(403, code, message);
  }
}

export class NotFoundError extends AppError {
  constructor(code = 'NOT_FOUND', message = 'Requested resource was not found.') {
    super(404, code, message);
  }
}

export class ConflictError extends AppError {
  constructor(code = 'CONFLICT', message = 'Resource state conflict.') {
    super(409, code, message);
  }
}

export class TooManyRequestsError extends AppError {
  public readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message = 'Too many requests. Please try again later.') {
    super(429, 'RATE_LIMIT_EXCEEDED', message);
    this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
  }
}

export class ConsentRequiredError extends AppError {
  constructor(message = 'Explicit active patient consent is required for this operation.') {
    super(403, 'CONSENT_REQUIRED', message);
  }
}
