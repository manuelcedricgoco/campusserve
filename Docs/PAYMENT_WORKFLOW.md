# Digital payment workflow (database layer)

> **Status: no payment provider is live.** GCash, Maya and LANDBANK are not integrated. The database is
> ready for authorized provider adapters, but `payments.enabled_providers` is `[]`, so
> `create_penalty_payment` refuses every provider with `PROVIDER_NOT_AVAILABLE`. Do not enable a provider
> until merchant onboarding, official API access, credentials, webhook signature validation and end-to-end
> tests are complete.

## Flow

1. The student selects payment as the resolution of an assessment (`select_penalty_resolution`).
2. The amount due is the assessment's `required_amount`, computed server side from the policy snapshot.
3. The student chooses GCash, Maya or LANDBANK.
4. `create_penalty_payment(assessment, provider, idempotency_key)` creates the record (`created`). Calling it
   again with the same key returns the same payment; reusing a key for another payment fails
   (`IDEMPOTENCY_CONFLICT`). Only one live payment per assessment is allowed.
5. The backend's provider adapter creates a checkout session and stores it with
   `attach_payment_checkout` (service role only) → `pending`.
6. The provider calls the backend webhook. The backend validates the signature and calls
   `process_payment_webhook` (service role only):
   - events are stored once per (provider, provider_event_id); replays return `duplicate`;
   - invalid signature → `ignored`; unknown reference, transaction-ID mismatch or wrong amount → `failed`;
   - allowed transitions: `created/pending → pending/paid/failed/expired/cancelled`, `paid → refunded`;
   - `paid` moves the assessment to `pending_verification` (not resolved);
   - `refunded` reopens the penalty.
7. The responsible organization's treasurer reconciles (`record_payment_reconciliation`: matched,
   amount mismatch, status mismatch, not found at provider) and verifies (`verify_penalty_payment`).
8. The penalty becomes `resolved` only after that verification.

## Safeguards

- Only the service role can mark a payment paid. Staff cannot, and there is no screenshot field: an
  upload is never proof of settlement.
- `verification_status = 'verified'` requires `status = 'paid'` (CHECK constraint).
- The student can never verify their own payment (CHECK constraint and function check).
- Only the responsible organization can verify or reconcile (SSG verifies SSG, PADC verifies PADC, ...).
- Provider credentials belong in backend environment variables, never in the database, the frontend or
  `system_settings`.

## Tables

`penalty_payments`, `payment_webhook_events`, `payment_reconciliation_records` — see
[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

## Tests

The webhook path is tested with simulated provider calls in
`Database/tests/050_violations_penalties_payments.sql` (provider temporarily enabled inside a rolled-back
transaction). No real provider has been called.
