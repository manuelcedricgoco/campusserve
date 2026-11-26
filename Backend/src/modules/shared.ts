import multer from 'multer';
import type { DbClient } from '../db/database.js';
import { forbidden } from '../http/errors.js';
import type { Pagination } from '../http/http.js';
import { pageMeta } from '../http/http.js';

/** Runs a SELECT with pagination and a total count. `orderBy` must be a fixed string from code. */
export async function paged(c: DbClient, sql: string, params: unknown[], p: Pagination, orderBy: string) {
  const n = params.length;
  const { rows } = await c.query(
    `select q.*, count(*) over() as _total from (${sql}) q order by ${orderBy} limit $${n + 1} offset $${n + 2}`,
    [...params, p.pageSize, (p.page - 1) * p.pageSize],
  );
  const total = rows[0] ? Number(rows[0]._total) : 0;
  for (const r of rows) delete r._total;
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
