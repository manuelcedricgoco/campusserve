import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { z } from 'zod';
import { handler, idParams, optionalText, pagination, send, text } from '../../http/http.js';
import { rpcOne, rpcValue, json } from '../../db/database.js';
import { AppError, notFound } from '../../http/errors.js';
import type { ModuleContext } from '../context.js';
import { elevate, paged } from '../shared.js';
import { PROVIDERS, SandboxProvider, type ProviderCode, type PaymentProviderRegistry } from '../../integrations/payment-providers/registry.js';
import type { Database } from '../../db/database.js';

const providerCode = z.enum(PROVIDERS.map((p) => p.code) as [ProviderCode, ...ProviderCode[]]);

/** Records a verified-or-not provider callback through the idempotent database function. */
async function processWebhook(db: Database, payments: PaymentProviderRegistry, code: ProviderCode, raw: Buffer, headers: Request['headers']) {
  const parsed = payments.get(code).parseWebhook(raw, headers);
  const result = await db.asService((c) => rpcValue<{ result: string; reason?: string }>(c, 'process_payment_webhook', {
    p_provider: code, p_provider_event_id: parsed.eventId, p_event_type: parsed.eventType, p_signature_valid: parsed.signatureValid,
    p_payload: json(parsed.payload), p_reference: parsed.reference, p_provider_transaction_id: parsed.providerTransactionId,
    p_status: parsed.status, p_amount: parsed.amount,
  }));
  return { parsed, result };
}

/**
 * Online penalty payments through a provider-independent adapter. A payment counts only after the provider
 * confirms it by a signed callback AND the organization verifies it. Screenshots are never accepted as proof.
 */
