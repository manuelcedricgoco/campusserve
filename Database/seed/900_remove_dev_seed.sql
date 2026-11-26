-- =============================================================================
-- Removes the CampusServe DEVELOPMENT seed sample accounts and sample-only rows.
-- Run before going to production. Review it first: it deletes data.
--
-- Kept on purpose (real configuration from the master specification):
--   organizations, programs and confirmed mappings, offices, the SSG policy,
--   the PADC count rule and the STANDARD clearance template.
-- Removed:
--   sample accounts (@campusserve.test) and everything they created,
--   DEV SAMPLE receipt obligations, sample events, sample services/slots.
-- Audit log rows are append-only and are intentionally kept.
-- =============================================================================
begin;

create temporary table dev_users on commit drop as
  select id from auth.users where email like '%@campusserve.test';

delete from public.clearance_requirement_status where student_clearance_id in
  (select id from public.student_clearances where student_id in (select id from dev_users));
delete from public.clearance_history where student_clearance_id in
  (select id from public.student_clearances where student_id in (select id from dev_users));
delete from public.clearance_approvals where student_clearance_id in
  (select id from public.student_clearances where student_id in (select id from dev_users));
delete from public.student_clearances where student_id in (select id from dev_users);
delete from public.payment_reconciliation_records where penalty_payment_id in
  (select id from public.penalty_payments where student_id in (select id from dev_users));
update public.payment_webhook_events set penalty_payment_id = null where penalty_payment_id in
  (select id from public.penalty_payments where student_id in (select id from dev_users));
delete from public.penalty_payments where student_id in (select id from dev_users);
delete from public.community_service_records where student_id in (select id from dev_users);
update public.violation_records set assessment_id = null where student_id in (select id from dev_users);
delete from public.penalty_resolutions where student_id in (select id from dev_users);
delete from public.penalty_assessments where student_id in (select id from dev_users);
delete from public.violation_records where student_id in (select id from dev_users);
delete from public.queue_tickets where student_id in (select id from dev_users);
delete from public.receipt_records where student_id in (select id from dev_users);
delete from public.remittance_batches where class_officer_id in (select id from dev_users);
delete from public.receipt_obligations where name like '%(DEV SAMPLE amount)%';
delete from public.organization_events where description = 'Sample event';
delete from public.queue_slots where service_id in
  (select id from public.services where description like '%(sample)%' or description = 'Sample service.');
delete from public.services where description like '%(sample)%' or description = 'Sample service.';
delete from auth.users where id in (select id from dev_users);

commit;
