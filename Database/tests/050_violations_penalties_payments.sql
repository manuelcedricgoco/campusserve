-- Violation, penalty and payment tests.
begin;
\ir _helpers.sql

select pg_temp.as_owner();
select pg_temp.put('ssg_policy', (select p.id from public.violation_policies p join public.organizations o
                                  on o.id = p.organization_id where o.code = 'SSG')::text);
select pg_temp.put('padc_policy', (select p.id from public.violation_policies p join public.organizations o
                                   on o.id = p.organization_id where o.code = 'PADC')::text);
select pg_temp.put('ssg_v1', (select id from public.violation_policy_versions
                              where policy_id = pg_temp.get('ssg_policy')::uuid and version_number = 1)::text);
select pg_temp.put('padc_v1', (select id from public.violation_policy_versions
                               where policy_id = pg_temp.get('padc_policy')::uuid and version_number = 1)::text);
select pg_temp.put('ssg_event', (select e.id from public.organization_events e join public.organizations o
                                 on o.id = e.organization_id where o.code = 'SSG')::text);
select pg_temp.put('padc_event', (select e.id from public.organization_events e join public.organizations o
                                  on o.id = e.organization_id where o.code = 'PADC')::text);

-- PADC bottle calculation (floor division, never rounds up) -------------------------
select pg_temp.ok(
  (select bool_and(public.calculate_violation_count(pg_temp.get('padc_v1')::uuid, bottles) = expected)
     from (values (0, 0), (9, 0), (10, 1), (15, 1), (19, 1), (20, 2), (25, 2), (30, 3), (99, 9)) t(bottles, expected)),
  'PADC: 9->0, 10->1, 15->1, 20->2, 25->2, 30->3 (floor division)');
select pg_temp.fails(format('select public.calculate_violation_count(%L, null)', pg_temp.get('padc_v1')),
  'QUANTITY_REQUIRED', 'PADC count needs a bottle quantity');
select pg_temp.ok(public.calculate_violation_count(pg_temp.get('ssg_v1')::uuid, null) = 1,
  'SSG: each verified record is one violation');

-- SSG penalty: hours = n x 1, payment = n x 60 ----------------------------------------
select pg_temp.ok(
  (select bool_and(c.required_hours = n * 1 and c.required_amount = n * 60
                   and c.allowed_resolutions @> array['community_service', 'payment'])
     from generate_series(1, 3) n, public.calculate_penalty(pg_temp.get('ssg_v1')::uuid, n) c),
  'SSG: 1->1h/PHP60, 2->2h/PHP120, 3->3h/PHP180, student chooses');
select pg_temp.fails(format('select * from public.calculate_penalty(%L, 2)', pg_temp.get('padc_v1')),
  'PENALTY_NOT_CONFIGURED', 'PADC penalty is unconfirmed and cannot be calculated');
select pg_temp.ok(not exists (
    select 1 from public.violation_policies p join public.organizations o on o.id = p.organization_id
     where o.code in ('JOES', 'JFMS', 'YMO')),
  'no policy is assumed for JOES, JFMS or YMO');

-- Reporting -----------------------------------------------------------------------------
select pg_temp.act_as('bsit1');
select pg_temp.fails(format('select public.report_violation(%L, %L, ''x'')', pg_temp.get('ssg_policy'), pg_temp.u('bsit2')),
  'FORBIDDEN', 'a student cannot report violations');
select pg_temp.act_as('ssg_governor');
select pg_temp.fails(format('select public.report_violation(%L, %L, ''x'')', pg_temp.get('ssg_policy'), pg_temp.u('ssg_governor')),
  'SELF_REPORT', 'an officer cannot report themselves');
select pg_temp.fails(format('select public.report_violation(%L, %L, ''x'')', pg_temp.get('padc_policy'), pg_temp.u('bsit1')),
  'FORBIDDEN', 'SSG officers cannot report under the PADC policy');