export function paymentsModule({ deps, authed, webhooks }: ModuleContext) {
  const { db, payments, env } = deps;

  authed.get('/payments/providers', handler({}, (_req, res) => {
    send(res, payments.list().map((p) => ({
      code: p.code, label: p.label, mode: p.mode,
      available: p.mode !== 'not_configured',
      notice: p.mode === 'sandbox' ? 'Development sandbox: simulated payments only, no money moves.'
        : p.mode === 'not_configured' ? 'Not available yet: merchant integration has not been completed.' : null,
    })));
  }));

  authed.post('/payments', handler({
    body: z.object({ assessmentId: z.uuid(), provider: providerCode }).strict(),
  }, async (req, res, { body }) => {
    const key = req.header('Idempotency-Key');
    if (!key || !/^[A-Za-z0-9_-]{16,100}$/.test(key)) {
      throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Send an Idempotency-Key header (16-100 letters, digits, - or _).');
    }
    const provider = payments.get(body.provider);
    // Provider checkout runs inside the transaction: if it fails, no half-created payment is left behind.
    const payment = await db.asUser(req.actor!, async (c) => {
      const p = await rpcOne<Record<string, unknown> & { id: string; status: string; reference: string; amount: number; provider_checkout_url: string | null }>(
        c, 'create_penalty_payment', { p_assessment_id: body.assessmentId, p_provider: body.provider, p_idempotency_key: key });
      if (p.status !== 'created') return p; // idempotent replay of an existing checkout
      const session = await provider.createCheckout({
        reference: p.reference, amount: p.amount, description: `CampusServe penalty ${p.reference}`, returnUrl: env.PAYMENT_RETURN_URL,
      });
      await elevate(c);
      return rpcOne(c, 'attach_payment_checkout', {
        p_payment_id: p.id, p_provider_transaction_id: session.providerTransactionId, p_checkout_url: session.checkoutUrl, p_expires_at: session.expiresAt,
      });
    });
    send(res, { ...payment, sandbox: provider.mode === 'sandbox' }, 201);
  }));

  authed.get('/payments', handler({
    query: pagination.extend({
      scope: z.enum(['mine', 'all']).default('mine'), organizationId: z.uuid().optional(),
      status: z.enum(['created', 'pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded']).optional(),
      verification: z.enum(['unverified', 'verified', 'rejected']).optional(),
    }),
  }, async (req, res, { query }) => {
    const result = await db.asUser(req.actor!, (c) => paged(c,
      `select pp.id, pp.reference, pp.assessment_id, pp.student_id, pp.organization_id, pp.amount, pp.currency, pp.provider,
              pp.provider_transaction_id, pp.provider_checkout_url, pp.status, pp.status_reason, pp.paid_at, pp.expires_at,
              pp.verification_status, pp.verified_by, pp.verified_at, pp.verification_notes, pp.created_at,
              o.code as organization_code, p.full_name as student_name, st.student_number
         from public.penalty_payments pp join public.organizations o on o.id = pp.organization_id
         join public.profiles p on p.id = pp.student_id join public.students st on st.profile_id = pp.student_id
        where ($1 = 'all' or pp.student_id = auth.uid()) and ($2::uuid is null or pp.organization_id = $2)
          and ($3::text is null or pp.status = $3) and ($4::text is null or pp.verification_status = $4)`,
      [query.scope, query.organizationId ?? null, query.status ?? null, query.verification ?? null], query, 'created_at desc'));
    send(res, result.rows, 200, result.meta);
  }));

  authed.get('/payments/:id', handler({ params: idParams }, async (req, res, { params }) => {
    const data = await db.asUser(req.actor!, async (c) => {
      const p = (await c.query(`select pp.*, o.code as organization_code from public.penalty_payments pp
          join public.organizations o on o.id = pp.organization_id where pp.id = $1`, [params.id])).rows[0];
      if (!p) return null;
      const reconciliations = (await c.query(
        `select * from public.payment_reconciliation_records where penalty_payment_id = $1 order by created_at`, [params.id])).rows;
      return { ...p, reconciliations };
    });
    if (!data) throw notFound('Payment');
    send(res, data);
  }));

  authed.post('/payments/:id/verify', handler({
    params: idParams, body: z.object({ decision: z.enum(['verified', 'rejected']), notes: optionalText(1000) }).strict(),
  }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'verify_penalty_payment', { p_payment_id: params.id, p_decision: body.decision, p_notes: body.notes ?? null })));
  }));

  authed.post('/payments/:id/reconcile', handler({
    params: idParams,
    body: z.object({
      source: z.enum(['provider_api', 'settlement_report', 'manual_review']), providerReference: optionalText(120),
      providerAmount: z.number().min(0).max(10_000_000).multipleOf(0.01).optional(), providerStatus: optionalText(40), notes: optionalText(1000),
    }).strict(),
  }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'record_payment_reconciliation', {
      p_payment_id: params.id, p_source: body.source, p_provider_reference: body.providerReference ?? null,
      p_provider_amount: body.providerAmount ?? null, p_provider_status: body.providerStatus ?? null, p_notes: body.notes ?? null })), 201);
  }));

  authed.get('/payments-webhooks', handler({ query: pagination }, async (req, res, { query }) => {
    const result = await db.asUser(req.actor!, (c) => paged(c,
      `select id, provider, provider_event_id, event_type, signature_valid, penalty_payment_id, processing_status, processing_error, received_at, processed_at
         from public.payment_webhook_events`, [], query, 'received_at desc'));
    send(res, result.rows, 200, result.meta);
  }));

  // Provider callbacks (raw body). Unknown/unconfigured providers answer 404; bad signatures are recorded and ignored.
  webhooks.post('/payments/:provider', async (req, res, next) => {
    try {
      const code = providerCode.parse(req.params.provider);
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const { parsed, result } = await processWebhook(db, payments, code, raw, req.headers);
      if (!parsed.signatureValid) throw new AppError(401, 'INVALID_SIGNATURE', 'Webhook signature is invalid.');
      send(res, result);
    } catch (error) {
      next(error instanceof z.ZodError ? new AppError(404, 'PROVIDER_NOT_FOUND', 'Unknown payment provider.') : error);
    }
  });

  // DEVELOPMENT SANDBOX ONLY: lets the student finish a simulated checkout. It goes through the same signed
  // webhook path as a real provider; the organization must still verify the payment. Disabled in production.
  authed.post('/payments/sandbox/complete', handler({
    body: z.object({ reference: text(60), outcome: z.enum(['paid', 'failed', 'cancelled']) }).strict(),
  }, async (req, res, { body }) => {
    const payment = await db.asUser(req.actor!, async (c) => (await c.query(
      `select id, provider, provider_transaction_id, amount, student_id from public.penalty_payments where reference = $1 and student_id = auth.uid()`,
      [body.reference])).rows[0]);
    if (!payment) throw notFound('Payment');
    const provider = payments.get(payment.provider);
    if (!(provider instanceof SandboxProvider) || env.NODE_ENV === 'production') {
      throw new AppError(404, 'SANDBOX_DISABLED', 'The payment sandbox is not enabled.');
    }
    const raw = Buffer.from(JSON.stringify({
      event_id: `sandbox-evt-${randomUUID()}`, event_type: `payment.${body.outcome}`, reference: body.reference,
      transaction_id: payment.provider_transaction_id, status: body.outcome, amount: payment.amount, sandbox: true,
    }));
    const { result } = await processWebhook(db, payments, payment.provider, raw, { 'x-sandbox-signature': provider.sign(raw) });
    send(res, { ...result, sandbox: true });
  }));
}
