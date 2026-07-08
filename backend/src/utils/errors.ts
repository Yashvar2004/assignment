// Custom error classes for the application

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

export class ValidationError extends AppError {
  public readonly errors: Record<string, string>[];

  constructor(message = 'Validation failed', errors: Record<string, string>[] = []) {
    super(message, 400);
    this.errors = errors;
  }
}

export class HubSpotApiError extends AppError {
  public readonly hubspotStatus: number;
  public readonly hubspotBody: any;

  constructor(message: string, status: number, body?: any) {
    super(message, status >= 500 ? 502 : 400);
    this.hubspotStatus = status;
    this.hubspotBody = body;
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(retryAfter: number) {
    super(`Rate limited. Retry after ${retryAfter}ms`, 429);
    this.retryAfter = retryAfter;
  }
}
