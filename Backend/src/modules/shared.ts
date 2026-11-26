import multer from 'multer';
import type { DbClient } from '../db/database.js';
import { forbidden } from '../http/errors.js';
import type { Pagination } from '../http/http.js';
import { pageMeta } from '../http/http.js';

/**
 * Fills student_name / student_number / program_code / section (and class_officer_name) on rows the caller
 * may already see. List queries LEFT JOIN profiles and students so that RLS on the base record alone decides
 * visibility (e.g. the cashier sees every payment without general students.view). Names for those rows are then
 * read with the service role, limited to the ids in the rows, and the role is switched back.
 */
export async function fillStudentNames<T extends Record<string, any>>(c: DbClient, rows: T[]): Promise<T[]> {
  const needs = (r: T, idKey: string, nameKey: string) => r[idKey] && (nameKey in r) && r[nameKey] == null;
  const ids = [...new Set(rows.flatMap((r) => [needs(r, 'student_id', 'student_name') ? r.student_id : null, needs(r, 'class_officer_id', 'class_officer_name') ? r.class_officer_id : null]).filter(Boolean))];
  if (ids.length === 0) return rows;
  const role = (await c.query('select current_user as r')).rows[0].r as string;
  await c.query('set local role service_role');
  const found = (await c.query(
    `select p.id, p.full_name, st.student_number, pr.code as program_code, st.section
       from public.profiles p left join public.students st on st.profile_id = p.id left join public.programs pr on pr.id = st.program_id
      where p.id = any($1::uuid[])`, [ids])).rows;
  if (role === 'authenticated') await c.query('set local role authenticated');
  const byId = new Map(found.map((f) => [f.id, f]));
  for (const r of rows as Record<string, any>[]) {
    const s = r.student_id ? byId.get(r.student_id) : undefined;
    if (s) {
      if ('student_name' in r && r.student_name == null) r.student_name = s.full_name;
      if ('student_number' in r && r.student_number == null) r.student_number = s.student_number;
      if ('program_code' in r && r.program_code == null) r.program_code = s.program_code;
      if ('section' in r && r.section == null) r.section = s.section;
    }
    const o = r.class_officer_id ? byId.get(r.class_officer_id) : undefined;
    if (o && 'class_officer_name' in r && r.class_officer_name == null) r.class_officer_name = o.full_name;
  }
  return rows;
}

/** Runs a SELECT with pagination and a total count. `orderBy` must be a fixed string from code. */
export async function paged(c: DbClient, sql: string, params: unknown[], p: Pagination, orderBy: string) {
  const n = params.length;
  const { rows } = await c.query(
    `select q.*, count(*) over() as _total from (${sql}) q order by ${orderBy} limit $${n + 1} offset $${n + 2}`,
    [...params, p.pageSize, (p.page - 1) * p.pageSize],
  );
  const total = rows[0] ? Number(rows[0]._total) : 0;
  for (const r of rows) delete r._total;
  await fillStudentNames(c, rows);
  return { rows, meta: pageMeta(p, total) };
}

async function check(c: DbClient, sql: string, params: unknown[]) {
  return Boolean((await c.query(sql, params)).rows[0]?.ok);
}
export const hasGlobal = (c: DbClient, permission: string) =>
  check(c, 'select private.has_global_permission($1) as ok', [permission]);
export const hasAnywhere = (c: DbClient, permission: string) =>
  check(c, 'select private.has_permission_anywhere($1) as ok', [permission]);
export const hasOffice = (c: DbClient, officeId: string, permission: string) =>
  check(c, 'select private.has_office_permission($1, $2) as ok', [officeId, permission]);
export const hasOrg = (c: DbClient, organizationId: string, permission: string) =>
  check(c, 'select private.has_org_permission($1, $2) as ok', [organizationId, permission]);
export const isActiveUser = (c: DbClient) => check(c, 'select private.is_active_user() as ok', []);

export async function requireGlobal(c: DbClient, permission: string) {
  if (!(await isActiveUser(c)) || !(await hasGlobal(c, permission))) throw forbidden();
}

/**
 * After the caller's permission was checked in this transaction, switches to service_role for a write that
 * has no workflow function (admin configuration, file metadata). The JWT subject stays the caller, so audit
 * triggers still record who made the change.
 */
export async function elevate(c: DbClient) {
  await c.query('set local role service_role');
}

/** Multipart upload of a single `file` field held in memory (size limited; type checked by magic bytes later). */
export const singleFile = (maxBytes: number) =>
  multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1, fields: 10 } }).single('file');

export const dateString = /^\d{4}-\d{2}-\d{2}$/;
