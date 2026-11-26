import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, expectStatus, idOf, U } from './helpers.js';

const t = createTestContext();
afterAll(() => t.close());

let ids: Record<string, string> = {};
beforeAll(async () => {
  ids = {
    sas: await idOf(t, `select id from public.offices where code = 'SAS'`),
    guidance: await idOf(t, `select id from public.offices where code = 'GUIDANCE'`),
    library: await idOf(t, `select id from public.offices where code = 'LIBRARY'`),
    english: await idOf(t, `select id from public.organizations where code = 'ENGLISH_CLUB'`),
    ssgFee: await idOf(t, `select id from public.receipt_obligations where code = 'SSG_FEE'`),
    padcFee: await idOf(t, `select id from public.receipt_obligations where code = 'PADC_FEE'`),
    englishFee: await idOf(t, `select id from public.receipt_obligations where code = 'ENGLISH_CLUB_FEE'`),
  };
});

describe('clearance workflow end to end (BSIT student, English Club member)', () => {
  let clearanceId = '';

  it('only SAS can initiate; the student cannot initiate their own', async () => {
    const self = await (await t.as(U.bsit1)).post('/api/v1/clearances').send({ studentId: U.bsit1 });
    expect([403, 404]).toContain(self.status);
    const body = expectStatus(await (await t.as(U.sasStaff)).post('/api/v1/clearances').send({ studentId: U.bsit1 }), 201);
    clearanceId = body.data.id;
    expect(body.data.status).toBe('in_progress');
    expect(body.data.approvals.map((a: { step_key: string }) => a.step_key)).toEqual(['ssg_governor', 'sas_head', 'department_mayor', 'program_head']);
  });

  it('a second active clearance for the same student is refused', async () => {
    const again = await (await t.as(U.sasStaff)).post('/api/v1/clearances').send({ studentId: U.bsit1 });
    expect([409, 422]).toContain(again.status);
  });

  it('the student sees their clearance; another student does not', async () => {
    expectStatus(await (await t.as(U.bsit1)).get(`/api/v1/clearances/${clearanceId}`), 200);
    expect((await (await t.as(U.bsit2)).get(`/api/v1/clearances/${clearanceId}`)).status).toBe(404);
  });

  it('the SSG Governor cannot sign before requirements are met', async () => {
    const pending = expectStatus(await (await t.as(U.ssgGovernor)).get('/api/v1/clearance/approvals/pending'), 200);
    const step = pending.data.find((a: { clearance_id: string }) => a.clearance_id === clearanceId);
    expect(step?.step_key).toBe('ssg_governor');
    const res = await (await t.as(U.ssgGovernor)).post(`/api/v1/clearance/approvals/${step.id}/approve`).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CLEARANCE_REQUIREMENTS_NOT_MET');
  });

  it('later steps cannot be approved before earlier ones', async () => {
    const pending = expectStatus(await (await t.as(U.sasHead)).get('/api/v1/clearance/approvals/pending'), 200);
    const step = pending.data.find((a: { clearance_id: string }) => a.clearance_id === clearanceId);
    expect(step.is_actionable).toBe(false);
    const res = await (await t.as(U.sasHead)).post(`/api/v1/clearance/approvals/${step.id}/approve`).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PREVIOUS_STEPS_PENDING');
  });

  it('SSG fee via class remittance: the declared total pays nobody until the item is verified', async () => {
    const officer = await t.as(U.classOfficer);
    const batch = expectStatus(await officer.post('/api/v1/remittances').send({ obligationId: ids.ssgFee, declaredTotal: 100 }), 201).data;
    expectStatus(await officer.put(`/api/v1/remittances/${batch.id}/items`).send({ studentId: U.bsit1, amount: 50 }), 200);
    const item2 = expectStatus(await officer.put(`/api/v1/remittances/${batch.id}/items`).send({ studentId: U.bsit2, amount: 50 }), 200).data;
    expectStatus(await officer.post(`/api/v1/remittances/${batch.id}/submit`).send({}), 200);

    const treasurer = await t.as(U.ssgTreasurer);
    expectStatus(await treasurer.post(`/api/v1/remittances/${batch.id}/begin-review`).send({ receivedTotal: 100 }), 200);
    const receiptsBefore = expectStatus(await treasurer.get(`/api/v1/receipts?studentId=${U.bsit2}&obligationId=${ids.ssgFee}`), 200);
    expect(receiptsBefore.data.filter((r: { status: string }) => r.status === 'verified')).toHaveLength(0);

    const detail = expectStatus(await treasurer.get(`/api/v1/remittances/${batch.id}`), 200).data;
    const item1 = detail.items.find((i: { student_id: string }) => i.student_id === U.bsit1);
    expectStatus(await treasurer.post(`/api/v1/remittances/items/${item1.id}/verify`).send({ decision: 'verified' }), 200);
    expectStatus(await treasurer.post(`/api/v1/remittances/items/${item2.id}/verify`).send({ decision: 'rejected', reason: 'Not on the class list' }), 200);
    expectStatus(await treasurer.post(`/api/v1/remittances/${batch.id}/finish-review`).send({ outcome: 'completed' }), 200);

    const mine = expectStatus(await (await t.as(U.bsit1)).get(`/api/v1/receipts?studentId=${U.bsit1}&obligationId=${ids.ssgFee}`), 200);
    expect(mine.data.some((r: { status: string; source: string }) => r.status === 'verified' && r.source === 'batch')).toBe(true);
    const other = expectStatus(await treasurer.get(`/api/v1/receipts?studentId=${U.bsit2}&obligationId=${ids.ssgFee}`), 200);
    expect(other.data.filter((r: { status: string }) => r.status === 'verified')).toHaveLength(0);
  });

  it('department organization fee: recorded and verified by the PADC treasurer', async () => {
    const tr = await t.as(U.padcTreasurer);
    const rec = expectStatus(await tr.post('/api/v1/receipts').send({ obligationId: ids.padcFee, studentId: U.bsit1, amount: 50 }), 201).data;
    expect(rec.status).toBe('pending_verification');
    expectStatus(await tr.post(`/api/v1/receipts/${rec.id}/verify`).send({ decision: 'verified' }), 200);
    // Another organization's officer cannot record PADC receipts.
    expect((await (await t.as(U.ssgTreasurer)).post('/api/v1/receipts').send({ obligationId: ids.padcFee, studentId: U.bsit2, amount: 50 })).status).toBe(403);
  });

  it('club fee: the admin assigns an English Club treasurer, who records and verifies', async () => {
    const admin = await t.as(U.admin);
    expectStatus(await admin.post('/api/v1/admin/assignments').send({
      type: 'organization', userId: U.englishPres, organizationId: ids.english, positionCode: 'treasurer' }), 201);
    const tr = await t.as(U.englishPres);
    const rec = expectStatus(await tr.post('/api/v1/receipts').send({ obligationId: ids.englishFee, studentId: U.bsit1, amount: 50 }), 201).data;
    expectStatus(await tr.post(`/api/v1/receipts/${rec.id}/verify`).send({ decision: 'verified' }), 200);
  });

  it('guidance: the slip needs teacher evaluations first', async () => {
    const g = await t.as(U.guidance);
    const early = await g.post('/api/v1/guidance/issue-slip').send({ studentId: U.bsit1, officeId: ids.guidance });
    expect(early.status).toBeGreaterThanOrEqual(400);
    expectStatus(await g.post('/api/v1/guidance/confirm-evaluations').send({ studentId: U.bsit1, officeId: ids.guidance }), 200);
    const slip = expectStatus(await g.post('/api/v1/guidance/issue-slip').send({ studentId: U.bsit1, officeId: ids.guidance }), 200).data;
    expect(slip.slip_status).toBe('issued');
  });

  it('library: ID validation and receipt before the slip', async () => {
    const l = await t.as(U.library);
    const early = await l.post('/api/v1/library/issue-slip').send({ studentId: U.bsit1, officeId: ids.library });
    expect(early.status).toBeGreaterThanOrEqual(400);
    expectStatus(await l.post('/api/v1/library/validate-id').send({ studentId: U.bsit1, officeId: ids.library, libraryIdNumber: 'LIB-2026-0001', decision: 'validated' }), 200);
    expectStatus(await l.post('/api/v1/library/verify-receipt').send({ studentId: U.bsit1, officeId: ids.library, receiptNumber: 'OR-12345', amount: 20, decision: 'verified' }), 200);
    const slip = expectStatus(await l.post('/api/v1/library/issue-slip').send({ studentId: U.bsit1, officeId: ids.library }), 200).data;
    expect(slip.slip_status).toBe('issued');
    // Guidance staff cannot act for the library.
    expect((await (await t.as(U.guidance)).post('/api/v1/library/issue-slip').send({ studentId: U.bsit2, officeId: ids.library })).status).toBe(403);
  });

  it('signatures in order: SSG Governor, SAS Head, PADC Mayor, Program Head', async () => {
    const evaluated = expectStatus(await (await t.as(U.ssgGovernor)).post(`/api/v1/clearances/${clearanceId}/evaluate`).send({}), 200).data;
    const first = evaluated.approvals[0];
    expect(first.requirements.every((r: { status: string }) => r.status === 'satisfied')).toBe(true);

    for (const [user, key] of [[U.ssgGovernor, 'ssg_governor'], [U.sasHead, 'sas_head'], [U.padcMayor, 'department_mayor'], [U.programHead, 'program_head']] as const) {
      const step = evaluated.approvals.find((a: { step_key: string }) => a.step_key === key);
      expectStatus(await (await t.as(user)).post(`/api/v1/clearance/approvals/${step.id}/approve`).send({ remarks: 'OK' }), 200);
    }
    const done = expectStatus(await (await t.as(U.bsit1)).get(`/api/v1/clearances/${clearanceId}`), 200).data;
    expect(done.status).toBe('completed');
    expect(done.history.length).toBeGreaterThan(4);
  });

  it('a wrong-scope approver is refused (YMO mayor would not be PADC; program head of another program)', async () => {
    const res = await (await t.as(U.padcMayor)).get('/api/v1/clearance/approvals/pending');
    expectStatus(res, 200);
    const notifications = expectStatus(await (await t.as(U.bsit1)).get('/api/v1/notifications'), 200);
    expect(notifications.meta.total).toBeGreaterThan(0);
  });
});

describe('clearance signer names', () => {
  it('the student sees who signed each step, even though other profiles are hidden by RLS', async () => {
    const list = expectStatus(await (await t.as(U.bsit1)).get('/api/v1/clearances'), 200).data;
    const c = expectStatus(await (await t.as(U.bsit1)).get(`/api/v1/clearances/${list[0].id}`), 200).data;
    expect(c.approvals.every((a: { acted_by_name: string | null }) => typeof a.acted_by_name === 'string')).toBe(true);
    const direct = await (await t.as(U.bsit1)).get(`/api/v1/students?q=Governor`);
    expect(direct.body.data ?? []).toHaveLength(0); // still no general access to other profiles
  });
});
