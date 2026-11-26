import { z } from 'zod';
import { handler, idParams, optionalText, pagination, send, text } from '../../http/http.js';
import { rpcOne } from '../../db/database.js';
import { forbidden, notFound } from '../../http/errors.js';
import type { ModuleContext } from '../context.js';
import { elevate, hasOffice, paged, singleFile } from '../shared.js';
import { signed, storeUpload } from '../files.js';

const REQUEST_STATUSES = ['submitted', 'in_review', 'ready_for_release', 'released', 'rejected', 'cancelled'] as const;
const MAX_DOC_BYTES = 10 * 1024 * 1024;

/** Online service requests (document requests and similar), with private supporting documents. */
export function requestsModule({ deps, authed }: ModuleContext) {
  const { db, storage } = deps;

  authed.post('/requests', handler({
    body: z.object({ serviceId: z.uuid(), purpose: text(300), details: optionalText(2000) }).strict(),
  }, async (req, res, { body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'submit_service_request', {
      p_service_id: body.serviceId, p_purpose: body.purpose, p_details: body.details ?? null })), 201);
  }));

  // Students see their own; office staff see their office's (RLS).
  authed.get('/requests', handler({
    query: pagination.extend({
      scope: z.enum(['mine', 'office']).default('mine'),
      officeId: z.uuid().optional(),
      status: z.enum(REQUEST_STATUSES).optional(),
    }),
  }, async (req, res, { query }) => {
    const result = await db.asUser(req.actor!, (c) => paged(c,
      `select r.*, s.code as service_code, s.name as service_name, o.code as office_code, o.name as office_name,
              p.full_name as student_name, st.student_number
         from public.service_requests r join public.services s on s.id = r.service_id
         join public.offices o on o.id = r.office_id join public.profiles p on p.id = r.student_id
         join public.students st on st.profile_id = r.student_id
        where (($1 = 'mine' and r.student_id = auth.uid()) or ($1 = 'office' and r.student_id <> auth.uid()))
          and ($2::uuid is null or r.office_id = $2) and ($3::text is null or r.status = $3)`,
      [query.scope, query.officeId ?? null, query.status ?? null], query, 'submitted_at desc'));
    send(res, result.rows, 200, result.meta);
  }));

  authed.get('/requests/:id', handler({ params: idParams }, async (req, res, { params }) => {
    const data = await db.asUser(req.actor!, async (c) => {
      const request = (await c.query(
        `select r.*, s.code as service_code, s.name as service_name, s.required_documents, o.name as office_name,
                p.full_name as student_name, st.student_number
           from public.service_requests r join public.services s on s.id = r.service_id
           join public.offices o on o.id = r.office_id join public.profiles p on p.id = r.student_id
           join public.students st on st.profile_id = r.student_id where r.id = $1`, [params.id])).rows[0];
      if (!request) return null;
      const history = (await c.query(`select * from public.request_status_history where request_id = $1 order by changed_at`, [params.id])).rows;
      const documents = (await c.query(
        `select id, file_name, mime_type, size_bytes, uploaded_by, created_at from public.request_documents where request_id = $1 order by created_at`,
        [params.id])).rows;
      return { ...request, history, documents };
    });
    if (!data) throw notFound('Request');
    send(res, data);
  }));

  authed.post('/requests/:id/status', handler({
    params: idParams,
    body: z.object({ status: z.enum(['in_review', 'ready_for_release', 'released', 'rejected', 'cancelled']), remarks: optionalText(1000) }).strict(),
  }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'update_service_request_status', {
      p_request_id: params.id, p_status: body.status, p_remarks: body.remarks ?? null })));
  }));

  authed.post('/requests/:id/documents', singleFile(MAX_DOC_BYTES), handler({ params: idParams }, async (req, res, { params }) => {
    const actor = req.actor!;
    const doc = await db.asUser(actor, async (c) => {
      const r = (await c.query(`select id, student_id, office_id, status from public.service_requests where id = $1`, [params.id])).rows[0];
      if (!r) throw notFound('Request');
      const isOwner = r.student_id === actor.id;
      const canManage = !isOwner && (await hasOffice(c, r.office_id, 'requests.manage'));
      if (!(isOwner && ['submitted', 'in_review'].includes(r.status)) && !canManage) {
        throw forbidden('Documents can only be added to your own open requests.');
      }
      return storeUpload(req, storage, 'request-documents', params.id, MAX_DOC_BYTES, async (f) => {
        await elevate(c);
        return (await c.query(
          `insert into public.request_documents (request_id, storage_bucket, storage_path, file_name, mime_type, size_bytes, uploaded_by)
           values ($1, 'request-documents', $2, $3, $4, $5, $6)
           returning id, file_name, mime_type, size_bytes, uploaded_by, created_at`,
          [params.id, f.path, f.name, f.type, f.size, actor.id])).rows[0];
      });
    });
    send(res, doc, 201);
  }));

  authed.get('/requests/:id/documents/:docId/url', handler({
    params: z.object({ id: z.uuid(), docId: z.uuid() }),
  }, async (req, res, { params }) => {
    const doc = await db.asUser(req.actor!, async (c) => (await c.query(
      `select storage_bucket, storage_path from public.request_documents where id = $1 and request_id = $2`,
      [params.docId, params.id])).rows[0]);
    if (!doc) throw notFound('Document');
    send(res, await signed(storage, doc.storage_bucket, doc.storage_path));
  }));
}
