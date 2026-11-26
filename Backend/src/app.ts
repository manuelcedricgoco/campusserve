import express, { Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import { corsOrigins, type Env } from './config/env.js';
import type { Database } from './db/database.js';
import type { TokenVerifier } from './auth/token-verifier.js';
import type { StorageAdapter } from './integrations/storage/storage.js';
import type { PaymentProviderRegistry } from './integrations/payment-providers/registry.js';
import type { AiProvider } from './integrations/ai-providers/provider.js';
import { authenticate, errorHandler, notFoundRoute, requestId } from './middleware/core.js';
import { registerModules } from './modules/index.js';

export interface AppDeps {
  env: Env;
  db: Database;
  logger: Logger;
  verifyToken: TokenVerifier;
  storage: StorageAdapter;
  payments: PaymentProviderRegistry;
  ai: AiProvider;
}

export function createApp(deps: AppDeps) {
  const { env, logger } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestId);
  app.use(pinoHttp({
    logger,
    genReqId: (req) => (req as express.Request).requestId,
    redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-sandbox-signature"]'],
    autoLogging: env.NODE_ENV !== 'test',
  }));
  app.use(helmet());
  const origins = corsOrigins(env);
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id', 'Idempotency-Key'],
    maxAge: 600,
  }));

  // Webhooks need the raw body for signature verification; mounted before the JSON parser.
  const webhooks = Router();
  webhooks.use(express.raw({ type: '*/*', limit: '256kb' }));
  app.use('/api/v1/webhooks', webhooks);

  app.use(express.json({ limit: '1mb' }));

  const limiter = (limit: number) => rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => (req as express.Request).actor?.id ?? ipKeyGenerator(req.ip ?? '0.0.0.0'),
    handler: (req, res) => res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment.', requestId: (req as express.Request).requestId },
    }),
  });

  // Public (signed-out) endpoints: stricter limit, optional auth.
  const publicRouter = Router();
  publicRouter.use(authenticate(deps.verifyToken, false), limiter(env.PUBLIC_RATE_LIMIT_PER_MINUTE));
  app.use('/api/v1/public', publicRouter);

  // Everything else under /api/v1 requires a verified Supabase session (except /health).
  const api = Router();
  const authed = Router();
  authed.use(authenticate(deps.verifyToken, true), limiter(env.RATE_LIMIT_PER_MINUTE));

  registerModules({ deps, api, authed, publicRouter, webhooks });
  api.use(authed);
  app.use('/api/v1', api);

  app.use(notFoundRoute);
  app.use(errorHandler(logger));
  return app;
}
