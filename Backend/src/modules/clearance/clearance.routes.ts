import { z } from 'zod';
import { handler, idParams, optionalText, pagination, send, text } from '../../http/http.js';
import { rpc, rpcOne } from '../../db/database.js';
import { AppError, notFound } from '../../http/errors.js';
import type { DbClient } from '../../db/database.js';
import type { ModuleContext } from '../context.js';
import { paged } from '../shared.js';

async function loadClearance(c: DbClient, id: string) {
  const clearance = (await c.query(
    `select sc.*, p.full_name as student_name, st.student_number, pr.code as program_code, t.code as template_code,
            t.name as template_name, ay.code as academic_year
       from public.student_clearances sc join public.profiles p on p.id = sc.student_id
       join public.students st on st.profile_id = sc.student_id join public.programs pr on pr.id = st.program_id
       join public.clearance_templates t on t.id = sc.template_id join public.academic_years ay on ay.id = sc.academic_year_id
      where sc.id = $1`, [id])).rows[0];
  if (!clearance) return null;
  const approvals = (await c.query(
    `select a.*, o.code as organization_code, o.name as organization_name, f.code as office_code, f.name as office_name,
            pos.name as approver_position_name, actor.full_name as acted_by_name
       from public.clearance_approvals a left join public.organizations o on o.id = a.organization_id
       left join public.offices f on f.id = a.office_id join public.positions pos on pos.code = a.approver_position_code
       left join public.profiles actor on actor.id = a.acted_by
      where a.student_clearance_id = $1 order by a.sequence, a.step_name`, [id])).rows;
  const requirements = (await c.query(
    `select rs.*, r.name, r.requirement_type from public.clearance_requirement_status rs
       join public.clearance_requirements r on r.id = rs.requirement_id
      where rs.student_clearance_id = $1 order by r.name`, [id])).rows;
  const history = (await c.query(
    `select h.*, p.full_name as actor_name from public.clearance_history h left join public.profiles p on p.id = h.actor_id
      where h.student_clearance_id = $1 order by h.created_at`, [id])).rows;
  return {
    ...clearance,
    approvals: approvals.map((a) => ({ ...a, requirements: requirements.filter((r) => r.approval_id === a.id) })),
    history,
  };
}

