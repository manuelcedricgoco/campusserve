import { z } from 'zod';
import { handler, idParams, optionalText, pagination, send, text } from '../../http/http.js';
import { AppError, notFound } from '../../http/errors.js';
import type { ModuleContext } from '../context.js';
import { dateString, elevate, paged, requireGlobal } from '../shared.js';

const ROLES = ['student', 'office_staff', 'administrator', 'cashier', 'department_head'] as const;
const code = z.string().trim().regex(/^[A-Z0-9_]{2,40}$/, 'Use 2-40 capital letters, digits or _');
const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);

/**
 * Administration and configuration. Each route checks the caller's global permission inside the same
 * transaction, then elevates for the write; audit triggers record the caller as the actor.
 */
export function adminModule({ deps, authed }: ModuleContext) {
  const { db } = deps;
  const actorOf = (req: { actor?: { id: string } }) => req.actor!.id;

  // ---- Users, roles and assignments -------------------------------------------------------------
  authed.get('/admin/users', handler({
    query: pagination.extend({ q: text(80).optional(), role: z.enum(ROLES).optional(), active: z.enum(['true', 'false']).optional() }),
  }, async (req, res, { query }) => {
    const result = await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'users.manage');
      return paged(c,
        `select p.id, p.email, p.full_name, p.phone, p.is_active, p.created_at,
                coalesce((select array_agg(r.role order by r.role) from public.user_roles r where r.user_id = p.id), '{}') as roles,
                s.student_number, pr.code as program_code, s.year_level, s.section
           from public.profiles p left join public.students s on s.profile_id = p.id left join public.programs pr on pr.id = s.program_id
          where ($1::text is null or p.full_name ilike '%' || $1 || '%' or p.email ilike '%' || $1 || '%' or s.student_number ilike '%' || $1 || '%')
            and ($2::text is null or exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = $2))
            and ($3::boolean is null or p.is_active = $3)`,
        [query.q ?? null, query.role ?? null, query.active === undefined ? null : query.active === 'true'], query, 'full_name');
    });
    send(res, result.rows, 200, result.meta);
  }));

  authed.get('/admin/users/:id', handler({ params: idParams }, async (req, res, { params }) => {
    const data = await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'users.manage');
      const profile = (await c.query(`select * from public.profiles where id = $1`, [params.id])).rows[0];
      if (!profile) return null;
      const roles = (await c.query(`select * from public.user_roles where user_id = $1 order by role`, [params.id])).rows;
      const student = (await c.query(`select * from public.students where profile_id = $1`, [params.id])).rows[0] ?? null;
      const office = (await c.query(`select s.*, o.code as office_code from public.office_staff s join public.offices o on o.id = s.office_id where s.user_id = $1 order by s.assigned_at desc`, [params.id])).rows;
      const organization = (await c.query(`select a.*, o.code as organization_code from public.organization_assignments a join public.organizations o on o.id = a.organization_id where a.user_id = $1 order by a.assigned_at desc`, [params.id])).rows;
      const academic = (await c.query(`select * from public.academic_assignments where user_id = $1 order by assigned_at desc`, [params.id])).rows;
      return { profile, roles, student, assignments: { office, organization, academic } };
    });
    if (!data) throw notFound('User');
    send(res, data);
  }));

  authed.patch('/admin/users/:id', handler({ params: idParams, body: z.object({ isActive: z.boolean() }).strict() }, async (req, res, { params, body }) => {
    if (params.id === actorOf(req) && !body.isActive) throw new AppError(422, 'SELF_LOCKOUT', 'You cannot deactivate your own account.');
    const row = await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'users.manage');
      await elevate(c);
      return (await c.query(`update public.profiles set is_active = $2 where id = $1 returning id, email, full_name, is_active`, [params.id, body.isActive])).rows[0];
    });
    if (!row) throw notFound('User');
    send(res, row);
  }));

  authed.post('/admin/users/:id/roles', handler({ params: idParams, body: z.object({ role: z.enum(ROLES) }).strict() }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'users.manage');
      await elevate(c);
      return (await c.query(
        `insert into public.user_roles (user_id, role, granted_by) values ($1, $2, $3)
         on conflict (user_id, role) do update set role = excluded.role returning *`, [params.id, body.role, actorOf(req)])).rows[0];
    }), 201);
  }));

  authed.delete('/admin/users/:id/roles/:role', handler({ params: z.object({ id: z.uuid(), role: z.enum(ROLES) }) }, async (req, res, { params }) => {
    if (params.id === actorOf(req) && params.role === 'administrator') {
      throw new AppError(422, 'SELF_LOCKOUT', 'You cannot remove your own administrator role.');
    }
    await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'users.manage');
      await elevate(c);
      await c.query(`delete from public.user_roles where user_id = $1 and role = $2`, [params.id, params.role]);
    });
    res.status(204).end();
  }));

  authed.get('/admin/positions', handler({}, async (req, res) => {
    send(res, await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'users.manage');
      return (await c.query(
        `select p.*, coalesce((select array_agg(pp.permission_code order by 1) from public.position_permissions pp where pp.position_code = p.code), '{}') as permissions
           from public.positions p order by p.scope, p.code`)).rows;
    }));
  }));

  const assignmentBody = z.discriminatedUnion('type', [
    z.object({ type: z.literal('office'), userId: z.uuid(), officeId: z.uuid(), positionCode: z.string().min(2).max(40), notes: optionalText(300) }).strict(),
    z.object({ type: z.literal('organization'), userId: z.uuid(), organizationId: z.uuid(), positionCode: z.string().min(2).max(40),
      programId: z.uuid().optional(), section: text(20).optional(), notes: optionalText(300) }).strict(),
    z.object({ type: z.literal('academic'), userId: z.uuid(), positionCode: z.string().min(2).max(40),
      programId: z.uuid().optional(), departmentId: z.uuid().optional(), notes: optionalText(300) }).strict(),
  ]);

  authed.post('/admin/assignments', handler({ body: assignmentBody }, async (req, res, { body }) => {
    const by = actorOf(req);
    send(res, await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'users.manage');
      await elevate(c);
      const ay = `private.current_academic_year_id()`;
      if (body.type === 'office') {
        return (await c.query(`insert into public.office_staff (user_id, office_id, position_code, academic_year_id, assigned_by, notes)
          values ($1, $2, $3, ${ay}, $4, $5) returning *`, [body.userId, body.officeId, body.positionCode, by, body.notes ?? null])).rows[0];
      }
      if (body.type === 'organization') {
        return (await c.query(`insert into public.organization_assignments (user_id, organization_id, position_code, academic_year_id, program_id, section, assigned_by, notes)
          values ($1, $2, $3, ${ay}, $4, $5, $6, $7) returning *`,
        [body.userId, body.organizationId, body.positionCode, body.programId ?? null, body.section ?? null, by, body.notes ?? null])).rows[0];
      }
      return (await c.query(`insert into public.academic_assignments (user_id, position_code, academic_year_id, program_id, department_id, assigned_by, notes)
        values ($1, $2, ${ay}, $3, $4, $5, $6) returning *`,
      [body.userId, body.positionCode, body.programId ?? null, body.departmentId ?? null, by, body.notes ?? null])).rows[0];
    }), 201);
  }));

  authed.post('/admin/assignments/:type/:id/revoke', handler({
    params: z.object({ type: z.enum(['office', 'organization', 'academic']), id: z.uuid() }),
  }, async (req, res, { params }) => {
    const table = { office: 'office_staff', organization: 'organization_assignments', academic: 'academic_assignments' }[params.type];
    const row = await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'users.manage');
      await elevate(c);
      return (await c.query(`update public.${table} set is_active = false, revoked_at = now() where id = $1 and is_active returning *`, [params.id])).rows[0];
    });
    if (!row) throw notFound('Active assignment');
    send(res, row);
  }));

  // ---- System settings & academic years ---------------------------------------------------------
  authed.get('/admin/settings', handler({}, async (req, res) => {
    send(res, await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'config.manage');
      return (await c.query(`select * from public.system_settings order by key`)).rows;
    }));
  }));

  authed.put('/admin/settings/:key', handler({
    params: z.object({ key: z.string().regex(/^[a-z0-9_.]{3,80}$/) }),
    body: z.object({ value: z.json(), isConfirmed: z.boolean().optional() }).strict(),
  }, async (req, res, { params, body }) => {
    const row = await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'config.manage');
      await elevate(c);
      return (await c.query(`update public.system_settings set value = $2::jsonb, is_confirmed = coalesce($3, is_confirmed), updated_by = $4
        where key = $1 returning *`, [params.key, JSON.stringify(body.value), body.isConfirmed ?? null, actorOf(req)])).rows[0];
    });
    if (!row) throw notFound('Setting');
    send(res, row);
  }));

  authed.post('/admin/academic-years', handler({
    body: z.object({ code: z.string().regex(/^\d{4}-\d{4}$/), startsOn: z.string().regex(dateString), endsOn: z.string().regex(dateString) }).strict(),
  }, async (req, res, { body }) => {
    send(res, await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'config.manage');
      await elevate(c);
      return (await c.query(`insert into public.academic_years (code, starts_on, ends_on) values ($1, $2, $3) returning *`, [body.code, body.startsOn, body.endsOn])).rows[0];
    }), 201);
  }));

  authed.post('/admin/academic-years/:id/set-current', handler({ params: idParams }, async (req, res, { params }) => {
    const row = await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'config.manage');
      await elevate(c);
      await c.query(`update public.academic_years set is_current = false where is_current and id <> $1`, [params.id]);
      return (await c.query(`update public.academic_years set is_current = true where id = $1 returning *`, [params.id])).rows[0];
    });
    if (!row) throw notFound('Academic year');
    send(res, row);
  }));

  // ---- Services & queue schedules ---------------------------------------------------------------
  const serviceBody = z.object({
    officeId: z.uuid(), code, name: text(120), description: optionalText(1000), serviceKind: z.enum(['queue', 'request', 'both']),
    maxActiveTicketsPerStudent: z.number().int().min(1).max(10).default(1), cancellationCutoffMinutes: z.number().int().min(0).max(10080).default(60),
    allowReschedule: z.boolean().default(true), requiredDocuments: z.array(text(120)).max(20).default([]),
    targetProcessingDays: z.number().int().min(1).max(365).optional(), isActive: z.boolean().default(true),
  }).strict();

  authed.post('/admin/services', handler({ body: serviceBody }, async (req, res, { body }) => {
    send(res, await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'config.manage');
      await elevate(c);
      return (await c.query(
        `insert into public.services (office_id, code, name, description, service_kind, max_active_tickets_per_student, cancellation_cutoff_minutes,
           allow_reschedule, required_documents, target_processing_days, is_active)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
        [body.officeId, body.code, body.name, body.description ?? null, body.serviceKind, body.maxActiveTicketsPerStudent,
          body.cancellationCutoffMinutes, body.allowReschedule, body.requiredDocuments, body.targetProcessingDays ?? null, body.isActive])).rows[0];
    }), 201);
  }));

  authed.patch('/admin/services/:id', handler({
    params: idParams,
    body: z.object({ name: text(120).optional(), description: optionalText(1000), isActive: z.boolean().optional(),
      cancellationCutoffMinutes: z.number().int().min(0).max(10080).optional(), targetProcessingDays: z.number().int().min(1).max(365).optional() }).strict(),
  }, async (req, res, { params, body }) => {
    const row = await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'config.manage');
      await elevate(c);
      return (await c.query(
        `update public.services set name = coalesce($2, name), description = coalesce($3, description), is_active = coalesce($4, is_active),
           cancellation_cutoff_minutes = coalesce($5, cancellation_cutoff_minutes), target_processing_days = coalesce($6, target_processing_days)
         where id = $1 returning *`,
        [params.id, body.name ?? null, body.description ?? null, body.isActive ?? null, body.cancellationCutoffMinutes ?? null, body.targetProcessingDays ?? null])).rows[0];
    });
    if (!row) throw notFound('Service');
    send(res, row);
  }));

  authed.post('/admin/queue-schedules', handler({
    body: z.object({
      serviceId: z.uuid(), dayOfWeek: z.number().int().min(0).max(6), startTime: time, endTime: time,
      slotMinutes: z.number().int().min(5).max(240), capacityPerSlot: z.number().int().min(1).max(500),
      effectiveFrom: z.string().regex(dateString), effectiveUntil: z.string().regex(dateString).optional(),
    }).strict(),
  }, async (req, res, { body }) => {
    send(res, await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'config.manage');
      await elevate(c);
      return (await c.query(
        `insert into public.queue_schedules (service_id, day_of_week, start_time, end_time, slot_minutes, capacity_per_slot, effective_from, effective_until, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
        [body.serviceId, body.dayOfWeek, body.startTime, body.endTime, body.slotMinutes, body.capacityPerSlot, body.effectiveFrom, body.effectiveUntil ?? null, actorOf(req)])).rows[0];
    }), 201);
  }));

  authed.patch('/admin/queue-schedules/:id', handler({
    params: idParams, body: z.object({ isActive: z.boolean().optional(), effectiveUntil: z.string().regex(dateString).nullable().optional() }).strict(),
  }, async (req, res, { params, body }) => {
    const row = await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'config.manage');
      await elevate(c);
      return (await c.query(
        `update public.queue_schedules set is_active = coalesce($2, is_active),
           effective_until = case when $4 then $3::date else effective_until end where id = $1 returning *`,
        [params.id, body.isActive ?? null, body.effectiveUntil ?? null, body.effectiveUntil !== undefined])).rows[0];
    });
    if (!row) throw notFound('Schedule');
    send(res, row);
  }));

  // ---- Receipt obligations -----------------------------------------------------------------------
  authed.post('/admin/receipt-obligations', handler({
    body: z.object({
      organizationId: z.uuid(), code, name: text(120), amount: z.number().positive().max(100_000).multipleOf(0.01),
      applicability: z.enum(['all_students', 'department_members', 'club_members']), applicabilityConfirmed: z.boolean().default(false),
    }).strict(),
  }, async (req, res, { body }) => {
    send(res, await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'config.manage');
      await elevate(c);
      return (await c.query(
        `insert into public.receipt_obligations (organization_id, academic_year_id, code, name, amount, applicability, applicability_confirmed, created_by)
         values ($1, private.current_academic_year_id(), $2, $3, $4, $5, $6, $7) returning *`,
        [body.organizationId, body.code, body.name, body.amount, body.applicability, body.applicabilityConfirmed, actorOf(req)])).rows[0];
    }), 201);
  }));

  authed.patch('/admin/receipt-obligations/:id', handler({
    params: idParams, body: z.object({ isActive: z.boolean().optional(), applicabilityConfirmed: z.boolean().optional(), name: text(120).optional() }).strict(),
  }, async (req, res, { params, body }) => {
    const row = await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'config.manage');
      await elevate(c);
      return (await c.query(
        `update public.receipt_obligations set is_active = coalesce($2, is_active), applicability_confirmed = coalesce($3, applicability_confirmed),
           name = coalesce($4, name) where id = $1 returning *`, [params.id, body.isActive ?? null, body.applicabilityConfirmed ?? null, body.name ?? null])).rows[0];
    });
    if (!row) throw notFound('Obligation');
    send(res, row);
  }));

  // ---- Violation policy versions (drafts are editable; active/retired are immutable in the DB) ----
  authed.post('/admin/violation-policies/:id/versions', handler({
    params: idParams,
    body: z.object({
      calculationType: z.enum(['per_violation', 'quantity_threshold']), quantityUnit: optionalText(40),
      quantityPerViolation: z.number().int().min(1).max(100_000).optional(), hoursPerViolation: z.number().min(0).max(1000).optional(),
      amountPerViolation: z.number().min(0).max(100_000).multipleOf(0.01).optional(),
      allowedResolutions: z.array(z.enum(['community_service', 'payment'])).max(2).default([]),
      penaltyConfirmed: z.boolean().default(false), notes: optionalText(1000),
    }).strict(),
  }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'config.manage');
      await elevate(c);
      return (await c.query(
        `insert into public.violation_policy_versions (policy_id, version_number, academic_year_id, calculation_type, quantity_unit, quantity_per_violation,
           hours_per_violation, amount_per_violation, allowed_resolutions, penalty_confirmed, notes, created_by)
         values ($1, (select coalesce(max(version_number), 0) + 1 from public.violation_policy_versions where policy_id = $1),
           private.current_academic_year_id(), $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
        [params.id, body.calculationType, body.quantityUnit ?? null, body.quantityPerViolation ?? null, body.hoursPerViolation ?? null,
          body.amountPerViolation ?? null, body.allowedResolutions, body.penaltyConfirmed, body.notes ?? null, actorOf(req)])).rows[0];
    }), 201);
  }));

  authed.post('/admin/policy-versions/:id/activate', handler({ params: idParams }, async (req, res, { params }) => {
    const row = await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'config.manage');
      await elevate(c);
      const v = (await c.query(`select * from public.violation_policy_versions where id = $1 for update`, [params.id])).rows[0];
      if (!v) return null;
      if (v.status !== 'draft') throw new AppError(409, 'INVALID_STATE', 'Only a draft version can be activated.');
      await c.query(`update public.violation_policy_versions set status = 'retired' where policy_id = $1 and status = 'active'`, [v.policy_id]);
      return (await c.query(`update public.violation_policy_versions set status = 'active' where id = $1 returning *`, [params.id])).rows[0];
    });
    if (!row) throw notFound('Policy version');
    send(res, row);
  }));

  // ---- Clearance templates: copy to a draft, edit the draft's steps, then activate -----------------
  authed.post('/admin/clearance-templates/:id/new-version', handler({ params: idParams }, async (req, res, { params }) => {
    const row = await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'config.manage');
      await elevate(c);
      const t = (await c.query(`select * from public.clearance_templates where id = $1`, [params.id])).rows[0];
      if (!t) return null;
      const copy = (await c.query(
        `insert into public.clearance_templates (code, name, description, academic_year_id, version, initiating_office_id, status, created_by)
         values ($1, $2, $3, $4, (select max(version) + 1 from public.clearance_templates where code = $1), $5, 'draft', $6) returning *`,
        [t.code, t.name, t.description, t.academic_year_id, t.initiating_office_id, actorOf(req)])).rows[0];
      const steps = (await c.query(`select * from public.clearance_steps where template_id = $1 order by sequence`, [t.id])).rows;
      for (const s of steps) {
        const ns = (await c.query(
          `insert into public.clearance_steps (template_id, step_key, name, description, sequence, approver_position_code, approver_scope, fixed_organization_id, fixed_office_id)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
          [copy.id, s.step_key, s.name, s.description, s.sequence, s.approver_position_code, s.approver_scope, s.fixed_organization_id, s.fixed_office_id])).rows[0];
        await c.query(
          `insert into public.clearance_requirements (step_id, requirement_key, name, requirement_type, organization_selector, organization_id)
           select $1, requirement_key, name, requirement_type, organization_selector, organization_id from public.clearance_requirements where step_id = $2`,
          [ns.id, s.id]);
      }
      return copy;
    });
    if (!row) throw notFound('Template');
    send(res, row, 201);
  }));

  authed.patch('/admin/clearance-steps/:id', handler({
    params: idParams,
    body: z.object({ name: text(120).optional(), description: optionalText(1000), sequence: z.number().int().min(1).max(100).optional(),
      approverPositionCode: z.string().min(2).max(40).optional() }).strict(),
  }, async (req, res, { params, body }) => {
    const row = await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'config.manage');
      await elevate(c);
      return (await c.query(
        `update public.clearance_steps set name = coalesce($2, name), description = coalesce($3, description), sequence = coalesce($4, sequence),
           approver_position_code = coalesce($5, approver_position_code) where id = $1 returning *`,
        [params.id, body.name ?? null, body.description ?? null, body.sequence ?? null, body.approverPositionCode ?? null])).rows[0];
    });
    if (!row) throw notFound('Step');
    send(res, row);
  }));

  authed.post('/admin/clearance-templates/:id/activate', handler({ params: idParams }, async (req, res, { params }) => {
    const row = await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'config.manage');
      await elevate(c);
      const t = (await c.query(`select * from public.clearance_templates where id = $1 for update`, [params.id])).rows[0];
      if (!t) return null;
      if (t.status !== 'draft') throw new AppError(409, 'INVALID_STATE', 'Only a draft template can be activated.');
      const steps = (await c.query(`select count(*)::int n from public.clearance_steps where template_id = $1`, [t.id])).rows[0].n;
      if (steps === 0) throw new AppError(422, 'TEMPLATE_EMPTY', 'A template needs at least one step.');
      await c.query(`update public.clearance_templates set status = 'retired' where code = $1 and status = 'active'`, [t.code]);
      return (await c.query(`update public.clearance_templates set status = 'active', activated_at = now() where id = $1 returning *`, [t.id])).rows[0];
    });
    if (!row) throw notFound('Template');
    send(res, row);
  }));

  // ---- Audit log ---------------------------------------------------------------------------------
  authed.get('/admin/audit-logs', handler({
    query: pagination.extend({ entityType: z.string().regex(/^[a-z_]{2,60}$/).optional(), actorId: z.uuid().optional(), entityId: z.string().max(80).optional() }),
  }, async (req, res, { query }) => {
    const result = await db.asUser(req.actor!, async (c) => {
      await requireGlobal(c, 'audit.view');
      return paged(c,
        `select l.*, p.full_name as actor_name from public.audit_logs l left join public.profiles p on p.id = l.actor_id
          where ($1::text is null or l.entity_type = $1) and ($2::uuid is null or l.actor_id = $2) and ($3::text is null or l.entity_id = $3)`,
        [query.entityType ?? null, query.actorId ?? null, query.entityId ?? null], query, 'occurred_at desc');
    });
    send(res, result.rows, 200, result.meta);
  }));
}
