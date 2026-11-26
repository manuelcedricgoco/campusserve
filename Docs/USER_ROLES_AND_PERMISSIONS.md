# User roles, permissions and Row Level Security

## Model

| Layer | What it answers | Where |
|---|---|---|
| **System role** | What kind of account is this? | `user_roles` (`student`, `office_staff`, `administrator`, `cashier`, `department_head`) |
| **Assignment** | Which position does the person hold, where, and for which academic year? | `organization_assignments`, `office_staff`, `academic_assignments` |
| **Position** | What may that position do? | `positions` + `position_permissions` |
| **Role permission** | Campus-wide powers of a system role | `role_permissions` |

An assignment only counts when it is active, belongs to the **current** academic year and the person's
profile is active. Deactivating a profile removes all access, including reference data.

New accounts get one role, `student`. A role is never taken from sign-up metadata; only an administrator
(through the trusted backend) grants roles and assignments.

## Positions

| Position | Scope | Typical use |
|---|---|---|
| `governor` | organization | SSG Governor |
| `mayor` | organization | Department Organization Mayor (PADC, YMO, JOES, JFMS, ...) |
| `president` | organization | Club president |
| `treasurer` | organization | SSG / organization / club treasurer |
| `class_officer` | organization (+ optional program and section) | Batch remittance for a class |
| `violation_officer` | organization | Reports violations |
| `sas_staff` | office | SAS staff (initiates clearance) |
| `sas_head` | office | SAS Head (approves a clearance step) |
| `guidance_staff` | office | Teacher evaluations, guidance slips |
| `library_staff` | office | Library ID, library receipt, library slip |
| `office_staff` | office | Any office: queue and requests |
| `office_head` | office | Any office head |
| `program_head` | academic (program) | Program Head (approves a clearance step) |
| `department_head` | academic (department or program) | Department-level read access |

A position's authority is limited to the organization, office, program or department of the assignment.
A PADC treasurer cannot verify SSG payments; Guidance staff cannot touch Library records.

## Permission matrix

| Permission | Granted to |
|---|---|
| `students.view` | governor, mayor, president, treasurer, sas_staff, sas_head, guidance_staff, library_staff, office_staff, office_head, program_head, department_head |
| `org.view_members` | governor, mayor, president, treasurer |
| `org.manage_members` | governor, mayor, president |
| `receipts.view` | governor, mayor, president, treasurer |
| `receipts.record`, `receipts.verify`, `remittance.review` | treasurer |
| `remittance.create` | class_officer |
| `violations.view` | governor, mayor, president, violation_officer |
| `violations.report` | governor, mayor, president, violation_officer |
| `violations.review`, `disputes.decide`, `penalties.assess`, `penalties.verify_service` | governor, mayor |
| `penalties.view` | governor, mayor, treasurer |
| `payments.verify`, `payments.reconcile` | treasurer |
| `clearance.approve` | governor, mayor, sas_head, program_head |
| `clearance.initiate` | sas_staff, sas_head |
| `queue.manage`, `requests.manage` | sas_staff, sas_head, guidance_staff, library_staff, office_staff, office_head |
| `guidance.manage` | guidance_staff |
| `library.manage` | library_staff |
| `reports.view` | sas_head, office_head, program_head, department_head |

Campus-wide (system roles):

| Permission | administrator | cashier |
|---|:-:|:-:|
| `records.view_all` | ✓ | |
| `users.manage` | ✓ | |
| `config.manage` | ✓ | |
| `audit.view` | ✓ | |
| `reports.view_all` | ✓ | |
| `payments.view_all` | ✓ | ✓ |
| `payments.view_webhooks` | ✓ | |

Administrators can read and configure, but hold **no** approval or verification permission: they cannot
approve a clearance step, verify a receipt, a violation, community service or a payment. Cashiers can see
payments and reconciliation records only; they cannot see student records or violations.

Which positions hold which permissions is data (`position_permissions`), so the school can adjust it
without code changes. The matrix above is the seeded default.