-- three SSG violations for bsit2, one for bsit1
select pg_temp.put('s1', (public.report_violation(pg_temp.get('ssg_policy')::uuid, pg_temp.u('bsit2'), 'Absent at assembly', pg_temp.get('ssg_event')::uuid)).id::text);
select pg_temp.put('s2', (public.report_violation(pg_temp.get('ssg_policy')::uuid, pg_temp.u('bsit2'), 'Late at assembly', pg_temp.get('ssg_event')::uuid)).id::text);
select pg_temp.put('s3', (public.report_violation(pg_temp.get('ssg_policy')::uuid, pg_temp.u('bsit2'), 'No ID at assembly')).id::text);
select pg_temp.put('s4', (public.report_violation(pg_temp.get('ssg_policy')::uuid, pg_temp.u('bsit1'), 'Absent at assembly')).id::text);

select pg_temp.act_as('padc_mayor');
select pg_temp.fails(format('select public.report_violation(%L, %L, ''bottles'')', pg_temp.get('padc_policy'), pg_temp.u('bsit1')),
  'QUANTITY_REQUIRED', 'PADC report needs an event and a bottle count');
select pg_temp.put('p1', (public.report_violation(pg_temp.get('padc_policy')::uuid, pg_temp.u('bsit1'), 'Bottle drive',
                                                  pg_temp.get('padc_event')::uuid, 25)).id::text);
select pg_temp.fails(format('select public.report_violation(%L, %L, ''again'', %L, 5)', pg_temp.get('padc_policy'),
                            pg_temp.u('bsit1'), pg_temp.get('padc_event')),
  '23505', 'one bottle tally per student per event (no splitting or merging across events)');
select pg_temp.ok((select violation_count from public.violation_records where id = pg_temp.get('p1')::uuid) is null,
  'a reported (unverified) record has no count yet');

-- Review ----------------------------------------------------------------------------------
select pg_temp.act_as('padc_mayor');
select pg_temp.ok((public.review_violation(pg_temp.get('p1')::uuid, 'verified')).violation_count = 2,
  'PADC: 25 bottles verified = 2 violations');
select pg_temp.fails(format('select public.assess_penalty(%L, %L)', pg_temp.get('padc_policy'), pg_temp.u('bsit1')),
  'PENALTY_NOT_CONFIGURED', 'PADC penalty cannot be assessed until confirmed');
select pg_temp.fails(format('select public.review_violation(%L, ''verified'')', pg_temp.get('s1')),
  'FORBIDDEN', 'PADC cannot verify SSG violations');

select pg_temp.act_as('ssg_governor');
select public.review_violation(pg_temp.get('s1')::uuid, 'verified');
select public.review_violation(pg_temp.get('s2')::uuid, 'verified');
select public.review_violation(pg_temp.get('s3')::uuid, 'verified');
select pg_temp.fails(format('select public.review_violation(%L, ''rejected'')', pg_temp.get('s4')),
  'REASON_REQUIRED', 'rejecting a violation needs a reason');

-- Disputes: a disputed record does not count ---------------------------------------------------
select pg_temp.act_as('bsit2');
select pg_temp.put('d1', (public.file_violation_dispute(pg_temp.get('s3')::uuid, 'I was at the clinic with a note.')).id::text);
select pg_temp.fails(format('select public.decide_violation_dispute(%L, ''upheld'', ''ok'')', pg_temp.get('d1')),
  'FORBIDDEN', 'a student cannot decide their own dispute');
select pg_temp.act_as('ssg_governor');
select pg_temp.put('a1', (public.assess_penalty(pg_temp.get('ssg_policy')::uuid, pg_temp.u('bsit2'))).id::text);
select pg_temp.ok((select violation_count = 2 and required_hours = 2 and required_amount = 120
                     from public.penalty_assessments where id = pg_temp.get('a1')::uuid),
  'assessment counts only verified records (disputed one excluded): 2 -> 2h / PHP120');
select public.decide_violation_dispute(pg_temp.get('d1')::uuid, 'denied', 'Clinic note not on file');
select pg_temp.put('a2', (public.assess_penalty(pg_temp.get('ssg_policy')::uuid, pg_temp.u('bsit2'))).id::text);
select pg_temp.as_owner();
select pg_temp.ok((select status from public.penalty_assessments where id = pg_temp.get('a1')::uuid) = 'superseded'
                  and (select violation_count = 3 and required_hours = 3 and required_amount = 180
                         from public.penalty_assessments where id = pg_temp.get('a2')::uuid),
  'denied dispute: record counts again; open assessment superseded by 3 -> 3h / PHP180');
