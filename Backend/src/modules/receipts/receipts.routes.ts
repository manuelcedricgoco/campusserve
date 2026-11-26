import { z } from 'zod';
import { handler, idParams, optionalText, pagination, send, text } from '../../http/http.js';
import { rpc, rpcOne } from '../../db/database.js';
import { forbidden, notFound } from '../../http/errors.js';
import type { ModuleContext } from '../context.js';
import { elevate, hasOrg, paged } from '../shared.js';

const money = z.number().positive().max(1_000_000).multipleOf(0.01);

/**
 * Organization receipts and class remittance batches. A batch's declared total never pays anyone:
 * only individually verified batch items become receipt records (enforced by the database).
 */
export function receiptsModule({ deps, authed }: ModuleContext) {
  const { db } = deps;

  authed.get('/receipts/obligations', handler({ query: z.object({ organizationId: z.uuid().optional() }) }, async (req, res, { query }) => {
    send(res, await db.asUser(req.actor!, async (c) => (await c.query(
      `select ob.*, o.code as organization_code, o.name as organization_name, ay.code as academic_year
         from public.receipt_obligations ob join public.organizations o on o.id = ob.organization_id
         join public.academic_years ay on ay.id = ob.academic_year_id
        where ob.is_active and ($1::uuid is null or ob.organization_id = $1) order by o.name, ob.name`,
      [query.organizationId ?? null])).rows));
  }));

  authed.get('/receipts', handler({
    query: pagination.extend({
      organizationId: z.uuid().optional(), studentId: z.uuid().optional(), obligationId: z.uuid().optional(),
      status: z.enum(['pending_verification', 'verified', 'rejected', 'void']).optional(),
    }),
  }, async (req, res, { query }) => {
    const result = await db.asUser(req.actor!, (c) => paged(c,
      `select r.*, ob.code as obligation_code, ob.name as obligation_name, o.code as organization_code,
              p.full_name as student_name, st.student_number
         from public.receipt_records r join public.receipt_obligations ob on ob.id = r.obligation_id
         join public.organizations o on o.id = r.organization_id left join public.profiles p on p.id = r.student_id
         left join public.students st on st.profile_id = r.student_id
        where ($1::uuid is null or r.organization_id = $1) and ($2::uuid is null or r.student_id = $2)
          and ($3::uuid is null or r.obligation_id = $3) and ($4::text is null or r.status = $4)`,
      [query.organizationId ?? null, query.studentId ?? null, query.obligationId ?? null, query.status ?? null],
      query, 'recorded_at desc'));
    send(res, result.rows, 200, result.meta);
  }));

  authed.post('/receipts', handler({
    body: z.object({ obligationId: z.uuid(), studentId: z.uuid(), amount: money, notes: optionalText(500) }).strict(),
  }, async (req, res, { body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'record_individual_receipt', {
      p_obligation_id: body.obligationId, p_student_id: body.studentId, p_amount: body.amount, p_notes: body.notes ?? null })), 201);
  }));

  authed.post('/receipts/:id/verify', handler({
    params: idParams,
    body: z.object({ decision: z.enum(['verified', 'rejected', 'voided']), notes: optionalText(500) }).strict(),
  }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'verify_receipt_record', {
      p_receipt_id: params.id, p_decision: body.decision, p_notes: body.notes ?? null })));
  }));

  // ---- Remittance batches --------------------------------------------------------------------------
  authed.get('/remittances', handler({
    query: pagination.extend({
      organizationId: z.uuid().optional(),
      status: z.enum(['draft', 'submitted', 'under_review', 'completed', 'returned']).optional(),
    }),
  }, async (req, res, { query }) => {
    const result = await db.asUser(req.actor!, (c) => paged(c,
      `select b.*, ob.code as obligation_code, ob.name as obligation_name, ob.amount as obligation_amount,
              o.code as organization_code, p.full_name as class_officer_name, pr.code as program_code,
              (select count(*)::int from public.remittance_batch_items i where i.batch_id = b.id) as item_count
         from public.remittance_batches b join public.receipt_obligations ob on ob.id = b.obligation_id
         join public.organizations o on o.id = b.organization_id left join public.profiles p on p.id = b.class_officer_id
         left join public.programs pr on pr.id = b.program_id
        where ($1::uuid is null or b.organization_id = $1) and ($2::text is null or b.status = $2)`,
      [query.organizationId ?? null, query.status ?? null], query, 'created_at desc'));
    send(res, result.rows, 200, result.meta);
  }));

  authed.get('/remittances/:id', handler({ params: idParams }, async (req, res, { params }) => {
    const data = await db.asUser(req.actor!, async (c) => {
      const batch = (await c.query(
        `select b.*, ob.code as obligation_code, ob.name as obligation_name, ob.amount as obligation_amount, o.code as organization_code
           from public.remittance_batches b join public.receipt_obligations ob on ob.id = b.obligation_id
           join public.organizations o on o.id = b.organization_id where b.id = $1`, [params.id])).rows[0];
      if (!batch) return null;
      // The caller can see this batch (RLS). Its items' student names are part of the batch, but class officers
      // cannot read other students' profiles, so names are resolved with the service role for this batch only.
      await elevate(c);
      const items = (await c.query(
        `select i.*, p.full_name as student_name, st.student_number from public.remittance_batch_items i
           left join public.profiles p on p.id = i.student_id left join public.students st on st.profile_id = i.student_id
          where i.batch_id = $1 order by p.full_name`, [params.id])).rows;
      return { ...batch, items };
    });
    if (!data) throw notFound('Remittance batch');
    send(res, data);
  }));

  authed.post('/remittances', handler({
    body: z.object({ obligationId: z.uuid(), declaredTotal: z.number().min(0).max(10_000_000).multipleOf(0.01), programId: z.uuid().optional(), section: text(20).optional() }).strict(),
  }, async (req, res, { body }) => {
    send(res, await db.asUser(req.actor!, async (c) => {
      // Default the batch to the class officer's own class (their assignment's section/program for this organization).
      let { programId, section } = body;
      if (!programId && !section) {
        const mine = (await c.query(
          `select a.program_id, a.section from public.organization_assignments a
             join public.receipt_obligations ob on ob.organization_id = a.organization_id and ob.id = $1
             join public.academic_years ay on ay.id = a.academic_year_id and ay.is_current
            where a.user_id = auth.uid() and a.is_active and a.position_code = 'class_officer'
            order by a.assigned_at desc limit 1`, [body.obligationId])).rows[0];
        programId = mine?.program_id ?? undefined;
        section = mine?.section ?? undefined;
      }
      return rpcOne(c, 'create_remittance_batch', {
        p_obligation_id: body.obligationId, p_declared_total: body.declaredTotal, p_program_id: programId ?? null, p_section: section ?? null });
    }), 201);
  }));

  // Students who may be added to this batch: only for the batch's own class officer or the organization's
  // reviewer, limited to students the fee applies to and inside the batch's program/section. Returns names and
  // numbers only. Class officers do not get general students.view.
  authed.get('/remittances/:id/candidates', handler({
    params: idParams, query: z.object({ q: text(80).optional() }),
  }, async (req, res, { params, query }) => {
    const actor = req.actor!;
    send(res, await db.asUser(actor, async (c) => {
      const b = (await c.query(`select id, obligation_id, organization_id, class_officer_id, program_id, section, status from public.remittance_batches where id = $1`, [params.id])).rows[0];
      if (!b) throw notFound('Remittance batch');
      if (b.class_officer_id !== actor.id && !(await hasOrg(c, b.organization_id, 'remittance.review'))) throw forbidden();
      await elevate(c);
      return (await c.query(
        `select s.profile_id as id, p.full_name, s.student_number, pr.code as program_code, s.section
           from public.students s join public.profiles p on p.id = s.profile_id and p.is_active
           join public.programs pr on pr.id = s.program_id
          where private.obligation_applies($1, s.profile_id)
            and ($2::uuid is null or s.program_id = $2) and ($3::text is null or s.section = $3)
            and ($4::text is null or p.full_name ilike '%' || $4 || '%' or s.student_number ilike '%' || $4 || '%')
            and not exists (select 1 from public.remittance_batch_items i where i.batch_id = $5 and i.student_id = s.profile_id)
          order by p.full_name limit 20`,
        [b.obligation_id, b.program_id, b.section, query.q ?? null, b.id])).rows;
    }));
  }));

  authed.put('/remittances/:id/items', handler({
    params: idParams, body: z.object({ studentId: z.uuid(), amount: money }).strict(),
  }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'upsert_remittance_batch_item', {
      p_batch_id: params.id, p_student_id: body.studentId, p_amount: body.amount })));
  }));

  authed.delete('/remittances/items/:id', handler({ params: idParams }, async (req, res, { params }) => {
    await db.asUser(req.actor!, (c) => rpc(c, 'remove_remittance_batch_item', { p_item_id: params.id }));
    res.status(204).end();
  }));

  authed.post('/remittances/:id/submit', handler({ params: idParams }, async (req, res, { params }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'submit_remittance_batch', { p_batch_id: params.id })));
  }));

  authed.post('/remittances/:id/begin-review', handler({
    params: idParams, body: z.object({ receivedTotal: z.number().min(0).max(10_000_000).multipleOf(0.01) }).strict(),
  }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'begin_remittance_batch_review', {
      p_batch_id: params.id, p_received_total: body.receivedTotal })));
  }));

  authed.post('/remittances/items/:id/verify', handler({
    params: idParams, body: z.object({ decision: z.enum(['verified', 'rejected']), reason: optionalText(500) }).strict(),
  }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'verify_remittance_batch_item', {
      p_item_id: params.id, p_decision: body.decision, p_reason: body.reason ?? null })));
  }));

  authed.post('/remittances/:id/finish-review', handler({
    params: idParams, body: z.object({ outcome: z.enum(['completed', 'returned']), reason: optionalText(500) }).strict(),
  }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'finish_remittance_batch_review', {
      p_batch_id: params.id, p_outcome: body.outcome, p_reason: body.reason ?? null })));
  }));
}
