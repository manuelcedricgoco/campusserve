import type { Response } from 'express';
import { z } from 'zod';
import { handler, send } from '../../http/http.js';
import { forbidden } from '../../http/errors.js';
import type { DbClient } from '../../db/database.js';
import type { ModuleContext } from '../context.js';
import { dateString, hasAnywhere } from '../shared.js';

const range = z.object({
  from: z.string().regex(dateString).optional(),
  to: z.string().regex(dateString).optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formulas
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]!);
  return [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\r\n');
}

function respond(res: Response, name: string, format: 'json' | 'csv', rows: Record<string, unknown>[]) {
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
    res.send(toCsv(rows));
  } else send(res, rows);
}

async function requireReports(c: DbClient) {
  if (!(await hasAnywhere(c, 'reports.view')) && !(await hasAnywhere(c, 'reports.view_all'))) throw forbidden();
}

/** Reports. Every query runs as the caller, so RLS limits each report to the records they may see. */
export function reportsModule({ deps, authed }: ModuleContext) {
  const { db } = deps;
  const from = (d?: string) => d ?? null;

  authed.get('/reports/summary', handler({ query: range }, async (req, res, { query }) => {
    send(res, await db.asUser(req.actor!, async (c) => {
      await requireReports(c);
      const args = [from(query.from), from(query.to)];
      const by = async (sql: string) => Object.fromEntries((await c.query(sql, args)).rows.map((r) => [r.status, Number(r.n)]));
      const between = (col: string) => `($1::date is null or ${col} >= $1::date) and ($2::date is null or ${col} < $2::date + 1)`;
      return {
        requests: await by(`select status, count(*) n from public.service_requests where ${between('submitted_at')} group by 1`),
        queueTickets: await by(`select t.status, count(*) n from public.queue_tickets t join public.queue_slots s on s.id = t.slot_id where ${between('s.slot_date')} group by 1`),
        clearances: await by(`select status, count(*) n from public.student_clearances where ${between('initiated_at')} group by 1`),
        receipts: await by(`select status, count(*) n from public.receipt_records where ${between('recorded_at')} group by 1`),
        violations: await by(`select status, count(*) n from public.violation_records where ${between('created_at')} group by 1`),
        penalties: await by(`select status, count(*) n from public.penalty_assessments where ${between('assessed_at')} group by 1`),
        payments: await by(`select status, count(*) n from public.penalty_payments where ${between('created_at')} group by 1`),
        verifiedCollections: Number((await c.query(
          `select coalesce(sum(amount), 0) total from public.receipt_records where status = 'verified' and ${between('verified_at')}`, args)).rows[0].total),
      };
    }));
  }));

  authed.get('/reports/receipts-by-obligation', handler({ query: range }, async (req, res, { query }) => {
    const rows = await db.asUser(req.actor!, async (c) => {
      await requireReports(c);
      return (await c.query(
        `select o.code as organization, ob.code as obligation, ob.name, ob.amount as unit_amount,
                count(r.*) filter (where r.status = 'verified') as verified_count,
                coalesce(sum(r.amount) filter (where r.status = 'verified'), 0) as verified_total,
                count(r.*) filter (where r.status = 'pending_verification') as pending_count
           from public.receipt_obligations ob join public.organizations o on o.id = ob.organization_id
           left join public.receipt_records r on r.obligation_id = ob.id
             and ($1::date is null or r.recorded_at >= $1::date) and ($2::date is null or r.recorded_at < $2::date + 1)
          group by o.code, ob.code, ob.name, ob.amount order by o.code, ob.code`, [from(query.from), from(query.to)])).rows;
    });
    respond(res, 'receipts-by-obligation', query.format, rows);
  }));

  authed.get('/reports/queue-daily', handler({ query: range }, async (req, res, { query }) => {
    const rows = await db.asUser(req.actor!, async (c) => {
      await requireReports(c);
      return (await c.query(
        `select s.slot_date as date, o.code as office, sv.code as service, count(*) as tickets,
                count(*) filter (where t.status = 'completed') as completed, count(*) filter (where t.status = 'no_show') as no_show,
                count(*) filter (where t.status = 'cancelled') as cancelled,
                round(avg(extract(epoch from (t.completed_at - t.called_at)) / 60) filter (where t.completed_at is not null and t.called_at is not null), 1) as avg_service_minutes
           from public.queue_tickets t join public.queue_slots s on s.id = t.slot_id join public.offices o on o.id = t.office_id
           join public.services sv on sv.id = t.service_id
          where s.slot_date between coalesce($1::date, current_date - 30) and coalesce($2::date, current_date + 14)
          group by 1, 2, 3 order by 1, 2, 3`, [from(query.from), from(query.to)])).rows;
    });
    respond(res, 'queue-daily', query.format, rows);
  }));

  authed.get('/reports/clearance-steps', handler({ query: range }, async (req, res, { query }) => {
    const rows = await db.asUser(req.actor!, async (c) => {
      await requireReports(c);
      return (await c.query(
        `select a.sequence, a.step_key, a.step_name, count(*) filter (where a.status = 'pending') as pending,
                count(*) filter (where a.status = 'returned') as returned, count(*) filter (where a.status = 'approved') as approved
           from public.clearance_approvals a join public.student_clearances sc on sc.id = a.student_clearance_id
          where sc.status <> 'cancelled' and ($1::date is null or sc.initiated_at >= $1::date) and ($2::date is null or sc.initiated_at < $2::date + 1)
          group by 1, 2, 3 order by 1, 2`, [from(query.from), from(query.to)])).rows;
    });
    respond(res, 'clearance-steps', query.format, rows);
  }));

  authed.get('/reports/violations-by-organization', handler({ query: range }, async (req, res, { query }) => {
    const rows = await db.asUser(req.actor!, async (c) => {
      await requireReports(c);
      return (await c.query(
        `select o.code as organization, p.code as policy, count(*) as records,
                count(*) filter (where v.status = 'verified') as verified, coalesce(sum(v.violation_count) filter (where v.status = 'verified'), 0) as verified_violation_count,
                count(*) filter (where v.status = 'disputed') as disputed
           from public.violation_records v join public.organizations o on o.id = v.organization_id
           join public.violation_policies p on p.id = v.policy_id
          where ($1::date is null or v.created_at >= $1::date) and ($2::date is null or v.created_at < $2::date + 1)
          group by 1, 2 order by 1, 2`, [from(query.from), from(query.to)])).rows;
    });
    respond(res, 'violations-by-organization', query.format, rows);
  }));
}
