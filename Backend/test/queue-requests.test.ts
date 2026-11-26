import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestContext, expectStatus, idOf, U } from './helpers.js';

const t = createTestContext();
afterAll(() => t.close());

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

let counselingService = '';
let docService = '';
let guidanceOffice = '';
let registrar = '';
beforeAll(async () => {
  counselingService = await idOf(t, `select id from public.services where code = 'COUNSELING'`);
  docService = await idOf(t, `select id from public.services where code = 'DOCUMENT_REQUEST'`);
  guidanceOffice = await idOf(t, `select id from public.offices where code = 'GUIDANCE'`);
  registrar = await idOf(t, `select id from public.offices where code = 'REGISTRAR'`);
});

describe('online queue', () => {
  let slotId = '';
  let ticketId = '';

  it('lists upcoming slots with availability', async () => {
    const slots = expectStatus(await (await t.as(U.cbam)).get(`/api/v1/queue/services/${counselingService}/slots`), 200).data;
    expect(slots.length).toBeGreaterThan(0);
    // Pick a slot far enough ahead to be outside the cancellation cut-off.
    const later = slots.filter((s: { slot_date: string; available: number }) => s.available > 0 && new Date(s.slot_date) > new Date(Date.now() + 2 * 86400000));
    slotId = later[0].id;
  });

  it('reserves a ticket with a queue number; a duplicate reservation is a 409', async () => {
    const s = await t.as(U.cbam);
    const ticket = expectStatus(await s.post('/api/v1/queue/tickets').send({ slotId }), 201).data;
    expect(ticket.status).toBe('reserved');
    expect(ticket.queue_number).toBeGreaterThan(0);
    ticketId = ticket.id;
    const dup = await s.post('/api/v1/queue/tickets').send({ slotId });
    expect(dup.status).toBe(409);
    const mine = expectStatus(await s.get('/api/v1/queue/tickets/mine'), 200).data;
    expect(mine.some((x: { id: string }) => x.id === ticketId)).toBe(true);
  });

  it('students cannot operate the office queue', async () => {
    expect([403, 404]).toContain((await (await t.as(U.cbam)).post(`/api/v1/queue/slots/${slotId}/call-next`).send({})).status);
    expect([403, 404]).toContain((await (await t.as(U.cbam)).post(`/api/v1/queue/tickets/${ticketId}/status`).send({ status: 'completed' })).status);
  });

  it('staff of another office cannot see or operate this ticket', async () => {
    expect((await (await t.as(U.library)).post(`/api/v1/queue/tickets/${ticketId}/status`).send({ status: 'checked_in' })).status).toBeGreaterThanOrEqual(403);
  });

  it('guidance staff move the ticket through check-in, serving and completion', async () => {
    const g = await t.as(U.guidance);
    const slot = (await t.sql<{ slot_date: string }>(`select slot_date::text from public.queue_slots where id = $1`, [slotId]))[0]!;
    const board = expectStatus(await g.get(`/api/v1/queue/offices/${guidanceOffice}/board?date=${slot.slot_date}`), 200);
    expect(board.data.some((x: { id: string }) => x.id === ticketId)).toBe(true);
    expectStatus(await g.post(`/api/v1/queue/tickets/${ticketId}/status`).send({ status: 'checked_in' }), 200);
    expectStatus(await g.post(`/api/v1/queue/tickets/${ticketId}/status`).send({ status: 'serving' }), 200);
    expectStatus(await g.post(`/api/v1/queue/tickets/${ticketId}/status`).send({ status: 'completed' }), 200);
    const bad = await g.post(`/api/v1/queue/tickets/${ticketId}/status`).send({ status: 'serving' });
    expect(bad.status).toBe(409);
    const detail = expectStatus(await (await t.as(U.cbam)).get(`/api/v1/queue/tickets/${ticketId}`), 200).data;
    expect(detail.events.length).toBeGreaterThanOrEqual(4);
  });

  it('a student can cancel their own reservation', async () => {
    const s = await t.as(U.beed);
    const tk = expectStatus(await s.post('/api/v1/queue/tickets').send({ slotId }), 201).data;
    const c = expectStatus(await s.post(`/api/v1/queue/tickets/${tk.id}/cancel`).send({ reason: 'Schedule conflict' }), 200).data;
    expect(c.status).toBe('cancelled');
    expect((await (await t.as(U.cbam)).post(`/api/v1/queue/tickets/${tk.id}/cancel`).send({})).status).toBeGreaterThanOrEqual(403);
  });
});

