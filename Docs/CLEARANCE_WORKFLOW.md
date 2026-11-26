# Clearance workflow

## The school's process

1. SAS initiates the clearance form.
2. The student completes the required organization receipts: SSG, department organization, applicable clubs.
3. The student completes Guidance and Library requirements:
   - teacher evaluations must be completed before the Guidance clearance slip is issued;
   - the Library ID must be validated for the academic year;
   - the Library receipt and Library clearance slip must be completed.
4. The SSG Governor checks: SSG receipt, department organization receipt, applicable club receipts,
   Library receipt, Guidance slip, Library slip, SSG event violations.
5. The SSG Governor approves.
6. The SAS Head approves.
7. The Department Organization Mayor checks department-specific violations and approves.
8. The applicable Program Head approves.
9. The clearance is completed.

Guidance and Library can be completed independently or in parallel (`guidance_records` and
`library_records` are separate; setting `clearance.guidance_library_parallel` documents this).

## How it is configured (nothing is hardcoded)

A **template** (`clearance_templates`) belongs to an academic year, has a version, and names the office
that may initiate it. Its **steps** (`clearance_steps`) name the approving position and how the approver's
scope is found:

| `approver_scope` | Approver is the holder of the position in ... |
|---|---|
| `fixed_organization` | a named organization (e.g. SSG) |
| `fixed_office` | a named office (e.g. SAS) |
| `student_department_organization` | the student's program's **confirmed** department organization |
| `student_program` | the student's program |

Steps with a lower `sequence` must all be approved before a higher one; steps sharing a sequence can be
approved in parallel. Each step lists **requirements** (`clearance_requirements`):

| `requirement_type` | Satisfied when |
|---|---|
| `receipt_obligations` | every applicable, active obligation of the selected organization(s) has a **verified** receipt |
| `guidance_slip` | the guidance slip is issued for the academic year |
| `library_slip` / `library_receipt` / `library_id_validation` | the matching library item is complete |
| `no_unresolved_penalties` | the student has no **verified** violation (count > 0) whose assessment is not resolved |

Organization selectors: `fixed`, `student_department_organization`, `student_clubs` (every club; each
club obligation's `applicability` decides whether it applies to this student).

Once a template is active its steps and requirements cannot be edited (trigger `TEMPLATE_LOCKED`); create a
new version instead. Each student clearance stores a snapshot of the template it was started from.

### Seeded template `STANDARD` (2026-2027)

| Seq | Step | Position | Scope | Requirements |
|---|---|---|---|---|
| 1 | SSG Governor | `governor` | SSG | SSG receipt; department organization receipt; applicable club receipts; library receipt; guidance slip; library slip; no unresolved SSG penalties |
| 2 | SAS Head | `sas_head` | SAS office | — |
| 3 | Department Organization Mayor | `mayor` | student's department organization | no unresolved department penalties |
| 4 | Program Head | `program_head` | student's program | — |

Initiation by SAS creates the clearance (step 1 of the process). Library ID validation is a prerequisite of
the library slip through the configurable setting `library.slip_prerequisites` (default `["id_validation"]`,
**unconfirmed**: whether the library receipt is also a prerequisite must be confirmed with the Library).

## Functions

| Function | Who | Rule |
|---|---|---|
| `initiate_student_clearance(student, template)` | holder of `clearance.initiate` in the template's initiating office | template active; not the student; resolves each step's scope; fails with `DEPARTMENT_ORGANIZATION_UNCONFIRMED` if a step needs the department organization and the program mapping is unconfirmed (e.g. CBAM) |
| `evaluate_student_clearance(clearance)` | anyone who can view it | re-evaluates and stores every requirement |
| `approve_clearance_step(approval, remarks)` | holder of the step's position at the step's scope, with `clearance.approve` | not the student; clearance in progress; earlier sequences approved; requirements re-evaluated live and all satisfied; completes the clearance when the last step is approved |
| `return_clearance_step(approval, remarks)` | the step's approver | remarks required; the student is notified |
| `cancel_student_clearance(clearance, reason)` | initiating office | reason required |

## What blocks and what does not

- Reported, rejected, disputed and voided violations **never** block clearance.
- A verified violation blocks until its assessment is resolved. If the organization's penalty is not
  confirmed (PADC today) it cannot be assessed, so it keeps blocking; the requirement details say so.
  An administrator must confirm that policy.
- A program with an unconfirmed department-organization mapping cannot start the STANDARD clearance.

## Tests

`Database/tests/060_clearance.sql` (23 checks) walks a BSIT student through the whole process and checks
every refusal above. See [TESTING_GUIDE.md](TESTING_GUIDE.md).
