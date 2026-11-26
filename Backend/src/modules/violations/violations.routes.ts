import { z } from 'zod';
import { handler, idParams, optionalText, pagination, send, text } from '../../http/http.js';
import { rpcOne } from '../../db/database.js';
import { forbidden, notFound } from '../../http/errors.js';
import type { ModuleContext } from '../context.js';
import { dateString, elevate, fillStudentNames, hasOrg, paged, singleFile } from '../shared.js';
import { signed, storeUpload } from '../files.js';

const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

/** Violations, disputes, penalty assessments and community service. Only verified violations count. */
export function violationsModule({ deps, authed }: ModuleContext) {
  const { db, storage } = deps;

  authed.get('/violations/policies', handler({ query: z.object({ organizationId: z.uuid().optional() }) }, async (req, res, { query }) => {
    send(res, await db.asUser(req.actor!, async (c) => (await c.query(
      `select p.*, o.code as organization_code, o.name as organization_name,
              (select row_to_json(v) from public.violation_policy_versions v where v.policy_id = p.id and v.status = 'active'
                order by v.version_number desc limit 1) as active_version
         from public.violation_policies p join public.organizations o on o.id = p.organization_id
        where p.is_active and ($1::uuid is null or p.organization_id = $1) order by o.name, p.name`,
      [query.organizationId ?? null])).rows));
  }));

  authed.post('/violations', handler({
    body: z.object({
      policyId: z.uuid(), studentId: z.uuid(), description: text(1000), eventId: z.uuid().optional(),
      quantity: z.number().int().min(1).max(100_000).optional(), occurredOn: z.string().regex(dateString).optional(), category: optionalText(80),
    }).strict(),
  }, async (req, res, { body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'report_violation', {
      p_policy_id: body.policyId, p_student_id: body.studentId, p_description: body.description, p_event_id: body.eventId ?? null,
      p_quantity: body.quantity ?? null, p_occurred_on: body.occurredOn ?? null, p_category: body.category ?? null })), 201);
  }));

  authed.get('/violations', handler({
    query: pagination.extend({
      scope: z.enum(['mine', 'all']).default('mine'), organizationId: z.uuid().optional(), studentId: z.uuid().optional(),
      status: z.enum(['reported', 'verified', 'rejected', 'disputed', 'voided']).optional(),
    }),
  }, async (req, res, { query }) => {
    const result = await db.asUser(req.actor!, (c) => paged(c,
      `select v.*, o.code as organization_code, pol.name as policy_name, e.name as event_name,
              p.full_name as student_name, st.student_number
         from public.violation_records v join public.organizations o on o.id = v.organization_id
         join public.violation_policies pol on pol.id = v.policy_id left join public.organization_events e on e.id = v.event_id
         left join public.profiles p on p.id = v.student_id left join public.students st on st.profile_id = v.student_id
        where ($1 = 'all' or v.student_id = auth.uid()) and ($2::uuid is null or v.organization_id = $2)
          and ($3::uuid is null or v.student_id = $3) and ($4::text is null or v.status = $4)`,
      [query.scope, query.organizationId ?? null, query.studentId ?? null, query.status ?? null], query, 'created_at desc'));
    send(res, result.rows, 200, result.meta);
  }));

  authed.get('/violations/:id', handler({ params: idParams }, async (req, res, { params }) => {
    const data = await db.asUser(req.actor!, async (c) => {
      const v = (await c.query(
        `select v.*, o.code as organization_code, pol.name as policy_name, p.full_name as student_name, st.student_number
           from public.violation_records v join public.organizations o on o.id = v.organization_id
           join public.violation_policies pol on pol.id = v.policy_id left join public.profiles p on p.id = v.student_id
           left join public.students st on st.profile_id = v.student_id where v.id = $1`, [params.id])).rows[0];
      if (!v) return null;
      await fillStudentNames(c, [v]);
      const reviews = (await c.query(`select * from public.violation_reviews where violation_record_id = $1 order by created_at`, [params.id])).rows;
      const disputes = (await c.query(`select * from public.violation_disputes where violation_record_id = $1 order by created_at`, [params.id])).rows;
      const evidence = (await c.query(
        `select id, file_name, mime_type, size_bytes, uploaded_by, created_at from public.violation_evidence where violation_record_id = $1`, [params.id])).rows;
      return { ...v, reviews, disputes, evidence };
    });
    if (!data) throw notFound('Violation');
    send(res, data);
  }));

  authed.post('/violations/:id/review', handler({
    params: idParams, body: z.object({ decision: z.enum(['verified', 'rejected']), notes: optionalText(1000) }).strict(),
  }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'review_violation', { p_record_id: params.id, p_decision: body.decision, p_notes: body.notes ?? null })));
  }));

  authed.post('/violations/:id/evidence', singleFile(MAX_EVIDENCE_BYTES), handler({ params: idParams }, async (req, res, { params }) => {
    const actor = req.actor!;
    const row = await db.asUser(actor, async (c) => {
      const v = (await c.query(`select id, organization_id, status from public.violation_records where id = $1`, [params.id])).rows[0];
      if (!v) throw notFound('Violation');
      if (!(await hasOrg(c, v.organization_id, 'violations.report')) && !(await hasOrg(c, v.organization_id, 'violations.review'))) {
        throw forbidden('Only the organization that reported this violation can add evidence.');
      }
      return storeUpload(req, storage, 'violation-evidence', params.id, MAX_EVIDENCE_BYTES, async (f) => {
        await elevate(c);
        return (await c.query(
          `insert into public.violation_evidence (violation_record_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
           values ($1, $2, $3, $4, $5, $6) returning id, file_name, mime_type, size_bytes, uploaded_by, created_at`,
          [params.id, f.path, f.name, f.type, f.size, actor.id])).rows[0];
      });
    });
    send(res, row, 201);
  }));

  authed.get('/violations/:id/evidence/:evidenceId/url', handler({ params: z.object({ id: z.uuid(), evidenceId: z.uuid() }) }, async (req, res, { params }) => {
    const ev = await db.asUser(req.actor!, async (c) => (await c.query(
      `select storage_path from public.violation_evidence where id = $1 and violation_record_id = $2`, [params.evidenceId, params.id])).rows[0]);
    if (!ev) throw notFound('Evidence');
    send(res, await signed(storage, 'violation-evidence', ev.storage_path));
  }));

  authed.post('/violations/:id/disputes', handler({ params: idParams, body: z.object({ reason: text(1000, 10) }).strict() }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'file_violation_dispute', { p_record_id: params.id, p_reason: body.reason })), 201);
  }));

  authed.post('/disputes/:id/decide', handler({
    params: idParams, body: z.object({ decision: z.enum(['upheld', 'denied']), notes: optionalText(1000) }).strict(),
  }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'decide_violation_dispute', { p_dispute_id: params.id, p_decision: body.decision, p_notes: body.notes ?? null })));
  }));

  // ---- Penalties ---------------------------------------------------------------------------------
  authed.post('/penalties/assess', handler({ body: z.object({ policyId: z.uuid(), studentId: z.uuid() }).strict() }, async (req, res, { body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'assess_penalty', { p_policy_id: body.policyId, p_student_id: body.studentId })), 201);
  }));

  authed.get('/penalties', handler({
    query: pagination.extend({
      scope: z.enum(['mine', 'all']).default('mine'), organizationId: z.uuid().optional(),
      status: z.enum(['open', 'pending_verification', 'resolved', 'superseded']).optional(),
    }),
  }, async (req, res, { query }) => {
    const result = await db.asUser(req.actor!, (c) => paged(c,
      `select a.*, o.code as organization_code, pol.name as policy_name, p.full_name as student_name, st.student_number,
              (select row_to_json(r) from public.penalty_resolutions r where r.assessment_id = a.id and r.status <> 'cancelled'
                order by r.selected_at desc limit 1) as resolution
         from public.penalty_assessments a join public.organizations o on o.id = a.organization_id
         join public.violation_policies pol on pol.id = a.policy_id left join public.profiles p on p.id = a.student_id
         left join public.students st on st.profile_id = a.student_id
        where ($1 = 'all' or a.student_id = auth.uid()) and ($2::uuid is null or a.organization_id = $2) and ($3::text is null or a.status = $3)`,
      [query.scope, query.organizationId ?? null, query.status ?? null], query, 'assessed_at desc'));
    send(res, result.rows, 200, result.meta);
  }));

  authed.get('/penalties/:id', handler({ params: idParams }, async (req, res, { params }) => {
    const data = await db.asUser(req.actor!, async (c) => {
      const a = (await c.query(
        `select a.*, o.code as organization_code, pol.name as policy_name from public.penalty_assessments a
           join public.organizations o on o.id = a.organization_id join public.violation_policies pol on pol.id = a.policy_id
          where a.id = $1`, [params.id])).rows[0];
      if (!a) return null;
      const resolutions = (await c.query(`select * from public.penalty_resolutions where assessment_id = $1 order by selected_at`, [params.id])).rows;
      const service = (await c.query(`select * from public.community_service_records where assessment_id = $1 order by service_date`, [params.id])).rows;
      const payments = (await c.query(
        `select id, reference, amount, currency, provider, status, verification_status, paid_at, created_at
           from public.penalty_payments where assessment_id = $1 order by created_at`, [params.id])).rows;
      const violations = (await c.query(
        `select id, description, quantity, violation_count, occurred_on, status from public.violation_records where assessment_id = $1`, [params.id])).rows;
      return { ...a, resolutions, communityService: service, payments, violations };
    });
    if (!data) throw notFound('Penalty');
    send(res, data);
  }));

  authed.post('/penalties/:id/resolution', handler({
    params: idParams, body: z.object({ type: z.enum(['community_service', 'payment']) }).strict(),
  }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'select_penalty_resolution', { p_assessment_id: params.id, p_resolution_type: body.type })));
  }));

  authed.post('/penalties/resolutions/:id/community-service', handler({
    params: idParams,
    body: z.object({
      serviceDate: z.string().regex(dateString), hours: z.number().positive().max(24).multipleOf(0.25),
      description: text(1000), supervisorName: optionalText(120),
    }).strict(),
  }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'submit_community_service', {
      p_resolution_id: params.id, p_service_date: body.serviceDate, p_hours: body.hours,
      p_description: body.description, p_supervisor_name: body.supervisorName ?? null })), 201);
  }));

  authed.post('/community-service/:id/verify', handler({
    params: idParams, body: z.object({ decision: z.enum(['verified', 'rejected']), notes: optionalText(1000) }).strict(),
  }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'verify_community_service', { p_record_id: params.id, p_decision: body.decision, p_notes: body.notes ?? null })));
  }));

  authed.get('/community-service', handler({
    query: pagination.extend({ organizationId: z.uuid().optional(), status: z.enum(['submitted', 'verified', 'rejected']).optional() }),
  }, async (req, res, { query }) => {
    const result = await db.asUser(req.actor!, (c) => paged(c,
      `select r.*, o.code as organization_code, p.full_name as student_name, st.student_number
         from public.community_service_records r join public.organizations o on o.id = r.organization_id
         left join public.profiles p on p.id = r.student_id left join public.students st on st.profile_id = r.student_id
        where ($1::uuid is null or r.organization_id = $1) and ($2::text is null or r.status = $2)`,
      [query.organizationId ?? null, query.status ?? null], query, 'created_at desc'));
    send(res, result.rows, 200, result.meta);
  }));
}
