import { z } from 'zod';
import { handler, optionalText, pagination, send, text } from '../../http/http.js';
import { rpcOne } from '../../db/database.js';
import type { ModuleContext } from '../context.js';
import { paged } from '../shared.js';

const studentOffice = z.object({ studentId: z.uuid(), officeId: z.uuid() });

/** Guidance (teacher evaluations, guidance slip) and Library (ID validation, receipt, library slip). */
export function officesModule({ deps, authed }: ModuleContext) {
  const { db } = deps;

  authed.get('/guidance/records', handler({
    query: pagination.extend({ studentId: z.uuid().optional(), slipStatus: z.enum(['not_issued', 'issued', 'revoked']).optional() }),
  }, async (req, res, { query }) => {
    const result = await db.asUser(req.actor!, (c) => paged(c,
      `select g.*, p.full_name as student_name, st.student_number, pr.code as program_code
         from public.guidance_records g join public.profiles p on p.id = g.student_id
         join public.students st on st.profile_id = g.student_id join public.programs pr on pr.id = st.program_id
        where g.academic_year_id = private.current_academic_year_id()
          and ($1::uuid is null or g.student_id = $1) and ($2::text is null or g.slip_status = $2)`,
      [query.studentId ?? null, query.slipStatus ?? null], query, 'updated_at desc'));
    send(res, result.rows, 200, result.meta);
  }));

  authed.post('/guidance/confirm-evaluations', handler({
    body: studentOffice.extend({ remarks: optionalText(500) }).strict(),
  }, async (req, res, { body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'confirm_teacher_evaluations', {
      p_student_id: body.studentId, p_office_id: body.officeId, p_remarks: body.remarks ?? null })));
  }));

  authed.post('/guidance/issue-slip', handler({ body: studentOffice.strict() }, async (req, res, { body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'issue_guidance_slip', { p_student_id: body.studentId, p_office_id: body.officeId })));
  }));

  authed.get('/library/records', handler({
    query: pagination.extend({ studentId: z.uuid().optional(), slipStatus: z.enum(['not_issued', 'issued', 'revoked']).optional() }),
  }, async (req, res, { query }) => {
    const result = await db.asUser(req.actor!, (c) => paged(c,
      `select l.*, p.full_name as student_name, st.student_number, pr.code as program_code
         from public.library_records l join public.profiles p on p.id = l.student_id
         join public.students st on st.profile_id = l.student_id join public.programs pr on pr.id = st.program_id
        where l.academic_year_id = private.current_academic_year_id()
          and ($1::uuid is null or l.student_id = $1) and ($2::text is null or l.slip_status = $2)`,
      [query.studentId ?? null, query.slipStatus ?? null], query, 'updated_at desc'));
    send(res, result.rows, 200, result.meta);
  }));

  authed.post('/library/validate-id', handler({
    body: studentOffice.extend({ libraryIdNumber: text(40), decision: z.enum(['validated', 'rejected']), remarks: optionalText(500) }).strict(),
  }, async (req, res, { body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'validate_library_id', {
      p_student_id: body.studentId, p_office_id: body.officeId, p_library_id_number: body.libraryIdNumber,
      p_decision: body.decision, p_remarks: body.remarks ?? null })));
  }));

  authed.post('/library/verify-receipt', handler({
    body: studentOffice.extend({
      receiptNumber: text(60), amount: z.number().min(0).max(100_000).multipleOf(0.01),
      decision: z.enum(['verified', 'rejected']), remarks: optionalText(500),
    }).strict(),
  }, async (req, res, { body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'verify_library_receipt', {
      p_student_id: body.studentId, p_office_id: body.officeId, p_receipt_number: body.receiptNumber, p_amount: body.amount,
      p_decision: body.decision, p_remarks: body.remarks ?? null })));
  }));

  authed.post('/library/issue-slip', handler({ body: studentOffice.strict() }, async (req, res, { body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'issue_library_slip', { p_student_id: body.studentId, p_office_id: body.officeId })));
  }));
}
