export class ApiError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const errors = {
  unauthorized: (message = 'Authorization required') =>
    new ApiError(401, 'UNAUTHORIZED', message),
  forbidden: (message = 'Access denied') => new ApiError(403, 'FORBIDDEN', message),
  notFound: (message = 'Not found') => new ApiError(404, 'NOT_FOUND', message),
  conflict: (code: string, message: string, details?: unknown) =>
    new ApiError(409, code, message, details),
  badRequest: (message = 'Invalid request', details?: unknown) =>
    new ApiError(400, 'BAD_REQUEST', message, details),
  validation: (details: unknown) => new ApiError(400, 'VALIDATION_ERROR', 'Validation failed', details),
  tooMany: () => new ApiError(429, 'RATE_LIMITED', 'Too many requests'),
};
