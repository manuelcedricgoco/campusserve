/** An error with an HTTP status and a stable machine-readable code. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    /** Internal cause, logged on the server and never sent to clients. */
    public readonly internalCause?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found.`);
export const forbidden = (message = 'You are not allowed to do this.') => new AppError(403, 'FORBIDDEN', message);
export const badRequest = (code: string, message: string, details?: unknown) => new AppError(400, code, message, details);

// Business-rule codes raised by the database (private.fail) that mean "conflicts with current state".
const CONFLICT_CODES = new Set([
  'DUPLICATE_RESERVATION', 'SLOT_FULL', 'RESERVATION_LIMIT_REACHED', 'RECEIPT_ALREADY_EXISTS', 'PAYMENT_IN_PROGRESS',
  'ASSESSMENT_IN_PROGRESS', 'IDEMPOTENCY_CONFLICT', 'INVALID_STATE', 'INVALID_TRANSITION', 'PREVIOUS_STEPS_PENDING',
  'CLEARANCE_REQUIREMENTS_NOT_MET', 'TEMPLATE_LOCKED', 'POLICY_VERSION_IMMUTABLE', 'ASSESSMENT_IMMUTABLE',
  'HISTORY_IMMUTABLE', 'AUDIT_LOG_IMMUTABLE', 'CANCELLATION_CUTOFF_PASSED', 'SLOT_CLOSED', 'SLOT_IN_PAST',
  'QUEUE_EMPTY', 'PAYMENT_NOT_SETTLED',
]);

interface PgLikeError {
  code?: string;
  message?: string;
  hint?: string;
  detail?: string;
  constraint?: string;
}

function isPgError(e: unknown): e is PgLikeError {
  return typeof e === 'object' && e !== null && typeof (e as PgLikeError).code === 'string' && 'severity' in e;
}

/** Maps a PostgreSQL error (including CampusServe business-rule errors) to an AppError. */
export function fromDatabaseError(e: unknown): AppError | null {
  if (!isPgError(e)) return null;
  const code = e.code ?? '';
  const msg = e.message ?? '';
  const isBusinessCode = /^[A-Z][A-Z0-9_]+$/.test(msg);
  const human = e.hint || undefined;

  if (code === '42501') {
    if (msg === 'NOT_AUTHENTICATED') return new AppError(401, msg, human ?? 'Sign in to continue.');
    return new AppError(403, isBusinessCode ? msg : 'FORBIDDEN', human ?? 'You are not allowed to do this.');
  }
  if (code === 'P0001' && isBusinessCode) {
    const status = msg.endsWith('_NOT_FOUND') ? 404 : CONFLICT_CODES.has(msg) ? 409 : 422;
    return new AppError(status, msg, human ?? msg);
  }
  switch (code) {
    case '23505':
      return new AppError(409, 'CONFLICT', 'This conflicts with an existing record.', { constraint: e.constraint });
    case '23514':
      return new AppError(422, 'CONSTRAINT_VIOLATION', 'The data breaks a validation rule.', { constraint: e.constraint });
    case '23503':
      return new AppError(409, 'REFERENCE_ERROR', 'A referenced record does not exist or is still in use.');
    case '23502':
      return new AppError(400, 'MISSING_FIELD', 'A required value is missing.');
    case '22P02':
    case '22007':
    case '22008':
    case '22023':
      return new AppError(400, 'INVALID_INPUT', 'A value has the wrong format.');
    case '57014':
      return new AppError(503, 'TIMEOUT', 'The request took too long. Please try again.');
    default:
      return null;
  }
}
