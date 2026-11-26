import { afterAll, describe, expect, it } from 'vitest';
import { createTestContext, expectStatus, idOf, U } from './helpers.js';
import { toCsv } from '../src/modules/reports/reports.routes.js';

const t = createTestContext();
afterAll(() => t.close());

describe('administration', () => {
  it('only administrators can list users', async () => {
    expect((await (await t.as(U.registrar)).get('/api/v1/admin/users')).status).toBe(403);
    const res = expectStatus(await (await t.as(U.admin)).get('/api/v1/admin/users?pageSize=5'), 200);
    expect(res.data).toHaveLength(5);
    expect(res.meta.total).toBeGreaterThanOrEqual(18);
  });

  it('prevents self-lockout', async () => {
    const a = await t.as(U.admin);
    expect((await a.patch(`/api/v1/admin/users/${U.admin}`).send({ isActive: false })).body.error.code).toBe('SELF_LOCKOUT');
    expect((await a.delete(`/api/v1/admin/users/${U.admin}/roles/administrator`)).body.error.code).toBe('SELF_LOCKOUT');
  });

  it('grants and revokes a role, recorded in the audit log under the admin', async () => {
    const a = await t.as(U.admin);
    expectStatus(await a.post(`/api/v1/admin/users/${U.cbam}/roles`).send({ role: 'cashier' }), 201);
    const after = expectStatus(await (await t.as(U.cbam)).get('/api/v1/me'), 200).data;
    expect(after.roles).toContain('cashier');
    expect((await a.delete(`/api/v1/admin/users/${U.cbam}/roles/cashier`)).status).toBe(204);
    const logs = expectStatus(await a.get('/api/v1/admin/audit-logs?entityType=user_roles'), 200).data;
    expect(logs.some((l: { actor_id: string; action: string }) => l.actor_id === U.admin)).toBe(true);
  });

  it('a deactivated user loses access to data', async () => {
    const a = await t.as(U.admin);
    expectStatus(await a.patch(`/api/v1/admin/users/${U.bsit2}`).send({ isActive: false }), 200);
    const res = await (await t.as(U.bsit2)).get('/api/v1/clearances');
    expect(res.status === 403 || (res.status === 200 && res.body.data.length === 0)).toBe(true);
    expectStatus(await a.patch(`/api/v1/admin/users/${U.bsit2}`).send({ isActive: true }), 200);
  });

  it('policy versions: draft then activate; the old version is retired, never edited', async () => {
    const a = await t.as(U.admin);
    const policyId = await idOf(t, `select id from public.violation_policies where code = 'EVENT_VIOLATION'`);
    const draft = expectStatus(await a.post(`/api/v1/admin/violation-policies/${policyId}/versions`).send({
      calculationType: 'per_violation', hoursPerViolation: 1, amountPerViolation: 60, allowedResolutions: ['community_service', 'payment'], penaltyConfirmed: true }), 201).data;
    expect(draft.status).toBe('draft');
    expectStatus(await a.post(`/api/v1/admin/policy-versions/${draft.id}/activate`).send({}), 200);
    const versions = await t.sql<{ status: string }>(`select status from public.violation_policy_versions where policy_id = $1 order by version_number`, [policyId]);
    expect(versions.map((v) => v.status)).toEqual(['retired', 'active']);
    expect((await a.post(`/api/v1/admin/policy-versions/${draft.id}/activate`).send({})).status).toBe(409);
  });

  it('clearance templates are versioned: an active template cannot be edited', async () => {
    const a = await t.as(U.admin);
    const tpl = expectStatus(await a.get('/api/v1/clearance/templates'), 200).data.find((x: { status: string }) => x.status === 'active');
    const step = tpl.steps[0];
    expect((await a.patch(`/api/v1/admin/clearance-steps/${step.id}`).send({ name: 'Renamed' })).status).toBe(409);
    const copy = expectStatus(await a.post(`/api/v1/admin/clearance-templates/${tpl.id}/new-version`).send({}), 201).data;
    expect(copy.status).toBe('draft');
    expect(copy.version).toBe(tpl.version + 1);
  });

  it('settings changes need config.manage', async () => {
    expect((await (await t.as(U.sasHead)).get('/api/v1/admin/settings')).status).toBe(403);
    expectStatus(await (await t.as(U.admin)).get('/api/v1/admin/settings'), 200);
  });
});

describe('reports', () => {
  it('students cannot view reports', async () => {
    expect((await (await t.as(U.bsit1)).get('/api/v1/reports/summary')).status).toBe(403);
  });

  it('staff see a summary scoped by RLS; CSV export works', async () => {
    expectStatus(await (await t.as(U.sasHead)).get('/api/v1/reports/summary'), 200);
    const csv = await (await t.as(U.admin)).get('/api/v1/reports/receipts-by-obligation?format=csv');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.split('\r\n')[0]).toContain('obligation');
  });

  it('CSV cells are escaped and spreadsheet formulas neutralised', () => {
    expect(toCsv([{ a: '=SUM(A1)', b: 'x,"y"' }])).toBe(`a,b\r\n'=SUM(A1),"x,""y"""`);
  });
});