describe('service requests and private documents', () => {
  let requestId = '';

  it('a student submits a request; validation rejects empty purpose', async () => {
    const s = await t.as(U.cbam);
    expect((await s.post('/api/v1/requests').send({ serviceId: docService, purpose: '   ' })).status).toBe(400);
    const r = expectStatus(await s.post('/api/v1/requests').send({ serviceId: docService, purpose: 'Certificate of enrollment for scholarship' }), 201).data;
    expect(r.status).toBe('submitted');
    requestId = r.id;
  });

  it('accepts a real PDF and rejects a disguised executable', async () => {
    const s = await t.as(U.cbam);
    const ok = expectStatus(await s.post(`/api/v1/requests/${requestId}/documents`).attach('file', PDF, { filename: 'id.pdf', contentType: 'application/pdf' }), 201).data;
    expect(ok.mime_type).toBe('application/pdf');
    const bad = await s.post(`/api/v1/requests/${requestId}/documents`).attach('file', EXE, { filename: 'id.pdf', contentType: 'application/pdf' });
    expect(bad.status).toBe(415);
    expect([...t.storage.files.keys()].filter((k) => k.includes(requestId))).toHaveLength(1);
  });

  it('other students cannot see, upload to, or download from the request', async () => {
    const other = await t.as(U.beed);
    expect((await other.get(`/api/v1/requests/${requestId}`)).status).toBe(404);
    expect((await other.post(`/api/v1/requests/${requestId}/documents`).attach('file', PDF, { filename: 'x.pdf', contentType: 'application/pdf' })).status).toBe(404);
    const doc = (await t.sql<{ id: string }>(`select id from public.request_documents where request_id = $1`, [requestId]))[0]!;
    expect((await other.get(`/api/v1/requests/${requestId}/documents/${doc.id}/url`)).status).toBe(404);
    const owner = expectStatus(await (await t.as(U.cbam)).get(`/api/v1/requests/${requestId}/documents/${doc.id}/url`), 200).data;
    expect(owner.url).toMatch(/^\/api\/v1\/dev-files\//);
    const file = await request(t.app).get(owner.url);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect((await request(t.app).get(owner.url.slice(0, -3) + 'xyz')).status).toBe(404);
  });

  it('registrar staff process the request; the student is notified', async () => {
    const r = await t.as(U.registrar);
    const list = expectStatus(await r.get(`/api/v1/requests?scope=office&officeId=${registrar}`), 200);
    expect(list.data.some((x: { id: string }) => x.id === requestId)).toBe(true);
    expect((await r.post(`/api/v1/requests/${requestId}/status`).send({ status: 'released' })).status).toBe(409);
    expect((await r.post(`/api/v1/requests/${requestId}/status`).send({ status: 'rejected' })).status).toBe(422);
    for (const status of ['in_review', 'ready_for_release', 'released']) {
      expectStatus(await r.post(`/api/v1/requests/${requestId}/status`).send({ status }), 200);
    }
    const n = expectStatus(await (await t.as(U.cbam)).get('/api/v1/notifications?unread=true'), 200);
    expect(n.meta.unread).toBeGreaterThan(0);
    const first = n.data[0];
    expectStatus(await (await t.as(U.cbam)).post(`/api/v1/notifications/${first.id}/read`).send({}), 200);
    expect((await (await t.as(U.beed)).post(`/api/v1/notifications/${first.id}/read`).send({})).status).toBe(404);
  });

  it('public endpoints expose only active services without auth', async () => {
    const res = expectStatus(await request(t.app).get('/api/v1/public/services'), 200);
    expect(res.data.length).toBeGreaterThan(0);
    expect(Object.keys(res.data[0])).not.toContain('max_active_tickets_per_student');
  });
});
