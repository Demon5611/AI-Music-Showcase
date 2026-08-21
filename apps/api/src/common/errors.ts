export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class InsufficientCreditsError extends AppError {
  constructor() {
    super("Insufficient credits", 402, "INSUFFICIENT_CREDITS");
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, code = "BAD_REQUEST") {
    super(message, 400, code);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = "CONFLICT") {
    super(message, 409, code);
  }
}

export class AudioNotReadyError extends AppError {
  constructor(
    message = "Track audio is not ready yet",
    code: "AUDIO_NOT_READY" | "AUDIO_PERSIST_FAILED" = "AUDIO_NOT_READY",
  ) {
    super(message, 409, code);
  }
}

export class FeatureNotAvailableError extends AppError {
  constructor(
    message: string,
    public readonly requiredPlan?: string,
  ) {
    super(message, 403, "FEATURE_NOT_AVAILABLE");
  }
}

export class DurationLimitExceededError extends AppError {
  constructor(
    message: string,
    public readonly limitSec?: number,
  ) {
    super(message, 403, "DURATION_LIMIT_EXCEEDED");
  }
}

export class EditorOperationNotAllowedError extends AppError {
  constructor(
    message: string,
    public readonly requiredPlan?: string,
  ) {
    super(message, 403, "EDITOR_OPERATION_NOT_ALLOWED");
  }
}

export class AccountDeletionPendingError extends AppError {
  constructor(message = "Account deletion is in progress") {
    super(message, 403, "ACCOUNT_DELETION_PENDING");
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(
    message: string,
    public readonly retryAfterSec?: number,
  ) {
    super(message, 503, "SERVICE_UNAVAILABLE");
  }
}

export class RefundEnqueueFailedError extends AppError {
  constructor(
    message = "Refund approved but queue enqueue failed; requeue via admin",
  ) {
    super(message, 503, "REFUND_ENQUEUE_FAILED");
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function sendAppError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  error: unknown,
) {
  if (isAppError(error)) {
    const body: Record<string, unknown> = {
      error: error.message,
      code: error.code,
    };

    if (error instanceof ServiceUnavailableError && error.retryAfterSec) {
      body.retryAfterSec = error.retryAfterSec;
    }

    return reply.status(error.statusCode).send(body);
  }

  throw error;
}
