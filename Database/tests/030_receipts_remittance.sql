-- Receipts and batch remittance tests.
begin;
\ir _helpers.sql

select pg_temp.as_owner();
select pg_temp.put('ssg_fee', (select ob.id from public.receipt_obligations ob join public.organizations o
                               on o.id = ob.organization_id where o.code = 'SSG')::text);
select pg_temp.put('padc_fee', (select ob.id from public.receipt_obligations ob join public.organizations o
                                on o.id = ob.organization_id where o.code = 'PADC')::text);
select pg_temp.put('eng_fee', (select ob.id from public.receipt_obligations ob join public.organizations o
                               on o.id = ob.organization_id where o.code = 'ENGLISH_CLUB')::text);
select pg_temp.put('bsit', (select id from public.programs where code = 'BSIT')::text);

-- Applicability -------------------------------------------------------------------
select pg_temp.ok(private.obligation_applies(pg_temp.get('ssg_fee')::uuid, pg_temp.u('beed')),
  'SSG obligation applies to all students');
select pg_temp.ok(private.obligation_applies(pg_temp.get('padc_fee')::uuid, pg_temp.u('bsit1'))
                  and not private.obligation_applies(pg_temp.get('padc_fee')::uuid, pg_temp.u('beed')),
  'department obligation applies only to students of the mapped program');
select pg_temp.ok(not exists (select 1 from public.receipt_obligations ob
                              where ob.applicability = 'department_members'
                                and private.obligation_applies(ob.id, pg_temp.u('cbam'))),
  'no department obligation applies while the CBAM mapping is unconfirmed');
select pg_temp.ok(private.obligation_applies(pg_temp.get('eng_fee')::uuid, pg_temp.u('bsit1'))
                  and not private.obligation_applies(pg_temp.get('eng_fee')::uuid, pg_temp.u('bsit2')),
  'club obligation applies to club members only');

-- Batch remittance --------------------------------------------------------------------
select pg_temp.act_as('class_officer');
select pg_temp.put('batch', (public.create_remittance_batch(pg_temp.get('ssg_fee')::uuid, 100,
                                                            pg_temp.get('bsit')::uuid, '3A')).id::text);
select pg_temp.put('item1', (public.upsert_remittance_batch_item(pg_temp.get('batch')::uuid, pg_temp.u('bsit1'), 50)).id::text);
select pg_temp.put('item2', (public.upsert_remittance_batch_item(pg_temp.get('batch')::uuid, pg_temp.u('bsit2'), 50)).id::text);
select pg_temp.fails(format('select public.upsert_remittance_batch_item(%L, %L, 50)', pg_temp.get('batch'), pg_temp.u('beed')),
  'STUDENT_OUT_OF_SCOPE', 'class officer cannot add a student outside their program/section');
select pg_temp.ok((select items_total from public.remittance_batches where id = pg_temp.get('batch')::uuid) = 100,
  'batch items total is maintained');
select pg_temp.fails(format('select public.begin_remittance_batch_review(%L, 100)', pg_temp.get('batch')),
  'FORBIDDEN', 'class officer cannot review their own batch');
select public.submit_remittance_batch(pg_temp.get('batch')::uuid);

select pg_temp.act_as('padc_treasurer');
select pg_temp.fails(format('select public.begin_remittance_batch_review(%L, 100)', pg_temp.get('batch')),
  'FORBIDDEN', 'another organization''s treasurer cannot review the batch');

select pg_temp.act_as('ssg_treasurer');
select public.begin_remittance_batch_review(pg_temp.get('batch')::uuid, 100);
select pg_temp.as_owner();
select pg_temp.ok(not exists (select 1 from public.receipt_records
                              where obligation_id = pg_temp.get('ssg_fee')::uuid and status = 'verified'),
  'a submitted and counted batch total marks NO student as paid');

select pg_temp.act_as('ssg_treasurer');
select public.verify_remittance_batch_item(pg_temp.get('item1')::uuid, 'verified');
select pg_temp.fails(format('select public.verify_remittance_batch_item(%L, ''rejected'')', pg_temp.get('item2')),
  'REASON_REQUIRED', 'rejecting an allocation needs a reason');
select public.verify_remittance_batch_item(pg_temp.get('item2')::uuid, 'rejected', 'Cash not received');
select public.finish_remittance_batch_review(pg_temp.get('batch')::uuid, 'completed');

select pg_temp.as_owner();
select pg_temp.ok((select count(*) from public.receipt_records
                   where obligation_id = pg_temp.get('ssg_fee')::uuid and status = 'verified'
                     and student_id = pg_temp.u('bsit1') and source = 'batch') = 1,
  'only the individually verified allocation produced a verified receipt');
select pg_temp.ok(not exists (select 1 from public.receipt_records
                              where obligation_id = pg_temp.get('ssg_fee')::uuid and student_id = pg_temp.u('bsit2')),
  'the rejected allocation produced no receipt');

select pg_temp.act_as('bsit1');
select pg_temp.ok((select count(*) from public.receipt_records) = 1, 'student sees their own receipt');
select pg_temp.act_as('bsit2');
select pg_temp.ok((select count(*) from public.receipt_records) = 0, 'student cannot see other students'' receipts');

-- Individual remittance ---------------------------------------------------------------
select pg_temp.act_as('ssg_treasurer');
select pg_temp.put('r2', (public.record_individual_receipt(pg_temp.get('ssg_fee')::uuid, pg_temp.u('bsit2'), 50)).id::text);
select pg_temp.fails(format('select public.record_individual_receipt(%L, %L, 50)', pg_temp.get('ssg_fee'), pg_temp.u('bsit2')),
  'RECEIPT_ALREADY_EXISTS', 'duplicate live receipts are refused');
select public.verify_receipt_record(pg_temp.get('r2')::uuid, 'verified');
select pg_temp.put('r3', (public.record_individual_receipt(pg_temp.get('ssg_fee')::uuid, pg_temp.u('beed'), 40)).id::text);
select pg_temp.fails(format('select public.verify_receipt_record(%L, ''verified'')', pg_temp.get('r3')),
  'AMOUNT_MISMATCH', 'an underpayment cannot be verified');
select pg_temp.put('own', (public.record_individual_receipt(pg_temp.get('ssg_fee')::uuid, pg_temp.u('ssg_treasurer'), 50)).id::text);
select pg_temp.fails(format('select public.verify_receipt_record(%L, ''verified'')', pg_temp.get('own')),
  'SELF_VERIFICATION', 'a treasurer cannot verify their own receipt');
select pg_temp.fails(format('select public.record_individual_receipt(%L, %L, 50)', pg_temp.get('padc_fee'), pg_temp.u('bsit1')),
  'FORBIDDEN', 'SSG treasurer cannot record PADC receipts');

select pg_temp.act_as('bsit2');
select pg_temp.fails(format('select public.verify_receipt_record(%L, ''verified'')', pg_temp.get('r3')),
  'FORBIDDEN', 'a student cannot verify receipts');

select pg_temp.as_owner();
select pg_temp.fails(format('update public.receipt_records set verified_by = student_id, status = ''verified'', '
                            'verified_at = now() where id = %L', pg_temp.get('own')),
  '23514', 'database constraint blocks self-verified receipts even for direct writes');

select pg_temp.summary('030_receipts_remittance');
rollback;
