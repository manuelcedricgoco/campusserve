import { z } from 'zod';
import { handler, pagination, send, text } from '../../http/http.js';
import type { ModuleContext } from '../context.js';
import { paged } from './../shared.js';

/** Reference data. Signed-in reads go through RLS; the public endpoints return only active, non-sensitive data. */
export function catalogModule({ deps, authed, publicRouter }: ModuleContext) {
  const { db } = deps;

  const publicServices = `
    select s.id, s.code, s.name, s.description, s.service_kind, s.required_documents, s.target_processing_days,
           o.id as office_id, o.code as office_code, o.name as office_name, o.location as office_location
      from public.services s join public.offices o on o.id = s.office_id
     where s.is_active and o.is_active`;

  publicRouter.get('/services', handler({}, async (_req, res) => {
    send(res, await db.asService(async (c) => (await c.query(`${publicServices} order by o.name, s.name`)).rows));
  }));
  publicRouter.get('/offices', handler({}, async (_req, res) => {
    send(res, await db.asService(async (c) => (await c.query(
      `select id, code, name, description, location from public.offices where is_active order by name`)).rows));
  }));

  authed.get('/catalog/services', handler({
    query: z.object({ officeId: z.uuid().optional(), kind: z.enum(['queue', 'request', 'both']).optional() }),
  }, async (req, res, { query }) => {
    send(res, await db.asUser(req.actor!, async (c) => (await c.query(
      `select s.*, o.code as office_code, o.name as office_name from public.services s
         join public.offices o on o.id = s.office_id
        where s.is_active and ($1::uuid is null or s.office_id = $1)
          and ($2::text is null or s.service_kind = $2 or s.service_kind = 'both')
        order by o.name, s.name`, [query.officeId ?? null, query.kind ?? null])).rows));
  }));

  authed.get('/catalog/offices', handler({}, async (req, res) => {
    send(res, await db.asUser(req.actor!, async (c) => (await c.query(
      `select * from public.offices where is_active order by name`)).rows));
  }));

  authed.get('/catalog/organizations', handler({
    query: z.object({ type: z.enum(['student_government', 'department_organization', 'club']).optional() }),
  }, async (req, res, { query }) => {
    send(res, await db.asUser(req.actor!, async (c) => (await c.query(
      `select o.*, d.code as department_code from public.organizations o
         left join public.departments d on d.id = o.department_id
        where o.is_active and ($1::text is null or o.organization_type = $1) order by o.organization_type, o.name`,
      [query.type ?? null])).rows));
  }));

  authed.get('/catalog/programs', handler({}, async (req, res) => {
    send(res, await db.asUser(req.actor!, async (c) => (await c.query(
      `select p.id, p.code, p.name, p.is_active, p.organization_mapping_status, p.organization_mapping_notes,
              d.code as department_code, o.code as department_organization_code
         from public.programs p join public.departments d on d.id = p.department_id
         left join public.organizations o on o.id = p.department_organization_id
        order by p.code`)).rows));
  }));

  authed.get('/catalog/academic-years', handler({}, async (req, res) => {
    send(res, await db.asUser(req.actor!, async (c) => (await c.query(
      `select * from public.academic_years order by starts_on desc`)).rows));
  }));

  authed.get('/catalog/events', handler({ query: z.object({ organizationId: z.uuid().optional() }) }, async (req, res, { query }) => {
    send(res, await db.asUser(req.actor!, async (c) => (await c.query(
      `select e.*, o.code as organization_code from public.organization_events e
         join public.organizations o on o.id = e.organization_id
        where ($1::uuid is null or e.organization_id = $1) order by e.event_date desc`, [query.organizationId ?? null])).rows));
  }));

  // Student lookup for officers and staff. RLS (can_view_student) limits what each caller can see.
  authed.get('/students', handler({
    query: pagination.extend({ q: text(80).optional(), programId: z.uuid().optional(), section: text(20).optional() }),
  }, async (req, res, { query }) => {
    const result = await db.asUser(req.actor!, (c) => paged(c,
      `select s.profile_id as id, s.student_number, s.year_level, s.section, s.enrollment_status,
              pr.full_name, pr.email, p.code as program_code, p.id as program_id
         from public.students s join public.profiles pr on pr.id = s.profile_id
         join public.programs p on p.id = s.program_id
        where ($1::text is null or s.student_number ilike '%' || $1 || '%' or pr.full_name ilike '%' || $1 || '%')
          and ($2::uuid is null or s.program_id = $2) and ($3::text is null or s.section = $3)`,
      [query.q ?? null, query.programId ?? null, query.section ?? null], query, 'full_name'));
    send(res, result.rows, 200, result.meta);
  }));
}
