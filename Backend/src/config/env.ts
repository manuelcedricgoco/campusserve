import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    // Postgres connection used by the API. Every user request runs as the
    // `authenticated` role with the caller's JWT claims, so RLS applies.
    DATABASE_URL: z.string().min(1),
    DATABASE_SSL: bool.default(false),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1000).default(15000),

    // Supabase Auth token verification: JWKS (asymmetric signing keys) and/or
    // the legacy HS256 JWT secret. At least one is required.
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_JWKS_URL: z.string().url().optional(),
    SUPABASE_JWT_SECRET: z.string().min(32).optional(),
    JWT_AUDIENCE: z.string().default('authenticated'),

    // Server-only. Used for Storage uploads / signed URLs.
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
    STORAGE_MODE: z.enum(['supabase', 'memory']).default('supabase'),

    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(120),
    PUBLIC_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(30),

    // Payments. No real provider is integrated. The sandbox simulates a
    // provider for development only and is refused in production.
    PAYMENT_SANDBOX: bool.default(false),
    PAYMENT_SANDBOX_SECRET: z.string().min(16).optional(),
    PAYMENT_RETURN_URL: z.string().url().default('http://localhost:5173/student/payments'),

    // AI. Provider keys are never stored in the database: ai_provider_settings.secret_ref names an env var.
    // JSON map of provider code -> OpenAI-compatible base URL, e.g. {"openai":"https://api.openai.com/v1"}.
    AI_PROVIDER_BASE_URLS: z.string().default('{}').refine((v) => {
      try { const o = JSON.parse(v); return typeof o === 'object' && o !== null && !Array.isArray(o); } catch { return false; }
    }, 'AI_PROVIDER_BASE_URLS must be a JSON object'),

    // Worker
    WORKER_POLL_MS: z.coerce.number().int().min(1000).default(15000),
  })
  .superRefine((env, ctx) => {
    if (!env.SUPABASE_JWKS_URL && !env.SUPABASE_URL && !env.SUPABASE_JWT_SECRET) {
      ctx.addIssue({ code: 'custom', message: 'Set SUPABASE_URL (JWKS) or SUPABASE_JWT_SECRET to verify tokens.' });
    }
    if (env.NODE_ENV === 'production') {
      if (env.PAYMENT_SANDBOX) ctx.addIssue({ code: 'custom', message: 'PAYMENT_SANDBOX must be false in production.' });
      if (env.STORAGE_MODE === 'memory') ctx.addIssue({ code: 'custom', message: 'STORAGE_MODE=memory is not allowed in production.' });
    }
    if (env.STORAGE_MODE === 'supabase' && env.NODE_ENV !== 'test' && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
      ctx.addIssue({ code: 'custom', message: 'STORAGE_MODE=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
    }
    if (env.PAYMENT_SANDBOX && !env.PAYMENT_SANDBOX_SECRET) {
      ctx.addIssue({ code: 'custom', message: 'PAYMENT_SANDBOX needs PAYMENT_SANDBOX_SECRET.' });
    }
  });

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `- ${i.path.join('.') || 'env'}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}

export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
}
