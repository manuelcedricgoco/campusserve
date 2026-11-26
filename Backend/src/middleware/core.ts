import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { Logger } from 'pino';
import type { TokenVerifier } from '../auth/token-verifier.js';
import { AppError, fromDatabaseError } from '../http/errors.js';
import { zodToAppError } from '../http/http.js';

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  req.requestId = incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
};

/** Verifies the Bearer token when present. `required` rejects requests without a valid token. */
export function authenticate(verify: TokenVerifier, required: boolean): RequestHandler {
  return async (req, _res, next) => {
    try {
      const header = req.header('authorization');
      if (!header) {
        if (required) throw new AppError(401, 'NOT_AUTHENTICATED', 'Sign in to continue.');
        return next();
      }
      const match = /^Bearer\s+([A-Za-z0-9._-]+)$/.exec(header);
      if (!match?.[1]) throw new AppError(401, 'INVALID_TOKEN', 'Malformed authorization header.');
      req.actor = await verify(match[1]);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const notFoundRoute: RequestHandler = (req, _res, next) =>
  next(new AppError(404, 'ROUTE_NOT_FOUND', `No route for ${req.method} ${req.path}.`));

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    let error: AppError;
    if (err instanceof AppError) error = err;
    else if (err instanceof ZodError) error = zodToAppError(err);
    else if (err?.type === 'entity.parse.failed') error = new AppError(400, 'INVALID_JSON', 'The request body is not valid JSON.');
    else if (err?.type === 'entity.too.large') error = new AppError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
    else if (err?.code === 'LIMIT_FILE_SIZE') error = new AppError(413, 'FILE_TOO_LARGE', 'The file is too large.');
    else error = fromDatabaseError(err) ?? new AppError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');

    if (error.status >= 500) logger.error({ err, requestId: req.requestId }, 'request failed');
    else logger.debug({ code: error.code, requestId: req.requestId }, 'request rejected');

    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details, requestId: req.requestId },
    });
  };
}
