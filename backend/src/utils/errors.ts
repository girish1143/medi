export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Request validation failed.', details?: Record<string, unknown>) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication credentials are missing or invalid.') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(code = 'FORBIDDEN_ROLE', message = 'You do not have permission for this action.') {
    super(403, code, message);
  }
}

export class ConsentRequiredError extends AppError {
  constructor(
    message = 'Explicit patient consent is required before accessing or sharing enquiry data.',
  ) {
    super(403, 'CONSENT_REQUIRED', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Requested resource was not found.') {
    super(404, 'RESOURCE_NOT_FOUND', message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Operation conflicts with current resource state.') {
    super(409, 'STATE_CONFLICT', message);
  }
}

export class NotImplementedError extends AppError {
  constructor(moduleName: string, routeDescription: string) {
    super(
      501,
      'NOT_IMPLEMENTED',
      `Module '${moduleName}' route (${routeDescription}) is reserved in Phase 1 and scheduled for Phase 2+ implementation.`,
    );
  }
}