/** Clearance workflow. Steps come from the active template in the database; nothing is hardcoded here. */
export function clearanceModule({ deps, authed }: ModuleContext) {
  const { db } = deps;

  authed.get('/clearance/templates', handler({}, async (req, res) => {
    send(res, await db.asUser(req.actor!, async (c) => {
      const templates = (await c.query(
        `select t.*, ay.code as academic_year from public.clearance_templates t
           left join public.academic_years ay on ay.id = t.academic_year_id order by t.status, t.code, t.version desc`)).rows;
      const steps = (await c.query(
        `select s.*, coalesce(json_agg(r order by r.requirement_key) filter (where r.id is not null), '[]') as requirements
           from public.clearance_steps s left join public.clearance_requirements r on r.step_id = s.id
          group by s.id order by s.sequence`)).rows;
      return templates.map((t) => ({ ...t, steps: steps.filter((s) => s.template_id === t.id) }));
    }));
  }));

  authed.post('/clearances', handler({ body: z.object({ studentId: z.uuid(), templateId: z.uuid().optional() }).strict() }, async (req, res, { body }) => {
    const created = await db.asUser(req.actor!, async (c) => {
      let templateId = body.templateId;
      if (!templateId) {
        // Default: the single active template for the current academic year (templates are configured in the DB).
        const active = (await c.query(
          `select id from public.clearance_templates where status = 'active'
              and (academic_year_id is null or academic_year_id = private.current_academic_year_id())`)).rows;
        if (active.length !== 1) throw new AppError(422, 'TEMPLATE_REQUIRED', 'Choose which clearance template to use.');
        templateId = active[0].id as string;
      }
      const row = await rpcOne<{ id: string }>(c, 'initiate_student_clearance', { p_student_id: body.studentId, p_template_id: templateId });
      return loadClearance(c, row.id);
    });
    send(res, created, 201);
  }));

  authed.get('/clearances', handler({
    query: pagination.extend({
      scope: z.enum(['mine', 'all']).default('mine'),
      status: z.enum(['in_progress', 'completed', 'cancelled']).optional(),
      q: text(80).optional(),
    }),
  }, async (req, res, { query }) => {
    const result = await db.asUser(req.actor!, (c) => paged(c,
      `select sc.id, sc.clearance_number, sc.status, sc.initiated_at, sc.completed_at, sc.due_date, sc.student_id,
              p.full_name as student_name, st.student_number, pr.code as program_code, st.section,
              (select count(*)::int from public.clearance_approvals a where a.student_clearance_id = sc.id) as total_steps,
              (select count(*)::int from public.clearance_approvals a where a.student_clearance_id = sc.id and a.status = 'approved') as approved_steps
         from public.student_clearances sc join public.profiles p on p.id = sc.student_id
         join public.students st on st.profile_id = sc.student_id join public.programs pr on pr.id = st.program_id
        where ($1 = 'all' or sc.student_id = auth.uid()) and ($2::text is null or sc.status = $2)
          and ($3::text is null or p.full_name ilike '%' || $3 || '%' or st.student_number ilike '%' || $3 || '%')`,
      [query.scope, query.status ?? null, query.q ?? null], query, 'initiated_at desc'));
    send(res, result.rows, 200, result.meta);
  }));

  // Steps waiting for the caller: they hold the approver position and every earlier step is approved.
  authed.get('/clearance/approvals/pending', handler({ query: pagination }, async (req, res, { query }) => {
    const result = await db.asUser(req.actor!, (c) => paged(c,
      `select a.id, a.step_key, a.step_name, a.sequence, a.status, a.remarks, a.updated_at,
              sc.id as clearance_id, sc.clearance_number, p.full_name as student_name, st.student_number, pr.code as program_code, st.section,
              not exists (select 1 from public.clearance_approvals e where e.student_clearance_id = a.student_clearance_id
                           and e.sequence < a.sequence and e.status <> 'approved') as is_actionable
         from public.clearance_approvals a join public.student_clearances sc on sc.id = a.student_clearance_id
         join public.profiles p on p.id = sc.student_id join public.students st on st.profile_id = sc.student_id
         join public.programs pr on pr.id = st.program_id
        where sc.status = 'in_progress' and a.status in ('pending', 'returned') and sc.student_id <> auth.uid()
          and private.holds_position(a.approver_position_code, a.organization_id, a.office_id, a.program_id)`,
      [], query, 'is_actionable desc, updated_at'));
    send(res, result.rows, 200, result.meta);
  }));

  authed.get('/clearances/:id', handler({ params: idParams }, async (req, res, { params }) => {
    const data = await db.asUser(req.actor!, (c) => loadClearance(c, params.id));
    if (!data) throw notFound('Clearance');
    send(res, data);
  }));

  authed.post('/clearances/:id/evaluate', handler({ params: idParams }, async (req, res, { params }) => {
    send(res, await db.asUser(req.actor!, async (c) => {
      await rpc(c, 'evaluate_student_clearance', { p_clearance_id: params.id });
      return loadClearance(c, params.id);
    }));
  }));

  authed.post('/clearances/:id/cancel', handler({ params: idParams, body: z.object({ reason: text(500) }).strict() }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'cancel_student_clearance', { p_clearance_id: params.id, p_reason: body.reason })));
  }));

  authed.post('/clearance/approvals/:id/approve', handler({ params: idParams, body: z.object({ remarks: optionalText(500) }).strict() }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'approve_clearance_step', { p_approval_id: params.id, p_remarks: body.remarks ?? null })));
  }));

  authed.post('/clearance/approvals/:id/return', handler({ params: idParams, body: z.object({ remarks: text(500) }).strict() }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'return_clearance_step', { p_approval_id: params.id, p_remarks: body.remarks })));
  }));
}