## Write model

| Who | How they change data |
|---|---|
| `anon` | Cannot read or write anything. |
| `authenticated` | `SELECT` only (filtered by RLS) + `UPDATE (read_at)` on their own notifications. All other changes go through the workflow functions listed in [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md#database-functions), which check `auth.uid()` and the caller's assignment. |
| `service_role` (backend only) | Bypasses RLS. Used for administration, payment provider webhooks (`process_payment_webhook`, `attach_payment_checkout`), file storage and signed URLs. The key must never reach a browser. |

## Row Level Security by table

RLS is enabled on all 55 tables. All policies are `SELECT` policies for `authenticated` except
`notifications_mark_read_own` (`UPDATE`).

| Tables | Students | Organization officers | Office staff | Program / Department Heads | Cashier | Administrator |
|---|---|---|---|---|---|---|
| Reference & configuration (academic years, departments, organizations, clubs, programs, offices, positions, permissions, services, schedules, slots, obligations, events, policies & versions, clearance templates / steps / requirements, system settings) | read | read | read | read | read | read |
| `profiles`, `students` | own | SSG officers: all; department org officers: students of the mapped program; club officers: their members | all (with `students.view`) | their program(s) | — | all |
| `user_roles` | own | own | own | own | own | all (`users.manage`) |
| `office_staff`, `organization_assignments`, `academic_assignments` | own | own + their organization's officers | own + their office's staff | own | own | all |
| `organization_members` | own | their organization | — | — | — | all |
| `service_requests`, `request_documents`, `request_status_history` | own | — | their office (`requests.manage`) | — | — | all |
| `queue_tickets`, `queue_events` | own | — | their office (`queue.manage`) | — | — | all |
| `receipt_records`, `receipt_verifications` | own | their organization (`receipts.view`) | — | — | — | all |
| `remittance_batches`, `remittance_batch_items` | own allocations; class officer: own batches | treasurer (`remittance.review`) | — | — | — | all |
| `guidance_records` | own | — | Guidance (`guidance.manage`) | — | — | all |
| `library_records` | own | — | Library (`library.manage`) | — | — | all |
| `violation_records`, evidence, reviews, disputes | own | their organization (`violations.view`) | — | — | — | all |
| `penalty_assessments`, `penalty_resolutions`, `community_service_records` | own | their organization (`penalties.view`) | — | — | — | all |
| `penalty_payments` | own | their organization (`payments.verify` or `penalties.view`) | — | — | all | all |
| `payment_reconciliation_records` | — | their organization (`payments.reconcile`) | — | — | all | all |
| `payment_webhook_events` | — | — | — | — | — | all (`payments.view_webhooks`) |
| `student_clearances`, approvals, requirement status, history | own | approvers of a step (holding the step's position at its scope) | initiating office (`clearance.initiate`) | approvers of a step | — | all |
| `notifications` | own (read + mark read) | own | own | own | own | own |
| `audit_logs` | — | — | — | — | — | all (`audit.view`) |

## Self-verification guards

These are CHECK constraints, so they hold even for service-role writes:

`receipt_records`, `remittance_batch_items`, `guidance_records`, `library_records`, `violation_records`
(reporter and reviewer), `violation_disputes`, `penalty_assessments` (assessor and resolver),
`penalty_resolutions`, `community_service_records`, `penalty_payments`, `student_clearances` (initiator).
The workflow functions additionally reject a student approving their own clearance step.

## Storage

Buckets `violation-evidence`, `request-documents` and `community-service-proofs` are private, limited to
JPEG / PNG / PDF and 5–10 MB. No storage policies grant `authenticated` access, so files are reachable only
through the backend, which must check the caller's access to the parent record before issuing a signed URL.

## Tests

`Database/tests/010_rls_access.sql` checks each row of the tables above (35 checks), and every workflow suite
checks that the wrong organization, office or role is refused. See [TESTING_GUIDE.md](TESTING_GUIDE.md).
