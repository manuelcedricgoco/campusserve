import express, { Router } from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
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
import { AppError } from './http/errors.js';
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
  const staticDir = env.SERVE_STATIC_DIR ? path.resolve(env.SERVE_STATIC_DIR) : null;
  if (staticDir) {
    // Serving the website too: allow it to talk to Supabase Auth and load map tiles; everything else stays 'self'.
    const supabase = env.SUPABASE_URL ?? '';
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org'],
          connectSrc: ["'self'", supabase, supabase.replace(/^https:/, 'wss:')].filter(Boolean),
          fontSrc: ["'self'", 'data:'],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
    }));
  } else {
    app.use(helmet());
  }
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

  // Memory storage (local testing): short-lived signed download links.
  const memory = deps.storage as Partial<import('./integrations/storage/storage.js').MemoryStorage>;
  if (typeof memory.readSigned === 'function') {
    app.get('/api/v1/dev-files/:token', (req, res, next) => {
      const f = memory.readSigned!(String(req.params.token));
      if (!f) { next(new AppError(404, 'FILE_NOT_FOUND', 'This link has expired or does not exist.')); return; }
      res.setHeader('Content-Type', f.contentType);
      res.setHeader('Content-Disposition', `inline; filename="${f.name.replace(/[^A-Za-z0-9._ -]/g, '_')}"`);
      res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(f.data);
    });
  }

  registerModules({ deps, api, authed, publicRouter, webhooks });
  api.use(authed);
  app.use('/api/v1', api);

  if (staticDir && existsSync(path.join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    // Single-page app: any other GET outside /api returns index.html.
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  app.use(notFoundRoute);
  app.use(errorHandler(logger));
  return app;
}
