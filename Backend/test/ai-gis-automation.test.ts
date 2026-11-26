import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { pino } from 'pino';
import { createTestContext, expectStatus, idOf, U } from './helpers.js';
import { chunkText, extractText } from '../src/modules/ai/knowledge.js';
import { runAutomationBatch } from '../src/workers/automation-worker.js';

const t = createTestContext();
afterAll(() => t.close());

describe('AI knowledge and assistant (mock provider)', () => {
  let publicSource = '';
  let staffSource = '';

  it('extracts and chunks text without inventing content', () => {
    expect(extractText(Buffer.from('<h1>Fees</h1><p>A &amp; B</p><script>x()</script>'), 'text/html')).toBe('# Fees\nA & B');
    const chunks = chunkText('# Queue\n\nReserve a slot online.\n\n# Fees\n\nPay at the cashier.');
    expect(chunks.map((c) => c.heading)).toEqual(['Queue', 'Fees']);
    expect(() => extractText(Buffer.from('%PDF-1.4'), 'application/pdf')).toThrow(/not available/);
  });

  it('students cannot register knowledge sources', async () => {
    const res = await (await t.as(U.bsit1)).post('/api/v1/ai/sources').send({ name: 'Mine', sourceType: 'faq', visibility: 'public' });
    expect(res.status).toBe(403);
  });

  it('a manager registers public and staff-only sources and adds documents', async () => {
    const a = await t.as(U.admin);
    publicSource = expectStatus(await a.post('/api/v1/ai/sources').send({ name: 'Public FAQ (test)', sourceType: 'faq', visibility: 'public' }), 201).data.id;
    staffSource = expectStatus(await a.post('/api/v1/ai/sources').send({
      name: 'Staff procedures (test)', sourceType: 'office_guide', visibility: 'permission', requiredPermission: 'requests.manage' }), 201).data.id;
    const d1 = expectStatus(await a.post(`/api/v1/ai/sources/${publicSource}/documents/manual`).send({
      title: 'Queue FAQ', content: '# Reserving a slot\n\nStudents reserve a queue slot online from the Queue page and arrive at their time.' }), 201).data;
    expect(d1.status).toBe('ready');
    const d2 = expectStatus(await a.post(`/api/v1/ai/sources/${staffSource}/documents`)
      .field('title', 'Release procedure').attach('file', Buffer.from('# Internal\n\nStaff verify the release slip zebracode before handing documents over.'), { filename: 'proc.md', contentType: 'text/markdown' }), 201).data;
    expect(d2.status).toBe('ready');
    const pdf = expectStatus(await a.post(`/api/v1/ai/sources/${publicSource}/documents`)
      .field('title', 'Scanned handbook').attach('file', Buffer.from('%PDF-1.4\n%%EOF\n'), { filename: 'h.pdf', contentType: 'application/pdf' }), 201).data;
    expect(pdf.status).toBe('failed');
    const docs = expectStatus(await a.get(`/api/v1/ai/sources/${publicSource}/documents`), 200).data;
    expect(docs.find((d: { title: string }) => d.title === 'Scanned handbook').processing_error).toMatch(/not available/);
  });

  it('answers from sources the student may see and cites them; staff-only content is not leaked', async () => {
    const s = await t.as(U.bsit1);
    const r = expectStatus(await s.post('/api/v1/ai/chat').send({ message: 'How do I reserve a queue slot?' }), 200).data;
    expect(r.isMock).toBe(true);
    expect(r.citations[0].title).toBe('Queue FAQ');
    const leak = expectStatus(await s.post('/api/v1/ai/chat').send({ message: 'zebracode release slip', conversationId: r.conversationId }), 200).data;
    expect(leak.answer).not.toContain('zebracode');
    const staff = expectStatus(await (await t.as(U.registrar)).post('/api/v1/ai/chat').send({ message: 'zebracode release slip' }), 200).data;
    expect(staff.answer).toContain('zebracode');
  });

  it('conversations are private to their owner', async () => {
    const list = expectStatus(await (await t.as(U.bsit1)).get('/api/v1/ai/conversations'), 200).data;
    expect(list.length).toBeGreaterThan(0);
    expect((await (await t.as(U.bsit2)).get(`/api/v1/ai/conversations/${list[0].id}`)).status).toBe(404);
    const conv = expectStatus(await (await t.as(U.bsit1)).get(`/api/v1/ai/conversations/${list[0].id}`), 200).data;
    expect(conv.messages.length).toBe(4);
    const msg = conv.messages.find((m: { role: string }) => m.role === 'assistant');
    expectStatus(await (await t.as(U.bsit1)).post(`/api/v1/ai/messages/${msg.id}/feedback`).send({ rating: 1 }), 201);
  });

  it('the public assistant only uses public sources and needs no account', async () => {
    const r = expectStatus(await request(t.app).post('/api/v1/public/ai/chat').send({ message: 'zebracode queue slot' }), 200).data;
    expect(r.answer).not.toContain('zebracode');
    expect(r.sessionToken).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    const again = expectStatus(await request(t.app).post('/api/v1/public/ai/chat').send({ message: 'and then?', sessionToken: r.sessionToken }), 200).data;
    expect(again.sessionToken).toBe(r.sessionToken);
  });

  it('enforces the per-user daily limit', async () => {
    await t.sql(`update public.ai_provider_settings set max_requests_per_user_per_day = 1 where purpose = 'chat'`);
    try {
      const s = await t.as(U.beed);
      expectStatus(await s.post('/api/v1/ai/chat').send({ message: 'hello' }), 200);
      const limited = await s.post('/api/v1/ai/chat').send({ message: 'hello again' });
      expect(limited.status).toBe(429);
    } finally {
      await t.sql(`update public.ai_provider_settings set max_requests_per_user_per_day = 50 where purpose = 'chat'`);
    }
  });

  it('request classification is only a suggestion; the request status is untouched', async () => {
    const svc = await idOf(t, `select id from public.services where code = 'DOCUMENT_REQUEST'`);
    const req = expectStatus(await (await t.as(U.bsit1)).post('/api/v1/requests').send({ serviceId: svc, purpose: 'Document request for transcript' }), 201).data;
    expect((await (await t.as(U.bsit1)).post(`/api/v1/ai/requests/${req.id}/suggest-category`).send({})).status).toBe(403);
    const s = expectStatus(await (await t.as(U.registrar)).post(`/api/v1/ai/requests/${req.id}/suggest-category`).send({}), 200).data;
    expect(s.suggestedCategory).toBeTruthy();
    const row = (await t.sql<{ status: string; ai_suggested_category: string }>(`select status, ai_suggested_category from public.service_requests where id = $1`, [req.id]))[0]!;
    expect(row.status).toBe('submitted');
    expect(row.ai_suggested_category).toBe(s.suggestedCategory);
  });

  it('usage analytics are admin-only and contain no message content', async () => {
    expect((await (await t.as(U.bsit1)).get('/api/v1/ai/usage')).status).toBe(403);
    const u = expectStatus(await (await t.as(U.admin)).get('/api/v1/ai/usage'), 200).data;
    expect(u.length).toBeGreaterThan(0);
    expect(JSON.stringify(u)).not.toContain('queue slot');
  });
});

