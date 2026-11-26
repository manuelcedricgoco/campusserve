import { SignJWT } from 'jose';
import { pino } from 'pino';
import request from 'supertest';
import { loadEnv, type Env } from '../src/config/env.js';
import { createDatabase, type Database } from '../src/db/database.js';
import { createTokenVerifier } from '../src/auth/token-verifier.js';
import { createMemoryStorage } from '../src/integrations/storage/storage.js';
import { createPaymentRegistry } from '../src/integrations/payment-providers/registry.js';
import { createAiProvider, type AiProvider } from '../src/integrations/ai-providers/provider.js';
import { createApp } from '../src/app.js';

export const JWT_SECRET = 'test-only-jwt-secret-that-is-at-least-32-chars';
export const SANDBOX_SECRET = 'test-only-sandbox-secret';
export const SUPABASE_URL = 'http://localhost:54321';

const host = encodeURIComponent(process.env.PGHOST ?? '/var/tmp/cspg');
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
  ?? `postgres://${process.env.PGUSER ?? 'postgres'}@${host}:${process.env.PGPORT ?? '54329'}/${process.env.CAMPUSSERVE_TEST_DB ?? 'campusserve_test'}`;

/** Sample accounts from Database/seed/001_dev_seed.sql. */
export const U = {
  admin: 'a0000000-0000-4000-8000-000000000001',
  cashier: 'a0000000-0000-4000-8000-000000000002',
  programHead: 'a0000000-0000-4000-8000-000000000003',
  sasStaff: 'a0000000-0000-4000-8000-000000000004',
  sasHead: 'a0000000-0000-4000-8000-000000000005',
  guidance: 'a0000000-0000-4000-8000-000000000006',
  library: 'a0000000-0000-4000-8000-000000000007',
  registrar: 'a0000000-0000-4000-8000-000000000008',
  ssgGovernor: 'a0000000-0000-4000-8000-000000000011',
  ssgTreasurer: 'a0000000-0000-4000-8000-000000000012',
  padcMayor: 'a0000000-0000-4000-8000-000000000013',
  padcTreasurer: 'a0000000-0000-4000-8000-000000000014',
  classOfficer: 'a0000000-0000-4000-8000-000000000015',
  englishPres: 'a0000000-0000-4000-8000-000000000016',
  bsit1: 'a0000000-0000-4000-8000-000000000021',
  bsit2: 'a0000000-0000-4000-8000-000000000022',
  beed: 'a0000000-0000-4000-8000-000000000023',
  cbam: 'a0000000-0000-4000-8000-000000000024',
} as const;

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: TEST_DATABASE_URL,
    DATABASE_POOL_MAX: '5',
    SUPABASE_URL,
    SUPABASE_JWT_SECRET: JWT_SECRET,
    STORAGE_MODE: 'memory',
    PAYMENT_SANDBOX: 'true',
    PAYMENT_SANDBOX_SECRET: SANDBOX_SECRET,
    RATE_LIMIT_PER_MINUTE: '100000',
    PUBLIC_RATE_LIMIT_PER_MINUTE: '100000',
    ...overrides,
  });
}

export async function tokenFor(userId: string, opts: { expiresIn?: string; secret?: string; role?: string; issuer?: string } = {}) {
  return new SignJWT({ role: opts.role ?? 'authenticated', email: `${userId}@campusserve.test`, aal: 'aal1' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience('authenticated')
    .setIssuer(opts.issuer ?? `${SUPABASE_URL}/auth/v1`)
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? '10m')
    .sign(new TextEncoder().encode(opts.secret ?? JWT_SECRET));
}

export interface TestContext {
  app: ReturnType<typeof createApp>;
  db: Database;
  env: Env;
  storage: ReturnType<typeof createMemoryStorage>;
  ai: AiProvider;
  as(userId: string): Promise<{ get: (p: string) => request.Test; post: (p: string) => request.Test; patch: (p: string) => request.Test; put: (p: string) => request.Test; delete: (p: string) => request.Test }>;
  sql<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export function createTestContext(envOverrides: Record<string, string> = {}, deps: { ai?: AiProvider } = {}): TestContext {
  const env = testEnv(envOverrides);
  const db = createDatabase(env);
  const storage = createMemoryStorage();
  const ai = deps.ai ?? createAiProvider({ baseUrls: {}, env: {} });
  const app = createApp({
    env, db, storage, ai,
    logger: pino({ level: 'silent' }),
    verifyToken: createTokenVerifier(env),
    payments: createPaymentRegistry(env),
  });
  return {
    app, db, env, storage, ai,
    async as(userId) {
      const auth = `Bearer ${await tokenFor(userId)}`;
      const agent = request(app);
      return {
        get: (p) => agent.get(p).set('Authorization', auth),
        post: (p) => agent.post(p).set('Authorization', auth),
        patch: (p) => agent.patch(p).set('Authorization', auth),
        put: (p) => agent.put(p).set('Authorization', auth),
        delete: (p) => agent.delete(p).set('Authorization', auth),
      };
    },
    async sql(text, params) {
      return (await db.pool.query(text, params)).rows;
    },
    close: () => db.close(),
  };
}

/** Asserts an HTTP status and shows the error body when it does not match. */
export function expectStatus(res: { status: number; body: unknown }, status: number) {
  if (res.status !== status) {
    throw new Error(`Expected HTTP ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body as { data: any; meta?: any; error?: any };
}

export async function idOf(t: TestContext, sql: string, params: unknown[] = []) {
  const rows = await t.sql<{ id: string }>(sql, params);
  if (!rows[0]) throw new Error(`No row for ${sql}`);
  return rows[0].id;
}
