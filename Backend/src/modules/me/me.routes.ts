import { z } from 'zod';
import { handler, optionalText, requireActor, send, text } from '../../http/http.js';
import { AppError, notFound } from '../../http/errors.js';
import type { ModuleContext } from '../context.js';
import type { DbClient } from '../../db/database.js';

/** Everything the frontend needs to decide what to show; the server still enforces every action. */
export async function loadAccessContext(c: DbClient) {
  const profile = (await c.query(
    `select id, email, full_name, phone, is_active from public.profiles where id = auth.uid()`,
  )).rows[0];
  if (!profile) return null;
  const roles = (await c.query(`select role from public.user_roles where user_id = auth.uid() order by role`)).rows.map((r) => r.role as string);
  const student = (await c.query(
    `select s.student_number, s.year_level, s.section, s.enrollment_status, p.id as program_id, p.code as program_code,
            p.name as program_name, o.id as department_organization_id, o.code as department_organization_code,
            p.organization_mapping_status
       from public.students s
       join public.programs p on p.id = s.program_id
       left join public.organizations o on o.id = p.department_organization_id and p.organization_mapping_status = 'confirmed'
      where s.profile_id = auth.uid()`,
  )).rows[0] ?? null;
  const assignments = (await c.query(
    `select 'organization' as scope_type, a.organization_id as scope_id, o.code as scope_code, o.name as scope_name,
            a.position_code, pos.name as position_name, ay.code as academic_year, a.program_id, a.section
       from public.organization_assignments a
       join public.organizations o on o.id = a.organization_id
       join public.positions pos on pos.code = a.position_code
       join public.academic_years ay on ay.id = a.academic_year_id and ay.is_current
      where a.user_id = auth.uid() and a.is_active
     union all
     select 'office', s.office_id, o.code, o.name, s.position_code, pos.name, ay.code, null, null
       from public.office_staff s
       join public.offices o on o.id = s.office_id
       join public.positions pos on pos.code = s.position_code
       join public.academic_years ay on ay.id = s.academic_year_id and ay.is_current
      where s.user_id = auth.uid() and s.is_active
     union all
     select case when a.program_id is not null then 'program' else 'department' end,
            coalesce(a.program_id, a.department_id), coalesce(p.code, d.code), coalesce(p.name, d.name),
            a.position_code, pos.name, ay.code, a.program_id, null
       from public.academic_assignments a
       left join public.programs p on p.id = a.program_id
       left join public.departments d on d.id = a.department_id
       join public.positions pos on pos.code = a.position_code
       join public.academic_years ay on ay.id = a.academic_year_id and ay.is_current
      where a.user_id = auth.uid() and a.is_active
      order by 1, 4`,
  )).rows;
  const globalPermissions = (await c.query(
    `select distinct rp.permission_code from public.role_permissions rp
       join public.user_roles ur on ur.role = rp.role where ur.user_id = auth.uid() order by 1`,
  )).rows.map((r) => r.permission_code as string);
  const positionPermissions = (await c.query(
    `select position_code, array_agg(permission_code order by permission_code) as permissions
       from public.position_permissions group by position_code`,
  )).rows as { position_code: string; permissions: string[] }[];
  const byPosition = new Map(positionPermissions.map((p) => [p.position_code, p.permissions]));
  const scopedPermissions = assignments.flatMap((a) =>
    (byPosition.get(a.position_code) ?? []).map((permission) => ({ permission, scopeType: a.scope_type, scopeId: a.scope_id })),
  );
  const academicYear = (await c.query(`select id, code, starts_on, ends_on from public.academic_years where is_current`)).rows[0] ?? null;
  return { profile, roles, student, assignments, globalPermissions, scopedPermissions, academicYear };
}

export function meModule({ deps, authed }: ModuleContext) {
  const { db } = deps;

  authed.get('/me', handler({}, async (req, res) => {
    const actor = requireActor(req);
    const ctx = await db.asUser(actor, loadAccessContext);
    if (!ctx) throw notFound('Profile');
    send(res, ctx);
  }));

  // Only the caller's own name and phone; role, email and active flag cannot be changed here.
  authed.patch('/me', handler({
    body: z.object({ fullName: text(120).optional(), phone: optionalText(30) }).strict(),
  }, async (req, res, { body }) => {
    const actor = requireActor(req);
    if (body.phone && !/^[0-9+() -]{7,30}$/.test(body.phone)) {
      throw new AppError(400, 'INVALID_PHONE', 'Enter a valid phone number.');
    }
    const row = await db.asService(async (c) => (await c.query(
      `update public.profiles set full_name = coalesce($2, full_name), phone = coalesce($3, phone)
        where id = $1 and is_active returning id, email, full_name, phone`,
      [actor.id, body.fullName ?? null, body.phone ?? null],
    )).rows[0], actor.id);
    if (!row) throw notFound('Profile');
    send(res, row);
  }));
}