describe('GIS (synthetic test geometry only)', () => {
  let campus = '';
  let a = '';
  let b = '';
  beforeAll(async () => {
    campus = await idOf(t, `select id from public.campuses where code = 'OMSU_MAMBURAO'`);
    await t.sql(`insert into public.user_roles (user_id, role) values ($1, 'administrator') on conflict do nothing`, [U.cashier]); // second verifier
  });
  afterAll(async () => { await t.sql(`delete from public.user_roles where user_id = $1 and role = 'administrator'`, [U.cashier]); });

  it('the public map is empty: nothing is invented', async () => {
    const map = expectStatus(await request(t.app).get('/api/v1/public/gis/map'), 200).data;
    expect(map.type).toBe('FeatureCollection');
    expect(map.features).toHaveLength(0);
  });

  it('validates input and permissions', async () => {
    expect((await (await t.as(U.bsit1)).post('/api/v1/gis/locations').send({ campusId: campus, name: 'X', point: { type: 'Point', coordinates: [121, 14] } })).status).toBe(403);
    const far = await (await t.as(U.admin)).post('/api/v1/gis/locations').send({ campusId: campus, name: 'Paris', point: { type: 'Point', coordinates: [2.35, 48.85] } });
    expect(far.body.error.code).toBe('INVALID_GEOMETRY');
  });

  it('routes only over verified paths between verified locations', async () => {
    const adm = await t.as(U.admin);
    a = expectStatus(await adm.post('/api/v1/gis/locations').send({ campusId: campus, name: 'Test Hall A', point: { type: 'Point', coordinates: [121.0, 14.0] }, categoryCode: 'office', layerCode: 'locations' }), 201).data.id;
    b = expectStatus(await adm.post('/api/v1/gis/locations').send({ campusId: campus, name: 'Test Hall B', point: { type: 'Point', coordinates: [121.0005, 14.0005] }, categoryCode: 'office', layerCode: 'locations' }), 201).data.id;
    const p1 = expectStatus(await adm.post('/api/v1/gis/paths').send({ campusId: campus, line: { type: 'LineString', coordinates: [[121.0, 14.0], [121.0005, 14.0]] }, name: 'Walk 1' }), 201).data.id;
    const p2 = expectStatus(await adm.post('/api/v1/gis/paths').send({ campusId: campus, line: { type: 'LineString', coordinates: [[121.0005, 14.0], [121.0005, 14.0005]] }, name: 'Walk 2' }), 201).data.id;
    const before = expectStatus(await (await t.as(U.bsit1)).get(`/api/v1/gis/route?from=${a}&to=${b}`), 200).data;
    expect(before.status).toBe('unavailable');
    expect(before.reason).toBe('location_unverified');
    // The creator cannot verify their own entry; a second administrator does.
    expect((await adm.post('/api/v1/gis/verify').send({ featureType: 'location', featureId: a, decision: 'verified', method: 'field_survey' })).status).toBeGreaterThanOrEqual(400);
    const v = await t.as(U.cashier);
    for (const [type, id] of [['location', a], ['location', b], ['path', String(p1)], ['path', String(p2)]]) {
      expectStatus(await v.post('/api/v1/gis/verify').send({ featureType: type, featureId: id, decision: 'verified', method: 'field_survey', evidence: 'test' }), 200);
    }
    const route = expectStatus(await (await t.as(U.bsit1)).get(`/api/v1/gis/route?from=${a}&to=${b}`), 200).data;
    expect(route.status).toBe('ok');
    expect(route.routes[0].distance_m ?? route.routes[0].distance).toBeGreaterThan(0);
    const pub = expectStatus(await request(t.app).get('/api/v1/public/gis/map'), 200).data;
    expect(pub.features.length).toBeGreaterThanOrEqual(2);
    const search = expectStatus(await request(t.app).get('/api/v1/public/gis/search?q=hall'), 200).data;
    expect(search.some((s: { name: string }) => s.name === 'Test Hall A')).toBe(true);
  });
});

