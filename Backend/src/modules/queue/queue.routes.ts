import { z } from 'zod';
import { handler, idParams, optionalText, pagination, send } from '../../http/http.js';
import { rpcOne, rpcValue } from '../../db/database.js';
import { notFound } from '../../http/errors.js';
import type { ModuleContext } from '../context.js';
import { dateString, paged } from '../shared.js';

const ticketColumns = `t.*, s.code as service_code, s.name as service_name, o.code as office_code, o.name as office_name,
  sl.slot_date, sl.start_time, sl.end_time`;
const ticketJoins = `from public.queue_tickets t join public.services s on s.id = t.service_id
  join public.offices o on o.id = t.office_id join public.queue_slots sl on sl.id = t.slot_id`;

/** Online queueing. Every rule (capacity, limits, cut-offs, numbering) is enforced by the database functions. */
export function queueModule({ deps, authed }: ModuleContext) {
  const { db } = deps;

  authed.get('/queue/services/:id/slots', handler({
    params: idParams,
    query: z.object({ from: z.string().regex(dateString).optional(), to: z.string().regex(dateString).optional() }),
  }, async (req, res, { params, query }) => {
    send(res, await db.asUser(req.actor!, async (c) => (await c.query(
      `select id, slot_date, start_time, end_time, capacity, reserved_count, greatest(capacity - reserved_count, 0) as available, status
         from public.queue_slots
        where service_id = $1 and slot_date between coalesce($2::date, (now() at time zone 'Asia/Manila')::date)
              and coalesce($3::date, (now() at time zone 'Asia/Manila')::date + 14)
        order by slot_date, start_time`, [params.id, query.from ?? null, query.to ?? null])).rows));
  }));

  authed.post('/queue/tickets', handler({ body: z.object({ slotId: z.uuid() }).strict() }, async (req, res, { body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'reserve_queue_slot', { p_slot_id: body.slotId })), 201);
  }));

  authed.get('/queue/tickets/mine', handler({
    query: z.object({ status: z.enum(['active', 'history']).default('active') }),
  }, async (req, res, { query }) => {
    const active = query.status === 'active';
    send(res, await db.asUser(req.actor!, async (c) => (await c.query(
      `select ${ticketColumns} ${ticketJoins}
        where t.student_id = auth.uid() and (t.status in ('reserved', 'checked_in', 'serving')) = $1
        order by sl.slot_date ${active ? 'asc' : 'desc'}, sl.start_time limit 100`, [active])).rows));
  }));

  authed.get('/queue/tickets/:id', handler({ params: idParams }, async (req, res, { params }) => {
    const data = await db.asUser(req.actor!, async (c) => {
      const ticket = (await c.query(`select ${ticketColumns} ${ticketJoins} where t.id = $1`, [params.id])).rows[0];
      if (!ticket) return null;
      const events = (await c.query(`select * from public.queue_events where ticket_id = $1 order by created_at`, [params.id])).rows;
      return { ...ticket, events };
    });
    if (!data) throw notFound('Ticket');
    send(res, data);
  }));

  authed.post('/queue/tickets/:id/cancel', handler({
    params: idParams, body: z.object({ reason: optionalText(300) }).strict(),
  }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'cancel_queue_ticket', { p_ticket_id: params.id, p_reason: body.reason ?? null })));
  }));

  authed.post('/queue/tickets/:id/reschedule', handler({
    params: idParams, body: z.object({ slotId: z.uuid() }).strict(),
  }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'reschedule_queue_ticket', { p_ticket_id: params.id, p_new_slot_id: body.slotId })));
  }));

  // ---- Office staff -------------------------------------------------------------------------------
  authed.get('/queue/offices/:id/board', handler({
    params: idParams,
    query: pagination.extend({ date: z.string().regex(dateString).optional(), serviceId: z.uuid().optional(), status: z.string().max(20).optional() }),
  }, async (req, res, { params, query }) => {
    const result = await db.asUser(req.actor!, (c) => paged(c,
      `select ${ticketColumns}, p.full_name as student_name, st.student_number ${ticketJoins}
         join public.profiles p on p.id = t.student_id join public.students st on st.profile_id = t.student_id
        where t.office_id = $1 and sl.slot_date = coalesce($2::date, (now() at time zone 'Asia/Manila')::date)
          and ($3::uuid is null or t.service_id = $3) and ($4::text is null or t.status = $4)`,
      [params.id, query.date ?? null, query.serviceId ?? null, query.status ?? null], query, 'start_time, queue_number'));
    send(res, result.rows, 200, result.meta);
  }));

  authed.post('/queue/slots/:id/call-next', handler({ params: idParams }, async (req, res, { params }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'call_next_queue_ticket', { p_slot_id: params.id })));
  }));

  authed.post('/queue/tickets/:id/status', handler({
    params: idParams,
    body: z.object({ status: z.enum(['checked_in', 'serving', 'completed', 'no_show']), notes: optionalText(500) }).strict(),
  }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'update_queue_ticket_status', {
      p_ticket_id: params.id, p_status: body.status, p_notes: body.notes ?? null })));
  }));

  authed.get('/queue/schedules', handler({ query: z.object({ serviceId: z.uuid().optional() }) }, async (req, res, { query }) => {
    send(res, await db.asUser(req.actor!, async (c) => (await c.query(
      `select q.*, s.code as service_code, s.name as service_name from public.queue_schedules q
         join public.services s on s.id = q.service_id where ($1::uuid is null or q.service_id = $1)
        order by s.name, q.day_of_week, q.start_time`, [query.serviceId ?? null])).rows));
  }));

  authed.post('/queue/schedules/:id/generate-slots', handler({
    params: idParams,
    body: z.object({ from: z.string().regex(dateString), to: z.string().regex(dateString) }).strict(),
  }, async (req, res, { params, body }) => {
    const created = await db.asUser(req.actor!, (c) => rpcValue<number>(c, 'generate_queue_slots', {
      p_schedule_id: params.id, p_from: body.from, p_to: body.to }));
    send(res, { created });
  }));
}
