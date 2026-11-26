import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { pino } from 'pino';
import { createHmac, randomUUID } from 'node:crypto';
import { createTestContext, expectStatus, idOf, SANDBOX_SECRET, U } from './helpers.js';
import { errorHandler } from '../src/middleware/core.js';

const t = createTestContext();
afterAll(() => t.close());

const counts = async () => (await t.sql<Record<string, number>>(
  `select (select count(*) from public.receipt_records)::int r, (select count(*) from public.user_roles)::int ur,
          (select count(*) from public.violation_records)::int v, (select count(*) from public.penalty_payments)::int pp,
          (select count(*) from public.system_settings where value::text like '%gcash%')::int s,
          (select count(*) from public.clearance_approvals where status = 'approved')::int ca,
          (select count(*) from public.audit_logs)::int al`))[0]!;

describe('self-registered accounts (migration 018)', () => {
  const stranger = 'b0000000-0000-4000-8000-0000000000aa';
  beforeAll(async () => {
    await t.sql(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'stranger@example.com', '{"full_name":"Stranger"}') on conflict do nothing`, [stranger]);
  });

  it('starts inactive and is told so', async () => {
    const me = expectStatus(await (await t.as(stranger)).get('/api/v1/me'), 200).data;
    expect(me.profile.is_active).toBe(false);
  });

  it('cannot read members-only data or use the assistant', async () => {
    const s = await t.as(stranger);
    for (const p of ['/api/v1/catalog/organizations', '/api/v1/violations/policies', '/api/v1/clearance/templates', '/api/v1/ai/sources', '/api/v1/receipts/obligations']) {
      const r = await s.get(p);
      expect(r.status === 403 || (r.status === 200 && r.body.data.length === 0), `${p} ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`).toBe(true);
    }
    expect((await s.post('/api/v1/ai/chat').send({ message: 'hello' })).status).toBe(403);
  });

  it('works once an administrator activates it', async () => {
    expectStatus(await (await t.as(U.admin)).patch(`/api/v1/admin/users/${stranger}`).send({ isActive: true }), 200);
    expect(expectStatus(await (await t.as(stranger)).get('/api/v1/catalog/organizations'), 200).data.length).toBeGreaterThan(0);
    expectStatus(await (await t.as(U.admin)).patch(`/api/v1/admin/users/${stranger}`).send({ isActive: false }), 200);
  });
});

describe('authorization matrix: a plain student cannot use staff or admin write endpoints', () => {
  const X = randomUUID();
  const calls: [string, string, unknown][] = [
    ['post', '/api/v1/receipts', { obligationId: X, studentId: U.bsit1, amount: 50 }],
    ['post', `/api/v1/receipts/${X}/verify`, { decision: 'verified' }],
    ['post', '/api/v1/remittances', { obligationId: X, declaredTotal: 10 }],
    ['post', `/api/v1/remittances/${X}/begin-review`, { receivedTotal: 10 }],
    ['post', `/api/v1/remittances/items/${X}/verify`, { decision: 'verified' }],
    ['post', '/api/v1/guidance/confirm-evaluations', { studentId: U.bsit1, officeId: X }],
    ['post', '/api/v1/guidance/issue-slip', { studentId: U.bsit1, officeId: X }],
    ['post', '/api/v1/library/issue-slip', { studentId: U.bsit1, officeId: X }],
    ['post', '/api/v1/clearances', { studentId: U.bsit1 }],
    ['post', `/api/v1/clearance/approvals/${X}/approve`, {}],
    ['post', '/api/v1/violations', { policyId: X, studentId: U.bsit2, description: 'x' }],
    ['post', `/api/v1/violations/${X}/review`, { decision: 'verified' }],
    ['post', '/api/v1/penalties/assess', { policyId: X, studentId: U.bsit2 }],
    ['post', `/api/v1/payments/${X}/verify`, { decision: 'verified' }],
    ['post', `/api/v1/payments/${X}/reconcile`, { source: 'manual_review' }],
    ['post', `/api/v1/community-service/${X}/verify`, { decision: 'verified' }],
    ['post', `/api/v1/queue/slots/${X}/call-next`, {}],
    ['post', `/api/v1/requests/${X}/status`, { status: 'released' }],
    ['patch', `/api/v1/admin/users/${U.bsit2}`, { isActive: false }],
    ['post', `/api/v1/admin/users/${U.bsit1}/roles`, { role: 'administrator' }],
    ['post', '/api/v1/admin/assignments', { type: 'organization', userId: U.bsit1, organizationId: X, positionCode: 'treasurer' }],
    ['put', '/api/v1/admin/settings/payments.enabled_providers', { value: ['gcash'] }],
    ['post', '/api/v1/admin/services', { officeId: X, code: 'HACK', name: 'x', serviceKind: 'queue' }],
    ['post', `/api/v1/admin/policy-versions/${X}/activate`, {}],
    ['post', '/api/v1/ai/sources', { name: 'x', sourceType: 'faq', visibility: 'public' }],
    ['post', '/api/v1/automation/rules', { code: 'hack_rule', name: 'x', triggerCode: 'service_request.submitted', actions: [{ action_type: 'record_note' }] }],
    ['post', '/api/v1/gis/locations', { campusId: X, name: 'x' }],
    ['get', '/api/v1/admin/users', undefined],
    ['get', '/api/v1/admin/audit-logs', undefined],
    ['get', '/api/v1/admin/settings', undefined],
    ['get', '/api/v1/ai/usage', undefined],
    ['get', '/api/v1/reports/summary', undefined],
  ];

  it('every call is refused and nothing changes', async () => {
    const before = await counts();
    const s = await t.as(U.bsit1);
    const bad: string[] = [];
    for (const [m, p, body] of calls) {
      const req = (s as unknown as Record<string, (p: string) => request.Test>)[m]!(p);
      const r = body === undefined ? await req : await req.send(body as object);
      if (r.status < 400 || r.status >= 500) bad.push(`${m.toUpperCase()} ${p} -> ${r.status}`);
    }
    expect(bad).toEqual([]);
    const after = await counts();
    expect({ ...after, al: 0 }).toEqual({ ...before, al: 0 });
  });

  it('an officer of one organization cannot act for another', async () => {
    const padcFee = await idOf(t, `select id from public.receipt_obligations where code = 'PADC_FEE'`);
    const ssgPolicy = await idOf(t, `select id from public.violation_policies where code = 'EVENT_VIOLATION'`);
    expect((await (await t.as(U.ssgTreasurer)).post('/api/v1/receipts').send({ obligationId: padcFee, studentId: U.bsit2, amount: 50 })).status).toBe(403);
    expect((await (await t.as(U.padcMayor)).post('/api/v1/violations').send({ policyId: ssgPolicy, studentId: U.bsit2, description: 'cross-org' })).status).toBe(403);
    expect((await (await t.as(U.padcMayor)).post('/api/v1/penalties/assess').send({ policyId: ssgPolicy, studentId: U.bsit2 })).status).toBeGreaterThanOrEqual(403);
  });
});

describe('input handling', () => {
  it('rejects unknown fields (no mass assignment)', async () => {
    const s = await t.as(U.bsit1);
    expect((await s.patch('/api/v1/me').send({ fullName: 'X', is_active: false, roles: ['administrator'] })).status).toBe(400);
    const svc = await idOf(t, `select id from public.services where code = 'DOCUMENT_REQUEST'`);
    expect((await s.post('/api/v1/requests').send({ serviceId: svc, purpose: 'abc def', status: 'released' })).status).toBe(400);
  });

  it('treats SQL in search text as plain text', async () => {
    const before = (await t.sql<{ n: number }>(`select count(*)::int n from public.profiles`))[0]!.n;
    for (const q of ["' or '1'='1", "'; drop table public.profiles; --", '%', '\\']) {
      expectStatus(await (await t.as(U.admin)).get(`/api/v1/admin/users?q=${encodeURIComponent(q)}`), 200);
      expectStatus(await (await t.as(U.registrar)).get(`/api/v1/students?q=${encodeURIComponent(q)}`), 200);
      expectStatus(await request(t.app).get(`/api/v1/public/gis/search?q=${encodeURIComponent(q.length > 1 ? q : 'ab')}`), 200);
    }
    expect((await t.sql<{ n: number }>(`select count(*)::int n from public.profiles`))[0]!.n).toBe(before);
  });

  it('validates ids in paths and rejects control characters in text', async () => {
    const s = await t.as(U.bsit1);
    expect((await s.get("/api/v1/requests/1' or 1=1--")).status).toBe(400);
    const svc = await idOf(t, `select id from public.services where code = 'DOCUMENT_REQUEST'`);
    expect((await s.post('/api/v1/requests').send({ serviceId: svc, purpose: 'bad\u0000text' })).status).toBe(400);
  });

  it('limits body size', async () => {
    const r = await (await t.as(U.bsit1)).patch('/api/v1/me').set('Content-Type', 'application/json').send(JSON.stringify({ fullName: 'x'.repeat(1_100_000) }));
    expect(r.status).toBe(413);
  });
});

describe('file uploads', () => {
  let requestId = '';
  beforeAll(async () => {
    const svc = await idOf(t, `select id from public.services where code = 'DOCUMENT_REQUEST'`);
    requestId = expectStatus(await (await t.as(U.bsit2)).post('/api/v1/requests').send({ serviceId: svc, purpose: 'Upload tests' }), 201).data.id;
  });
  const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');

  it('neutralises path traversal and odd characters in file names', async () => {
    const r = expectStatus(await (await t.as(U.bsit2)).post(`/api/v1/requests/${requestId}/documents`)
      .attach('file', PDF, { filename: '../../etc/<script>passwd.pdf', contentType: 'application/pdf' }), 201).data;
    expect(r.file_name).not.toMatch(/[/<>]/);
    const keys = [...t.storage.files.keys()].filter((k) => k.includes(requestId));
    expect(keys.every((k) => !k.includes('..') && k.startsWith(`request-documents/${requestId}/`))).toBe(true);
  });

  it('rejects HTML or SVG disguised as images, and files over the limit', async () => {
    const s = await t.as(U.bsit2);
    expect((await s.post(`/api/v1/requests/${requestId}/documents`).attach('file', Buffer.from('<svg onload=alert(1)>'), { filename: 'a.png', contentType: 'image/png' })).status).toBe(415);
    expect((await s.post(`/api/v1/requests/${requestId}/documents`).attach('file', Buffer.from('<html><script>x</script>'), { filename: 'a.pdf', contentType: 'application/pdf' })).status).toBe(415);
    const big = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024 + 10)]);
    expect((await s.post(`/api/v1/requests/${requestId}/documents`).attach('file', big, { filename: 'big.pdf', contentType: 'application/pdf' })).status).toBe(413);
  });

  it('requires a file and only one file', async () => {
    const s = await t.as(U.bsit2);
    expect((await s.post(`/api/v1/requests/${requestId}/documents`)).status).toBe(400);
    const two = await s.post(`/api/v1/requests/${requestId}/documents`).attach('file', PDF, 'a.pdf').attach('file', PDF, 'b.pdf');
    expect(two.status).toBeGreaterThanOrEqual(400);
  });
});

describe('webhooks', () => {
  it('rejects a valid signature replayed over a modified body', async () => {
    const raw = JSON.stringify({ event_id: `evt-${randomUUID()}`, reference: 'CSP-NOPE', status: 'paid', amount: 60 });
    const sig = createHmac('sha256', SANDBOX_SECRET).update(raw).digest('hex');
    const tampered = raw.replace('"amount":60', '"amount":1');
    expect((await request(t.app).post('/api/v1/webhooks/payments/gcash').set('Content-Type', 'application/json').set('x-sandbox-signature', sig).send(tampered)).status).toBe(401);
  });

  it('does not accept webhooks when the provider is not configured (production default)', async () => {
    const prod = createTestContext({ PAYMENT_SANDBOX: 'false' });
    try {
      expect((await request(prod.app).post('/api/v1/webhooks/payments/gcash').set('Content-Type', 'application/json').send('{}')).status).toBe(404);
      const providers = expectStatus(await (await prod.as(U.bsit1)).get('/api/v1/payments/providers'), 200).data;
      expect(providers.every((p: { mode: string; available: boolean }) => p.mode === 'not_configured' && !p.available)).toBe(true);
    } finally { await prod.close(); }
  });
});

describe('transport and errors', () => {
  it('sends security headers', async () => {
    const r = await request(t.app).get('/api/v1/health');
    expect(r.headers['strict-transport-security']).toBeTruthy();
    expect(r.headers['content-security-policy']).toBeTruthy();
    expect(r.headers['x-frame-options']).toBeTruthy();
  });

  it('allows only configured origins', async () => {
    const ok = await request(t.app).options('/api/v1/me').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'GET');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const evil = await request(t.app).options('/api/v1/me').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'GET');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rate limits per user and the public routes', async () => {
    const limited = createTestContext({ RATE_LIMIT_PER_MINUTE: '3', PUBLIC_RATE_LIMIT_PER_MINUTE: '2' });
    try {
      const s = await limited.as(U.bsit1);
      const codes = [];
      for (let i = 0; i < 4; i++) codes.push((await s.get('/api/v1/notifications')).status);
      expect(codes).toEqual([200, 200, 200, 429]);
      const pub = [];
      for (let i = 0; i < 3; i++) pub.push((await request(limited.app).get('/api/v1/public/services')).status);
      expect(pub).toEqual([200, 200, 429]);
    } finally { await limited.close(); }
  });

  it('never leaks internal error details', async () => {
    const app = express();
    app.get('/boom', () => { throw new Error('select * from secret_table where password = hunter2'); });
    app.use(errorHandler(pino({ level: 'silent' })));
    const r = await request(app).get('/boom');
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/secret_table|hunter2|stack/);
  });

  it('does not expose the service role or database URL in responses', async () => {
    const r = await (await t.as(U.admin)).get('/api/v1/admin/settings');
    expect(JSON.stringify(r.body)).not.toMatch(/postgres:\/\/|service_role|SUPABASE_/);
  });
});
