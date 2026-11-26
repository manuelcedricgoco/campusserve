import { z } from 'zod';
import { handler, idParams, optionalText, pagination, send, text } from '../../http/http.js';
import { rpcOne, rpcValue, json } from '../../db/database.js';
import type { ModuleContext } from '../context.js';
import { paged } from '../shared.js';

const ACTIONS = ['send_notification', 'send_reminder', 'escalate_to_position', 'reevaluate_clearance', 'generate_report', 'send_email', 'record_note'] as const;

/** Workflow automation. Actions are a closed list: there is no approve, verify, assess or pay action. */
export function automationModule({ deps, authed }: ModuleContext) {
  const { db } = deps;

  authed.get('/automation/triggers', handler({}, async (req, res) => {
    send(res, await db.asUser(req.actor!, async (c) => (await c.query(`select * from public.automation_triggers where is_active order by code`)).rows));
  }));

  authed.get('/automation/rules', handler({}, async (req, res) => {
    send(res, await db.asUser(req.actor!, async (c) => (await c.query(
      `select r.*, coalesce((select json_agg(a order by a.step_order) from public.automation_actions a where a.rule_id = r.id), '[]') as actions
         from public.automation_rules r order by r.name`)).rows));
  }));

  authed.post('/automation/rules', handler({
    body: z.object({
      code: z.string().regex(/^[a-z0-9_]{3,60}$/), name: text(160), triggerCode: z.string().min(3).max(60),
      conditions: z.array(z.object({
        field: z.string().regex(/^[a-z_]+(\.[a-z_]+)*$/), op: z.enum(['eq', 'neq', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'exists', 'not_exists']),
        value: z.unknown().optional(),
      }).strict()).max(20).default([]),
      actions: z.array(z.object({ action_type: z.enum(ACTIONS), parameters: z.record(z.string(), z.unknown()).default({}) }).strict()).min(1).max(10),
      description: optionalText(1000), organizationId: z.uuid().optional(), officeId: z.uuid().optional(),
    }).strict(),
  }, async (req, res, { body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'automation_save_rule', {
      p_code: body.code, p_name: body.name, p_trigger_code: body.triggerCode, p_conditions: json(body.conditions), p_actions: json(body.actions),
      p_description: body.description ?? null, p_organization_id: body.organizationId ?? null, p_office_id: body.officeId ?? null })), 201);
  }));

  authed.post('/automation/rules/:id/enabled', handler({ params: idParams, body: z.object({ enabled: z.boolean() }).strict() }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'automation_set_rule_enabled', { p_rule_id: params.id, p_enabled: body.enabled })));
  }));

  authed.get('/automation/executions', handler({
    query: pagination.extend({ status: z.enum(['queued', 'running', 'succeeded', 'failed', 'dead', 'skipped']).optional(), ruleId: z.uuid().optional() }),
  }, async (req, res, { query }) => {
    const r = await db.asUser(req.actor!, (c) => paged(c,
      `select x.*, r.code as rule_code, r.name as rule_name from public.automation_executions x left join public.automation_rules r on r.id = x.rule_id
        where ($1::text is null or x.status = $1) and ($2::uuid is null or x.rule_id = $2)`,
      [query.status ?? null, query.ruleId ?? null], query, 'created_at desc'));
    send(res, r.rows, 200, r.meta);
  }));

  authed.get('/automation/executions/:id/logs', handler({ params: z.object({ id: z.coerce.number().int().positive() }) }, async (req, res, { params }) => {
    send(res, await db.asUser(req.actor!, async (c) => (await c.query(
      `select * from public.automation_execution_logs where execution_id = $1 order by step_order, created_at`, [params.id])).rows));
  }));

  authed.get('/automation/errors', handler({ query: pagination }, async (req, res, { query }) => {
    const r = await db.asUser(req.actor!, (c) => paged(c, `select * from public.automation_error_logs`, [], query, 'created_at desc'));
    send(res, r.rows, 200, r.meta);
  }));

  authed.get('/automation/scheduled-jobs', handler({}, async (req, res) => {
    send(res, await db.asUser(req.actor!, async (c) => (await c.query(`select * from public.scheduled_jobs order by code`)).rows));
  }));

  authed.put('/automation/scheduled-jobs/:code', handler({
    params: z.object({ code: z.string().regex(/^[a-z0-9_]{3,60}$/) }),
    body: z.object({ enabled: z.boolean().optional(), cronExpression: z.string().max(60).optional(), parameters: z.record(z.string(), z.unknown()).optional() }).strict(),
  }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'automation_update_scheduled_job', {
      p_code: params.code, p_enabled: body.enabled ?? null, p_cron_expression: body.cronExpression ?? null, p_parameters: body.parameters ? json(body.parameters) : null })));
  }));

  authed.post('/automation/scheduled-jobs/:code/run', handler({ params: z.object({ code: z.string().regex(/^[a-z0-9_]{3,60}$/) }) }, async (req, res, { params }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcValue(c, 'automation_run_scheduled_job', { p_code: params.code })));
  }));

  authed.get('/automation/templates', handler({}, async (req, res) => {
    send(res, await db.asUser(req.actor!, async (c) => (await c.query(`select * from public.notification_templates order by code, version desc`)).rows));
  }));

  authed.post('/automation/templates', handler({
    body: z.object({ code: z.string().regex(/^[a-z0-9_]{3,60}$/), subject: text(200), body: text(4000), channel: z.enum(['in_app', 'email', 'sms']).default('in_app'), locale: z.string().max(10).default('en') }).strict(),
  }, async (req, res, { body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'automation_save_notification_template', {
      p_code: body.code, p_subject: body.subject, p_body: body.body, p_channel: body.channel, p_locale: body.locale })), 201);
  }));
}