describe('automation', () => {
  it('only automation managers can save rules; the action list is closed', async () => {
    const body = { code: 'test_rule', name: 'Test rule', triggerCode: 'service_request.submitted', actions: [{ action_type: 'send_notification', parameters: {} }] };
    expect((await (await t.as(U.bsit1)).post('/api/v1/automation/rules').send(body)).status).toBe(403);
    const bad = await (await t.as(U.admin)).post('/api/v1/automation/rules').send({ ...body, actions: [{ action_type: 'approve_clearance', parameters: {} }] });
    expect(bad.status).toBe(400);
  });

  it('lists triggers, jobs and templates for managers', async () => {
    const a = await t.as(U.admin);
    expect(expectStatus(await a.get('/api/v1/automation/triggers'), 200).data.length).toBeGreaterThan(0);
    expect(expectStatus(await a.get('/api/v1/automation/scheduled-jobs'), 200).data.length).toBeGreaterThan(0);
    expectStatus(await a.get('/api/v1/automation/templates'), 200);
  });

  it('the worker runs backend report actions and fails email honestly', async () => {
    const triggers = expectStatus(await (await t.as(U.admin)).get('/api/v1/automation/triggers'), 200).data as { code: string }[];
    const trig = triggers.find((x) => x.code === 'service_request.submitted') ?? triggers[0]!;
    const a = await t.as(U.admin);
    const r1 = expectStatus(await a.post('/api/v1/automation/rules').send({
      code: 'test_report_rule', name: 'Report on submit', triggerCode: trig.code, actions: [{ action_type: 'generate_report', parameters: {} }] }), 201).data;
    const r2 = expectStatus(await a.post('/api/v1/automation/rules').send({
      code: 'test_email_rule', name: 'Email on submit', triggerCode: trig.code, actions: [{ action_type: 'send_email', parameters: {} }] }), 201).data;
    expect(r1.is_enabled).toBe(false); // new rules start disabled
    for (const r of [r1, r2]) expectStatus(await a.post(`/api/v1/automation/rules/${r.id}/enabled`).send({ enabled: true }), 200);
    const svc = await idOf(t, `select id from public.services where code = 'DOCUMENT_REQUEST'`);
    expectStatus(await (await t.as(U.cbam)).post('/api/v1/requests').send({ serviceId: svc, purpose: 'Good moral certificate' }), 201);
    await t.sql(`select public.automation_run_due(50)`); // event matching normally runs from pg_cron every minute
    const n = await runAutomationBatch(t.db, pino({ level: 'silent' }), 'test-worker');
    expect(n).toBeGreaterThanOrEqual(2);
    const rows = await t.sql<{ code: string; status: string; last_error: string | null }>(
      `select r.code, x.status, x.last_error from public.automation_executions x join public.automation_rules r on r.id = x.rule_id
        where r.code in ('test_report_rule', 'test_email_rule') order by r.code`);
    expect(rows.find((r) => r.code === 'test_report_rule')!.status).toBe('succeeded');
    const email = rows.find((r) => r.code === 'test_email_rule')!;
    expect(email.status).toBe('queued'); // retried later with backoff
    expect(email.last_error).toBe('EMAIL_PROVIDER_NOT_CONFIGURED');
  });
});
