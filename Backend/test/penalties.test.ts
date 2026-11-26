import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createHmac, randomUUID } from 'node:crypto';
import { createTestContext, expectStatus, idOf, SANDBOX_SECRET, U } from './helpers.js';

const t = createTestContext();
afterAll(() => t.close());

let eventPolicy = '';
let bottlePolicy = '';
let bottleEvent = '';
beforeAll(async () => {
  bottleEvent = await idOf(t, `select id from public.organization_events where name = 'Bottle Drive (sample)'`);
  eventPolicy = await idOf(t, `select id from public.violation_policies where code = 'EVENT_VIOLATION'`);
  bottlePolicy = await idOf(t, `select id from public.violation_policies where code = 'BOTTLE_POLICY'`);
});

const sign = (raw: string) => createHmac('sha256', SANDBOX_SECRET).update(raw).digest('hex');

describe('violations and penalties', () => {
  it('students cannot report violations', async () => {
    const res = await (await t.as(U.bsit1)).post('/api/v1/violations').send({ policyId: eventPolicy, studentId: U.bsit2, description: 'Absent at assembly' });
    expect(res.status).toBe(403);
  });

  it('an unverified violation does not count toward a penalty', async () => {
    const gov = await t.as(U.ssgGovernor);
    expectStatus(await gov.post('/api/v1/violations').send({ policyId: eventPolicy, studentId: U.bsit2, description: 'Absent at General Assembly' }), 201);
    const res = await gov.post('/api/v1/penalties/assess').send({ policyId: eventPolicy, studentId: U.bsit2 });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('an unconfirmed penalty policy (PADC bottles) cannot be assessed', async () => {
    const mayor = await t.as(U.padcMayor);
    const v = expectStatus(await mayor.post('/api/v1/violations').send({ policyId: bottlePolicy, studentId: U.bsit2, description: 'Bottle drive', quantity: 7, eventId: bottleEvent }), 201).data;
    const reviewed = expectStatus(await mayor.post(`/api/v1/violations/${v.id}/review`).send({ decision: 'verified' }), 200).data;
    expect(reviewed.violation_count).toBe(0); // floor(7/10), no carry-over
    const res = await mayor.post('/api/v1/penalties/assess').send({ policyId: bottlePolicy, studentId: U.bsit2 });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('online payment (development sandbox) for an SSG penalty', () => {
  let assessmentId = '';
  let payment: { id: string; reference: string; provider_transaction_id: string; amount: number } | null = null;
  const key = `test-${randomUUID()}`;

  it('verifying the violation, then assessing 1h or PHP 60', async () => {
    const gov = await t.as(U.ssgGovernor);
    const list = expectStatus(await gov.get(`/api/v1/violations?scope=all&studentId=${U.bsit2}&status=reported`), 200).data;
    const ssg = list.find((v: { organization_code: string }) => v.organization_code === 'SSG');
    expectStatus(await gov.post(`/api/v1/violations/${ssg.id}/review`).send({ decision: 'verified' }), 200);
    const a = expectStatus(await gov.post('/api/v1/penalties/assess').send({ policyId: eventPolicy, studentId: U.bsit2 }), 201).data;
    expect(a.required_hours).toBe(1);
    expect(a.required_amount).toBe(60);
    assessmentId = a.id;
  });

  it('payments stay blocked until an administrator enables a provider', async () => {
    expect((await (await t.as(U.ssgGovernor)).put('/api/v1/admin/settings/payments.enabled_providers').send({ value: ['gcash'] })).status).toBe(403);
    expectStatus(await (await t.as(U.admin)).put('/api/v1/admin/settings/payments.enabled_providers').send({ value: ['gcash'] }), 200);
  });

  it('lists providers honestly (sandbox in tests)', async () => {
    const res = expectStatus(await (await t.as(U.bsit2)).get('/api/v1/payments/providers'), 200);
    expect(res.data.map((p: { code: string }) => p.code)).toEqual(['gcash', 'maya', 'landbank']);
    expect(res.data.every((p: { mode: string }) => p.mode === 'sandbox')).toBe(true);
  });

  it('requires choosing payment and an Idempotency-Key', async () => {
    const s = await t.as(U.bsit2);
    expect((await s.post('/api/v1/payments').send({ assessmentId, provider: 'gcash' })).status).toBe(400);
    const noRes = await s.post('/api/v1/payments').set('Idempotency-Key', key).send({ assessmentId, provider: 'gcash' });
    expect(noRes.body.error?.code).toBe('RESOLUTION_NOT_SELECTED');
    expectStatus(await s.post(`/api/v1/penalties/${assessmentId}/resolution`).send({ type: 'payment' }), 200);
  });

  it('creates one checkout; replaying the key returns the same payment', async () => {
    const s = await t.as(U.bsit2);
    const first = expectStatus(await s.post('/api/v1/payments').set('Idempotency-Key', key).send({ assessmentId, provider: 'gcash' }), 201).data;
    expect(first.status).toBe('pending');
    expect(first.sandbox).toBe(true);
    expect(first.provider_checkout_url).toContain('sandbox=1');
    const replay = expectStatus(await s.post('/api/v1/payments').set('Idempotency-Key', key).send({ assessmentId, provider: 'gcash' }), 201).data;
    expect(replay.id).toBe(first.id);
    payment = first;
  });

  it('another student cannot complete or see this payment', async () => {
    const other = await t.as(U.bsit1);
    expect((await other.post('/api/v1/payments/sandbox/complete').send({ reference: payment!.reference, outcome: 'paid' })).status).toBe(404);
    expect((await other.get(`/api/v1/payments/${payment!.id}`)).status).toBe(404);
  });

  it('a webhook with a bad signature is rejected and has no effect', async () => {
    const raw = JSON.stringify({ event_id: `evt-${randomUUID()}`, reference: payment!.reference, status: 'paid', transaction_id: payment!.provider_transaction_id, amount: 60 });
    const res = await request(t.app).post('/api/v1/webhooks/payments/gcash').set('Content-Type', 'application/json').set('x-sandbox-signature', 'deadbeef').send(raw);
    expect(res.status).toBe(401);
    const p = await t.sql<{ status: string }>(`select status from public.penalty_payments where id = $1`, [payment!.id]);
    expect(p[0]!.status).toBe('pending');
  });

  it('a signed webhook with the wrong amount is not applied', async () => {
    const raw = JSON.stringify({ event_id: `evt-${randomUUID()}`, reference: payment!.reference, status: 'paid', transaction_id: payment!.provider_transaction_id, amount: 1 });
    const res = expectStatus(await request(t.app).post('/api/v1/webhooks/payments/gcash').set('Content-Type', 'application/json').set('x-sandbox-signature', sign(raw)).send(raw), 200);
    expect(res.data.reason).toBe('amount_mismatch');
  });

  it('a signed paid webhook settles the payment once; duplicates are ignored', async () => {
    const raw = JSON.stringify({ event_id: `evt-${randomUUID()}`, reference: payment!.reference, status: 'paid', transaction_id: payment!.provider_transaction_id, amount: 60 });
    const send = () => request(t.app).post('/api/v1/webhooks/payments/gcash').set('Content-Type', 'application/json').set('x-sandbox-signature', sign(raw)).send(raw);
    expect(expectStatus(await send(), 200).data.result).toBe('processed');
    expect(expectStatus(await send(), 200).data.result).toBe('duplicate');
  });

  it('paid is not enough: the penalty stays open until the organization verifies the payment', async () => {
    const before = expectStatus(await (await t.as(U.bsit2)).get(`/api/v1/penalties/${assessmentId}`), 200).data;
    expect(before.status).not.toBe('resolved');
    expect(before.payments[0].status).toBe('paid');
    expect(before.payments[0].verification_status).toBe('unverified');
    expect((await (await t.as(U.bsit2)).post(`/api/v1/payments/${payment!.id}/verify`).send({ decision: 'verified' })).status).toBe(403);
    expectStatus(await (await t.as(U.ssgTreasurer)).post(`/api/v1/payments/${payment!.id}/verify`).send({ decision: 'verified' }), 200);
    const after = expectStatus(await (await t.as(U.bsit2)).get(`/api/v1/penalties/${assessmentId}`), 200).data;
    expect(after.status).toBe('resolved');
  });

  it('unknown providers answer 404', async () => {
    expect((await request(t.app).post('/api/v1/webhooks/payments/paypal').send('{}')).status).toBe(404);
  });
});

describe('community service resolution', () => {
  it('student submits hours; the organization verifies; the penalty resolves', async () => {
    const gov = await t.as(U.ssgGovernor);
    const v = expectStatus(await gov.post('/api/v1/violations').send({ policyId: eventPolicy, studentId: U.beed, description: 'Left the assembly early' }), 201).data;
    expectStatus(await gov.post(`/api/v1/violations/${v.id}/review`).send({ decision: 'verified' }), 200);
    const a = expectStatus(await gov.post('/api/v1/penalties/assess').send({ policyId: eventPolicy, studentId: U.beed }), 201).data;
    const s = await t.as(U.beed);
    const r = expectStatus(await s.post(`/api/v1/penalties/${a.id}/resolution`).send({ type: 'community_service' }), 200).data;
    const cs = expectStatus(await s.post(`/api/v1/penalties/resolutions/${r.id}/community-service`).send({
      serviceDate: new Date().toISOString().slice(0, 10), hours: 1, description: 'Cleaned the covered court' }), 201).data;
    expect((await s.post(`/api/v1/community-service/${cs.id}/verify`).send({ decision: 'verified' })).status).toBe(403);
    expectStatus(await gov.post(`/api/v1/community-service/${cs.id}/verify`).send({ decision: 'verified' }), 200);
    const after = expectStatus(await s.get(`/api/v1/penalties/${a.id}`), 200).data;
    expect(after.status).toBe('resolved');
  });

  it('students can dispute a violation and the organization decides', async () => {
    const gov = await t.as(U.ssgGovernor);
    const v = expectStatus(await gov.post('/api/v1/violations').send({ policyId: eventPolicy, studentId: U.cbam, description: 'No ID at event' }), 201).data;
    const d = expectStatus(await (await t.as(U.cbam)).post(`/api/v1/violations/${v.id}/disputes`).send({ reason: 'I was at the clinic, with a medical note.' }), 201).data;
    expectStatus(await (await t.as(U.ssgGovernor)).post(`/api/v1/disputes/${d.id}/decide`).send({ decision: 'upheld', notes: 'Medical note accepted' }), 200);
    const after = expectStatus(await (await t.as(U.cbam)).get(`/api/v1/violations/${v.id}`), 200).data;
    expect(after.status).toBe('voided');
  });
});

describe('cashier visibility', () => {
  it('the cashier (payments.view_all, no students.view) sees every payment with the student name', async () => {
    const total = (await t.sql<{ n: number }>(`select count(*)::int n from public.penalty_payments`))[0]!.n;
    const r = expectStatus(await (await t.as(U.cashier)).get('/api/v1/payments?scope=all&pageSize=100'), 200);
    expect(r.meta.total).toBe(total);
    expect(total).toBeGreaterThan(0);
    expect(r.data.every((p: { student_name: string | null }) => typeof p.student_name === 'string')).toBe(true);
    // ...but still cannot browse students in general
    expect(expectStatus(await (await t.as(U.cashier)).get('/api/v1/students?q=Sample'), 200).data).toHaveLength(0);
  });
});
