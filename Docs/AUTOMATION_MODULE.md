# Automation module

Status: **database foundation built and verified (Phase 1).** The in-database executor is running on the live
project (pg_cron, every minute). All rules and scheduled jobs are **disabled** until an administrator enables
them. The backend worker (email, report generation) and the configuration UI are Phase 2.

## How it works (decision D4)

```
business change (request, ticket, receipt, clearance, payment, community service, violation, guidance/library)
   └─ trigger private.capture_automation_event()          — never fails the business change
        └─ automation_events (idempotency_key UNIQUE)      — recorded only if an enabled rule listens
             └─ matching enabled rules (scope + conditions)
                  └─ automation_executions (queued, executor = database | backend)
                       ├─ database: public.automation_run_due()  ← pg_cron every minute
                       └─ backend:  automation_claim_backend_executions / automation_complete_execution
scheduled_jobs ─ pg_cron (only when enabled) ─ automation_run_scheduled_job() ─ emits events ─ same pipeline
```

- **Idempotency:** events are unique by key (table:id:event:status:transaction); executions are unique per
  (rule, event); scheduled reminders are unique per item per day.
- **Retries:** a failed execution is retried with exponential backoff (2, 4, 8 … minutes) up to
  `max_attempts` (default 3), then marked `dead`. Every failure is written to `automation_error_logs`.
- **Isolation:** errors in event capture or matching are logged and swallowed; the business transaction
  always completes (tested).
- **Audit:** step logs in `automation_execution_logs`; configuration changes recorded by the audit trigger in
  `audit_logs`; notifications delivered are logged in `notification_delivery_logs`.

## No decisions by automation

`automation_actions.action_type` is a closed list enforced by a CHECK constraint:
`send_notification`, `send_reminder`, `escalate_to_position` (notifies only), `reevaluate_clearance`
(recomputes requirement status; never approves), `generate_report`, `send_email` (backend), `record_note`.
There is no action that approves, verifies, rejects, assesses or pays (tested, including direct inserts).

## Triggers (events)

`service_request.submitted`, `service_request.status_changed`, `service_request.pending_reminder`*,
`service_request.overdue`*, `queue_ticket.status_changed`, `receipt.verified`, `clearance.requirement_changed`,
`clearance.step_status_changed`, `clearance.status_changed`, `clearance.deadline_approaching`*,
`payment.status_changed`, `community_service.status_changed`, `violation.status_changed`, `report.scheduled`*
(* emitted by scheduled jobs).

Conditions are a JSON array of `{field, op, value}` with `op` in `eq, neq, in, not_in, gt, gte, lt, lte,
exists, not_exists`; invalid operators are rejected.

## Seeded defaults (all disabled)

| Rule | Trigger | Action |
|---|---|---|
| `pending_request_reminder` | pending reminder | notify office staff holding `requests.manage` |
| `overdue_request_escalation` | overdue | notify the office head / SAS head (no decision) |
| `reevaluate_clearance_on_receipt` | receipt verified | re-evaluate open clearances |
| `reevaluate_clearance_on_requirement` | guidance/library change | re-evaluate open clearances |
| `clearance_deadline_reminder` | deadline approaching | remind the student |
| `queue_ticket_office_changes` | ticket → no_show / cancelled / completed | notify the student |
| `community_service_updates` | community service verified / rejected | notify the student |
| `payment_failure_notice` | payment failed / expired / refunded | notify the student |

These complement — never duplicate — the notifications the workflow functions already send (for example the
reservation, call-next, verification and clearance notifications).

| Scheduled job | Default cron (UTC) | Parameters |
|---|---|---|
| `pending_request_reminders` | `0 8 * * 1-5` | `older_than_hours: 48` |
| `overdue_request_escalation` | `30 8 * * 1-5` | — |
| `clearance_deadline_reminders` | `0 7 * * *` | `days_before: 3` |
| `generate_queue_slots` | `0 1 * * *` | `days_ahead: 14` |
| `expire_public_ai_sessions` | `15 * * * *` | — |

pg_cron uses **UTC** (08:00 UTC = 16:00 Manila); adjust the expression when enabling.

## Deadlines (decision D7)

`services.target_processing_days` (sets `service_requests.due_at` on submission) and
`student_clearances.due_date` are new, nullable and **unconfirmed** — empty until offices configure them.
Overdue and deadline jobs skip records without a deadline.

## Configuration

`automation_save_rule`, `automation_set_rule_enabled`, `automation_update_scheduled_job` (also syncs pg_cron),
`automation_save_notification_template` and `automation_run_scheduled_job` ("run now") require
`automation.manage` (administrators). Organization heads and office heads with `automation.view` see rules,
events and executions scoped to their organization or office.

## Not done yet (Phase 2+)

Backend worker for `generate_report` / `send_email`; email/SMS providers (none configured — in-app only);
configuration and monitoring UI; production cron times.

## Tests

`Database/tests/090_automation.sql` — 37 checks, passed locally and on the live project (rolled back,
including real pg_cron job registration and removal).