select pg_temp.ok((select (policy_snapshot ->> 'amount_per_violation')::numeric = 60
                          and policy_snapshot ->> 'version_number' = '1'
                     from public.penalty_assessments where id = pg_temp.get('a2')::uuid),
  'assessment stores a snapshot of the policy version it used');

-- Community service resolution ------------------------------------------------------------------
select pg_temp.act_as('bsit2');
select pg_temp.put('res', (public.select_penalty_resolution(pg_temp.get('a2')::uuid, 'community_service')).id::text);
select pg_temp.put('cs1', (public.submit_community_service(pg_temp.get('res')::uuid, current_date, 2, 'Campus clean-up')).id::text);
select pg_temp.act_as('padc_mayor');
select pg_temp.fails(format('select public.verify_community_service(%L, ''verified'')', pg_temp.get('cs1')),
  'FORBIDDEN', 'PADC cannot verify SSG community service');
select pg_temp.act_as('ssg_governor');
select pg_temp.ok((public.verify_community_service(pg_temp.get('cs1')::uuid, 'verified')).status = 'open',
  '2 of 3 required hours: penalty stays open');
select pg_temp.act_as('bsit2');
select pg_temp.put('cs2', (public.submit_community_service(pg_temp.get('res')::uuid, current_date, 1, 'Library shelving')).id::text);
select pg_temp.act_as('ssg_governor');
select pg_temp.ok((public.verify_community_service(pg_temp.get('cs2')::uuid, 'verified')).status = 'resolved',
  '3 of 3 hours verified by SSG: penalty resolved');

-- Historical policy versions ---------------------------------------------------------------------
select pg_temp.as_owner();
select pg_temp.fails(format('update public.violation_policy_versions set amount_per_violation = 80 where id = %L',
                            pg_temp.get('ssg_v1')),
  'POLICY_VERSION_IMMUTABLE', 'an active policy version cannot be edited');
update public.violation_policy_versions set status = 'retired' where id = pg_temp.get('ssg_v1')::uuid;
insert into public.violation_policy_versions
  (policy_id, version_number, academic_year_id, calculation_type, hours_per_violation, amount_per_violation,
   allowed_resolutions, penalty_confirmed, status)
values (pg_temp.get('ssg_policy')::uuid, 2, private.current_academic_year_id(), 'per_violation', 1, 80,
        array['community_service', 'payment'], true, 'active');
select pg_temp.ok((select required_amount = 180 and (policy_snapshot ->> 'amount_per_violation')::numeric = 60
                     from public.penalty_assessments where id = pg_temp.get('a2')::uuid),
  'a new policy version does not change historical assessments');
select pg_temp.fails(format('update public.penalty_assessments set required_amount = 0 where id = %L', pg_temp.get('a2')),
  'ASSESSMENT_IMMUTABLE', 'assessment amounts cannot be edited');

-- Payment resolution ------------------------------------------------------------------------------
-- bsit1: one SSG violation, assessed under version 2 (PHP 80)
select pg_temp.act_as('ssg_governor');
select public.review_violation(pg_temp.get('s4')::uuid, 'verified');
select pg_temp.put('a3', (public.assess_penalty(pg_temp.get('ssg_policy')::uuid, pg_temp.u('bsit1'))).id::text);
select pg_temp.act_as('bsit1');
select public.select_penalty_resolution(pg_temp.get('a3')::uuid, 'payment');
select pg_temp.fails(format('select public.create_penalty_payment(%L, ''gcash'', ''key-00000001'')', pg_temp.get('a3')),
  'PROVIDER_NOT_AVAILABLE', 'no provider can be used until its integration is activated');

select pg_temp.as_owner();
update public.system_settings set value = '["gcash"]' where key = 'payments.enabled_providers';
select pg_temp.act_as('bsit1');
select pg_temp.put('pay', (public.create_penalty_payment(pg_temp.get('a3')::uuid, 'gcash', 'key-00000001')).id::text);
select pg_temp.ok((public.create_penalty_payment(pg_temp.get('a3')::uuid, 'gcash', 'key-00000001')).id = pg_temp.get('pay')::uuid,
  'create payment is idempotent for the same key');
