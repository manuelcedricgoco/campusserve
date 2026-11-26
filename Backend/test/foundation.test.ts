import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestContext, tokenFor, U } from './helpers.js';
import { fromDatabaseError } from '../src/http/errors.js';
import { loadEnv } from '../src/config/env.js';

const t = createTestContext();
afterAll(() => t.close());

describe('health', () => {
  it('reports liveness and database readiness without auth', async () => {
    const live = await request(t.app).get('/api/v1/health');
    expect(live.status).toBe(200);
    expect(live.body.data.status).toBe('ok');
    const ready = await request(t.app).get('/api/v1/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.data.database).toBe('ok');
  });

  it('sets security headers and a request id', async () => {
    const res = await request(t.app).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-request-id']).toMatch(/[0-9a-f-]{36}/);
  });
});

describe('authentication', () => {
  it('rejects a missing token', async () => {
    const res = await request(t.app).get('/api/v1/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NOT_AUTHENTICATED');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const bad = await tokenFor(U.bsit1, { secret: 'another-secret-that-is-long-enough-123456' });
    const res = await request(t.app).get('/api/v1/me').set('Authorization', `Bearer ${bad}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects an expired token, a wrong issuer and a non-authenticated role', async () => {
    for (const token of [
      await tokenFor(U.bsit1, { expiresIn: '-1m' }),
      await tokenFor(U.bsit1, { issuer: 'https://evil.example/auth/v1' }),
      await tokenFor(U.bsit1, { role: 'service_role' }),
    ]) {
      const res = await request(t.app).get('/api/v1/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    }
  });

  it('rejects an unsigned (alg none) token', async () => {
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const token = `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ sub: U.admin, role: 'authenticated', aud: 'authenticated' })}.`;
    const res = await request(t.app).get('/api/v1/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe('/me', () => {
  it('returns the student access context from the database', async () => {
    const res = await (await t.as(U.bsit1)).get('/api/v1/me');
    expect(res.status).toBe(200);
    expect(res.body.data.roles).toContain('student');
    expect(res.body.data.student.program_code).toBe('BSIT');
    expect(res.body.data.student.department_organization_code).toBe('PADC');
    expect(res.body.data.academicYear).not.toBeNull();
  });

  it('returns scoped permissions for an organization officer', async () => {
    const res = await (await t.as(U.padcTreasurer)).get('/api/v1/me');
    expect(res.status).toBe(200);
    expect(res.body.data.assignments.some((a: { scope_code: string }) => a.scope_code === 'PADC')).toBe(true);
    expect(res.body.data.scopedPermissions.length).toBeGreaterThan(0);
  });

  it('updates only the caller name/phone and rejects unknown fields', async () => {
    const s = await t.as(U.bsit2);
    const ok = await s.patch('/api/v1/me').send({ phone: '+63 912 345 6789' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.phone).toBe('+63 912 345 6789');
    const bad = await s.patch('/api/v1/me').send({ is_active: false });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    const badPhone = await s.patch('/api/v1/me').send({ phone: 'call me' });
    expect(badPhone.status).toBe(400);
  });

  it('persisted the change in the database', async () => {
    const rows = await t.sql<{ phone: string }>(`select phone from public.profiles where id = $1`, [U.bsit2]);
    expect(rows[0]!.phone).toBe('+63 912 345 6789');
  });
});

describe('errors', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const res = await (await t.as(U.bsit1)).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await (await t.as(U.bsit1)).patch('/api/v1/me').set('Content-Type', 'application/json').send('{"x":');
    expect(res.status).toBe(400);
  });

  it('maps database errors to HTTP statuses', () => {
    const dbErr = (code: string, message: string) => Object.assign(new Error(message), { code, severity: 'ERROR' });
    expect(fromDatabaseError(dbErr('42501', 'PERMISSION_DENIED'))?.status).toBe(403);
    expect(fromDatabaseError(dbErr('P0001', 'REQUEST_NOT_FOUND'))?.status).toBe(404);
    expect(fromDatabaseError(dbErr('23505', 'duplicate key'))?.status).toBe(409);
    expect(fromDatabaseError(dbErr('22P02', 'invalid input'))?.status).toBe(400);
    expect(fromDatabaseError(dbErr('57014', 'canceling statement'))?.status).toBe(503);
  });
});

describe('configuration', () => {
  it('refuses the payment sandbox and memory storage in production', () => {
    expect(() => loadEnv({
      NODE_ENV: 'production', DATABASE_URL: 'postgres://x', SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(40), PAYMENT_SANDBOX: 'true', PAYMENT_SANDBOX_SECRET: 'y'.repeat(20), STORAGE_MODE: 'memory',
    })).toThrow(/PAYMENT_SANDBOX must be false.*\n.*memory/s);
  });
});

describe('date serialization', () => {
  it('returns calendar dates as YYYY-MM-DD strings, independent of the server time zone', async () => {
    const svc = (await t.sql<{ id: string }>(`select id from public.services where code = 'COUNSELING'`))[0]!;
    const slots = (await (await t.as(U.bsit1)).get(`/api/v1/queue/services/${svc.id}/slots`)).body.data;
    expect(slots[0].slot_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('key server outage', () => {
  it('answers 503 AUTH_UNAVAILABLE (not "session expired") when JWKS cannot be fetched', async () => {
    const { SignJWT, generateKeyPair } = await import('jose');
    const { privateKey } = await generateKeyPair('ES256');
    const token = await new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setSubject(U.bsit1)
      .setAudience('authenticated').setIssuer('http://127.0.0.1:9/auth/v1').setExpirationTime('5m').sign(privateKey);
    const ctx = createTestContext({ SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_JWT_SECRET: '' });
    try {
      const r = await request(ctx.app).get('/api/v1/me').set('Authorization', `Bearer ${token}`);
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe('AUTH_UNAVAILABLE');
    } finally { await ctx.close(); }
  });
});

describe('serving the built website (single-port mode)', () => {
  it('serves index.html for app routes, keeps /api as JSON, and allows Supabase in the CSP', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(`${tmpdir()}/cs-static-`);
    writeFileSync(`${dir}/index.html`, '<!doctype html><title>CampusServe</title>');
    const ctx = createTestContext({ SERVE_STATIC_DIR: dir });
    try {
      const page = await request(ctx.app).get('/student/queue');
      expect(page.status).toBe(200);
      expect(page.text).toContain('<title>CampusServe</title>');
      expect(page.headers['content-security-policy']).toContain('connect-src \'self\' http://localhost:54321');
      const api = await request(ctx.app).get('/api/v1/nope');
      expect(api.status).toBe(401);
      expect((await request(ctx.app).get('/api/v1/health')).body.data.status).toBe('ok');
    } finally { await ctx.close(); }
  });
});
