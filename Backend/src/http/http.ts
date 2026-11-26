import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z, ZodError, type ZodType } from 'zod';
import { AppError } from './errors.js';
import type { Actor } from '../db/database.js';

/** Consistent success envelope: { data, meta? }. */
export function send(res: Response, data: unknown, status = 200, meta?: Record<string, unknown>): void {
  res.status(status).json(meta ? { data, meta } : { data });
}

export interface Valid<B = unknown, Q = unknown, P = unknown> {
  body: B;
  query: Q;
  params: P;
}

/** Validates body/query/params with Zod and passes typed values to the handler. */
export function handler<B = unknown, Q = unknown, P = unknown>(
  schemas: { body?: ZodType<B>; query?: ZodType<Q>; params?: ZodType<P> },
  fn: (req: Request, res: Response, valid: Valid<B, Q, P>) => Promise<void> | void,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const valid = {
        body: schemas.body ? schemas.body.parse(req.body ?? {}) : (undefined as B),
        query: schemas.query ? schemas.query.parse(req.query) : (undefined as Q),
        params: schemas.params ? schemas.params.parse(req.params) : (undefined as P),
      };
      await fn(req, res, valid);
    } catch (error) {
      next(error);
    }
  };
}

export function requireActor(req: Request): Actor {
  if (!req.actor) throw new AppError(401, 'NOT_AUTHENTICATED', 'Sign in to continue.');
  return req.actor;
}

export function zodToAppError(error: ZodError): AppError {
  return new AppError(
    400,
    'VALIDATION_FAILED',
    'Some fields are missing or invalid.',
    error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  );
}

// ---- Reusable schema pieces -------------------------------------------------
export const uuid = z.uuid();
export const idParams = z.object({ id: z.uuid() });
export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof pagination>;
export const pageMeta = (p: Pagination, total: number) => ({
  page: p.page, pageSize: p.pageSize, total, totalPages: Math.max(1, Math.ceil(total / p.pageSize)),
});
/** Trimmed, length-limited text that rejects control characters (other than newline/tab). */
export const text = (max: number, min = 1) =>
  z.string().trim().min(min).max(max).refine((v) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(v), {
    message: 'Contains invalid characters',
  });
export const optionalText = (max: number) => text(max, 0).optional().transform((v) => (v === '' ? undefined : v));

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch(next);
}
