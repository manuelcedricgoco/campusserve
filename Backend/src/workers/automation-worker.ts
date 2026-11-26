import type { Logger } from 'pino';
import type { Database } from '../db/database.js';
import { rpc } from '../db/database.js';

const BACKEND_ACTIONS = new Set(['generate_report', 'send_email']);

/**
 * Processes automation executions routed to the backend (rules containing generate_report or send_email).
 * - generate_report: computes a campus summary and stores it on the execution.
 * - send_email: no email provider is configured, so the step fails honestly and is retried, then marked dead.
 * Other action types inside a backend execution are not supported by this worker yet and fail visibly.
 */
export async function runAutomationBatch(db: Database, logger: Logger, worker = 'backend-worker') {
  const claimed = await db.asService((c) => rpc<{ id: string; rule_id: string }>(c, 'automation_claim_backend_executions', { p_worker: worker, p_limit: 10 }));
  for (const x of claimed) {
    try {
      const result = await db.asService(async (c) => {
        const actions = (await c.query(
          `select step_order, action_type, parameters from public.automation_actions where rule_id = $1 and is_enabled order by step_order`, [x.rule_id])).rows;
        const out: Record<string, unknown> = {};
        for (const a of actions) {
          const log = (status: string, message: string, details: unknown = {}) => c.query(
            `insert into public.automation_execution_logs (execution_id, step_order, action_type, status, message, details) values ($1, $2, $3, $4, $5, $6::jsonb)`,
            [x.id, a.step_order, a.action_type, status, message, JSON.stringify(details)]);
          if (a.action_type === 'generate_report') {
            const summary = (await c.query(
              `select (select count(*) from public.service_requests where status in ('submitted','in_review'))::int as open_requests,
                      (select count(*) from public.student_clearances where status = 'in_progress')::int as clearances_in_progress,
                      (select count(*) from public.receipt_records where status = 'pending_verification')::int as receipts_pending,
                      (select count(*) from public.penalty_payments where status = 'paid' and verification_status = 'unverified')::int as payments_awaiting_verification`)).rows[0];
            out[`step_${a.step_order}`] = summary;
            await log('succeeded', 'Report generated', summary);
          } else if (a.action_type === 'send_email') {
            await log('failed', 'No email provider is configured.');
            throw new Error('EMAIL_PROVIDER_NOT_CONFIGURED');
          } else if (!BACKEND_ACTIONS.has(a.action_type)) {
            await log('failed', `${a.action_type} is not supported in backend executions yet.`);
            throw new Error(`UNSUPPORTED_BACKEND_ACTION:${a.action_type}`);
          }
        }
        return out;
      });
      await db.asService((c) => rpc(c, 'automation_complete_execution', { p_execution_id: x.id, p_succeeded: true, p_result: JSON.stringify(result) }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.warn({ execution: x.id, error: message }, 'automation execution failed');
      // The step log above was rolled back with the failed transaction; record the failure on the execution.
      await db.asService((c) => rpc(c, 'automation_complete_execution', { p_execution_id: x.id, p_succeeded: false, p_error: message.slice(0, 500) }));
    }
  }
  return claimed.length;
}