select pg_temp.fails(format('select public.create_penalty_payment(%L, ''maya'', ''key-00000001'')', pg_temp.get('a3')),
  'IDEMPOTENCY_CONFLICT', 'an idempotency key cannot be reused for a different payment');
select pg_temp.fails(format('select public.create_penalty_payment(%L, ''gcash'', ''key-00000002'')', pg_temp.get('a3')),
  'PAYMENT_IN_PROGRESS', 'only one live payment per penalty');
select pg_temp.ok((select amount = 80 from public.penalty_payments where id = pg_temp.get('pay')::uuid),
  'payment amount comes from the assessment (server side)');

select pg_temp.act_as('ssg_treasurer');
select pg_temp.fails(format('select public.verify_penalty_payment(%L, ''verified'')', pg_temp.get('pay')),
  'PAYMENT_NOT_SETTLED', 'an unpaid payment cannot be verified (no screenshot-based verification)');

select pg_temp.act_as_service();
select public.attach_payment_checkout(pg_temp.get('pay')::uuid, 'gcash-txn-1', 'https://example.invalid/checkout', now() + interval '30 minutes');
select pg_temp.put('ref', (select reference from public.penalty_payments where id = pg_temp.get('pay')::uuid));
select pg_temp.ok((public.process_payment_webhook('gcash', 'evt-1', 'payment.paid', false, '{}', pg_temp.get('ref'),
                                                  'gcash-txn-1', 'paid', 80)) ->> 'result' = 'ignored',
  'webhook with an invalid signature is ignored');
select pg_temp.ok((public.process_payment_webhook('gcash', 'evt-2', 'payment.paid', true, '{}', pg_temp.get('ref'),
                                                  'gcash-txn-1', 'paid', 50)) ->> 'reason' = 'amount_mismatch',
  'webhook with the wrong amount is rejected');
select pg_temp.ok((select status from public.penalty_payments where id = pg_temp.get('pay')::uuid) = 'pending',
  'payment is still pending after invalid webhooks');
select pg_temp.ok((public.process_payment_webhook('gcash', 'evt-3', 'payment.paid', true, '{}', pg_temp.get('ref'),
                                                  'gcash-txn-1', 'paid', 80)) ->> 'result' = 'processed',
  'valid signed webhook marks the payment paid');
select pg_temp.ok((public.process_payment_webhook('gcash', 'evt-3', 'payment.paid', true, '{}', pg_temp.get('ref'),
                                                  'gcash-txn-1', 'paid', 80)) ->> 'result' = 'duplicate',
  'replayed webhook is detected (idempotent)');
select pg_temp.as_owner();
select pg_temp.ok((select status from public.penalty_assessments where id = pg_temp.get('a3')::uuid) = 'pending_verification',
  'paid is not resolved: the organization must still verify');

select pg_temp.act_as('padc_treasurer');
select pg_temp.fails(format('select public.verify_penalty_payment(%L, ''verified'')', pg_temp.get('pay')),
  'FORBIDDEN', 'PADC cannot verify an SSG payment');
select pg_temp.act_as('bsit1');
select pg_temp.fails(format('select public.verify_penalty_payment(%L, ''verified'')', pg_temp.get('pay')),
  'FORBIDDEN', 'a student cannot verify their own payment');
select pg_temp.act_as('ssg_treasurer');
select public.verify_penalty_payment(pg_temp.get('pay')::uuid, 'verified');
select pg_temp.ok((public.record_payment_reconciliation(pg_temp.get('pay')::uuid, 'settlement_report', 'gcash-txn-1', 80, 'paid')).result = 'matched',
  'reconciliation matches the provider record');
select pg_temp.as_owner();
select pg_temp.ok((select status from public.penalty_assessments where id = pg_temp.get('a3')::uuid) = 'resolved',
  'SSG verified the payment: penalty resolved');
select pg_temp.fails(format('update public.penalty_payments set verified_by = student_id where id = %L', pg_temp.get('pay')),
  '23514', 'database constraint blocks self-verified payments even for direct writes');

select pg_temp.act_as('cashier');
select pg_temp.ok((select count(*) from public.penalty_payments) = 1, 'cashier can see payments');
select pg_temp.ok((select count(*) from public.violation_records) = 0, 'cashier cannot see violations');

select pg_temp.summary('050_violations_penalties_payments');
rollback;
