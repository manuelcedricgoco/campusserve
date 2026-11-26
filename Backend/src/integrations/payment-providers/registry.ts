import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Env } from '../../config/env.js';
import { AppError } from '../../http/errors.js';

export type ProviderCode = 'gcash' | 'maya' | 'landbank';
export const PROVIDERS: { code: ProviderCode; label: string }[] = [
  { code: 'gcash', label: 'GCash' },
  { code: 'maya', label: 'Maya' },
  { code: 'landbank', label: 'LANDBANK' },
];

export interface CheckoutInput {
  reference: string;
  amount: number;
  description: string;
  returnUrl: string;
}
export interface CheckoutSession {
  providerTransactionId: string;
  checkoutUrl: string;
  expiresAt: Date;
}
export interface ParsedWebhook {
  eventId: string;
  eventType: string;
  signatureValid: boolean;
  reference: string;
  providerTransactionId: string | null;
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled' | 'refunded';
  amount: number | null;
  payload: unknown;
}

/**
 * A payment provider adapter. Real GCash / Maya / LANDBANK adapters must be implemented against the
 * authorized merchant or gateway API once onboarding, credentials and webhook validation are available.
 */
export interface PaymentProvider {
  code: ProviderCode;
  label: string;
  mode: 'live' | 'sandbox' | 'not_configured';
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ParsedWebhook;
}

export interface PaymentProviderRegistry {
  get(code: ProviderCode): PaymentProvider;
  list(): PaymentProvider[];
}

class NotConfiguredProvider implements PaymentProvider {
  readonly mode = 'not_configured' as const;
  constructor(readonly code: ProviderCode, readonly label: string) {}
  async createCheckout(): Promise<CheckoutSession> {
    throw new AppError(503, 'PROVIDER_NOT_CONFIGURED',
      `${this.label} payments are not available yet. Merchant integration has not been completed.`);
  }
  parseWebhook(): ParsedWebhook {
    throw new AppError(404, 'PROVIDER_NOT_CONFIGURED', `${this.label} webhooks are not configured.`);
  }
}

const SANDBOX_STATUSES = new Set(['pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded']);

/**
 * DEVELOPMENT SANDBOX. Simulates a provider: the "checkout" is a CampusServe page and the "webhook" is
 * signed with HMAC-SHA256 using PAYMENT_SANDBOX_SECRET. No money moves. Refused in production.
 */
export class SandboxProvider implements PaymentProvider {
  readonly mode = 'sandbox' as const;
  constructor(readonly code: ProviderCode, readonly label: string, private readonly secret: string) {}

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const providerTransactionId = `sandbox-${this.code}-${randomUUID()}`;
    const url = new URL(input.returnUrl);
    url.searchParams.set('sandbox', '1');
    url.searchParams.set('reference', input.reference);
    return { providerTransactionId, checkoutUrl: url.toString(), expiresAt: new Date(Date.now() + 30 * 60_000) };
  }

  sign(rawBody: Buffer | string): string {
    return createHmac('sha256', this.secret).update(rawBody).digest('hex');
  }

  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ParsedWebhook {
    const header = headers['x-sandbox-signature'];
    const given = typeof header === 'string' ? header : '';
    const expected = this.sign(rawBody);
    const signatureValid = given.length === expected.length
      && timingSafeEqual(Buffer.from(given, 'utf8'), Buffer.from(expected, 'utf8'));
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    } catch {
      throw new AppError(400, 'INVALID_WEBHOOK', 'Webhook body is not JSON.');
    }
    const status = String(body.status ?? '');
    if (typeof body.event_id !== 'string' || typeof body.reference !== 'string' || !SANDBOX_STATUSES.has(status)) {
      throw new AppError(400, 'INVALID_WEBHOOK', 'Webhook is missing event_id, reference or a valid status.');
    }
    return {
      eventId: body.event_id,
      eventType: typeof body.event_type === 'string' ? body.event_type : `payment.${status}`,
      signatureValid,
      reference: body.reference,
      providerTransactionId: typeof body.transaction_id === 'string' ? body.transaction_id : null,
      status: status as ParsedWebhook['status'],
      amount: typeof body.amount === 'number' ? body.amount : null,
      payload: body,
    };
  }
}

export function createPaymentRegistry(env: Env): PaymentProviderRegistry {
  const providers = new Map<ProviderCode, PaymentProvider>();
  for (const p of PROVIDERS) {
    providers.set(p.code, env.PAYMENT_SANDBOX && env.PAYMENT_SANDBOX_SECRET && env.NODE_ENV !== 'production'
      ? new SandboxProvider(p.code, p.label, env.PAYMENT_SANDBOX_SECRET)
      : new NotConfiguredProvider(p.code, p.label));
  }
  return {
    get: (code) => {
      const p = providers.get(code);
      if (!p) throw new AppError(404, 'PROVIDER_NOT_FOUND', 'Unknown payment provider.');
      return p;
    },
    list: () => [...providers.values()],
  };
}
