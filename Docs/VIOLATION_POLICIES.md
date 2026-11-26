# Violation policies

Each organization has its own policies, versions, calculation, penalty options and resolution authority.
No organization's rule is applied to another.

## Policy versions

A policy (`violation_policies`) has versions (`violation_policy_versions`) per academic year. At most one
version per policy and year is `active`. Once a version is active or retired it cannot be edited (trigger
`POLICY_VERSION_IMMUTABLE`); the only allowed change is retiring it. To change a rule, create a new version.

| Field | Meaning |
|---|---|
| `calculation_type` | `per_violation` (each verified record = 1) or `quantity_threshold` (floor(quantity ÷ `quantity_per_violation`) per record) |
| `quantity_unit`, `quantity_per_violation` | e.g. `bottles`, `10` |
| `hours_per_violation`, `amount_per_violation` | penalty rates |
| `allowed_resolutions` | `community_service`, `payment` (the student chooses one) |
| `penalty_confirmed` | `false` = the penalty is not confirmed: violations can be counted, but no penalty can be assessed |

## Confirmed policies (from the master specification)

### SSG — event violations

- `per_violation`; 1 hour of community service **or** PHP 60 per verified violation; student chooses.
- `required_hours = verified_violations × 1`, `required_payment = verified_violations × 60`.
- SSG (Governor) verifies community service; SSG (Treasurer) verifies payments.

| Verified violations | Hours | or PHP |
|---|---|---|
| 1 | 1 | 60 |
| 2 | 2 | 120 |
| 3 | 3 | 180 |

### PADC — bottle policy

- `quantity_threshold`, unit `bottles`, 10 per violation, **floor division, per event, no carry-over**.
- 9→0, 10→1, 15→1, 20→2, 25→2, 30→3 (tested).
- One tally per student per event (unique index), so bottles cannot be split or merged across events.
- **Penalty amount and resolution options: UNCONFIRMED** (`penalty_confirmed = false`, no options).
  PADC violations can be reported, verified and counted, but `assess_penalty` refuses with
  `PENALTY_NOT_CONFIGURED`, and a verified PADC violation keeps blocking the Mayor's clearance step until a
  confirmed version exists.

**To confirm PADC's penalty:** retire version 1 and insert version 2 with the same count rule plus the
confirmed rates, allowed resolutions and `penalty_confirmed = true`, then activate it.

## Not configured (by design)

JOES, JFMS, YMO and every other organization have **no policy**. Their rules are not known and were not
invented. An administrator adds them as policies with versions when confirmed.

## Workflow

1. An officer with `violations.report` reports (`report_violation`); details, event, quantity; evidence goes
   to the private `violation-evidence` bucket via the backend. Officers cannot report themselves.
2. A reviewer with `violations.review` verifies or rejects (`review_violation`); the count is computed at
   verification from the record's policy version. Rejection needs a reason.
3. Only `verified` records count.
4. The student may dispute (`file_violation_dispute`); a disputed record does not count. If it was in an
   open assessment with no submitted resolution, that assessment is superseded.
5. A decider with `disputes.decide` upholds (record voided) or denies (record restored) the dispute.
6. An officer with `penalties.assess` assesses (`assess_penalty`): sums verified, unassessed counts under the
   **currently active, confirmed** version, stores a full snapshot of that version, and supersedes an open
   unstarted assessment.
7. The student selects an allowed resolution (`select_penalty_resolution`).
8. The student submits community service (`submit_community_service`) or pays (see
   [PAYMENT_WORKFLOW.md](PAYMENT_WORKFLOW.md)).
9. The responsible organization verifies (`verify_community_service` / `verify_penalty_payment`). The
   penalty is `resolved` only after successful verification.

Historical assessments keep their `policy_snapshot`, `violation_count`, `required_hours` and
`required_amount`; these columns cannot be changed (trigger `ASSESSMENT_IMMUTABLE`).

## Tests

`Database/tests/050_violations_penalties_payments.sql` (45 checks).
