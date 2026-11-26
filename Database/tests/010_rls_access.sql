-- RLS and grant tests: who can read and write what.
begin;
\ir _helpers.sql

-- anon -----------------------------------------------------------------------
select pg_temp.act_as_anon();
select pg_temp.fails('select count(*) from public.profiles', '42501', 'anon cannot read profiles');
select pg_temp.fails('select count(*) from public.organizations', '42501', 'anon cannot read reference data');
select pg_temp.fails('select public.reserve_queue_slot(gen_random_uuid())', '42501', 'anon cannot call workflow functions');

-- students -------------------------------------------------------------------
select pg_temp.act_as('bsit1');
select pg_temp.ok((select count(*) from public.students) = 1, 'student sees only their own student record');
select pg_temp.ok((select count(*) from public.profiles) = 1, 'student sees only their own profile');
select pg_temp.ok((select count(*) from public.user_roles) = 1, 'student sees only their own roles');
select pg_temp.ok((select count(*) from public.organizations) = 10, 'student can read organizations');
select pg_temp.ok((select count(*) from public.audit_logs) = 0, 'student cannot read the audit log');
select pg_temp.fails(
  format($q$insert into public.receipt_records (obligation_id, organization_id, academic_year_id, student_id,
            amount, source, status, recorded_by, verified_by, verified_at)
          select id, organization_id, academic_year_id, %L, amount, 'individual', 'verified', %L, %L, now()
            from public.receipt_obligations limit 1$q$,
         pg_temp.u('bsit1'), pg_temp.u('bsit1'), pg_temp.u('ssg_treasurer')),
  '42501', 'student cannot insert a receipt directly');
select pg_temp.fails('update public.students set year_level = 4', '42501', 'student cannot update records directly');
select pg_temp.fails('delete from public.violation_records', '42501', 'student cannot delete records');
select pg_temp.fails(
  'select public.attach_payment_checkout(gen_random_uuid(), ''x'', ''x'', now())', '42501',
  'student cannot call service-role payment functions');
select pg_temp.fails(
  $q$select public.process_payment_webhook('gcash','e1','paid',true,'{}','CSP-1','t1','paid',60)$q$, '42501',
  'student cannot inject a payment webhook');

-- notifications: own only, read_at only
select pg_temp.as_owner();
insert into public.notifications (user_id, category, title) values
  (pg_temp.u('bsit1'), 'test', 'mine'), (pg_temp.u('bsit2'), 'test', 'theirs');
select pg_temp.act_as('bsit1');
select pg_temp.ok((select count(*) from public.notifications where category = 'test') = 1,
  'student sees only their own notifications');
update public.notifications set read_at = now() where category = 'test';
select pg_temp.as_owner();
select pg_temp.ok((select count(*) from public.notifications where category = 'test' and read_at is not null) = 1,
  'student can mark only their own notification as read');
select pg_temp.act_as('bsit1');
select pg_temp.fails('update public.notifications set title = ''x''', '42501',
  'student cannot change notification content');

-- organization officers: scoped -------------------------------------------------
select pg_temp.act_as('ssg_governor');
select pg_temp.ok((select count(*) from public.students) = 10, 'SSG governor sees every student (SSG serves all)');
select pg_temp.act_as('padc_mayor');
select pg_temp.ok((select count(*) from public.students s join public.programs p on p.id = s.program_id
                   where p.code <> 'BSIT') = 0,
  'PADC mayor sees no students outside BSIT');
select pg_temp.ok((select count(*) from public.students) = 6, 'PADC mayor sees the 6 BSIT students');
select pg_temp.act_as('english_pres');
select pg_temp.ok((select count(*) from public.students) = 2,
  'club president sees own record and club members only');
select pg_temp.act_as('class_officer');
select pg_temp.ok((select count(*) from public.students) = 1, 'class officer has no student-wide read access');

-- office staff, program head, cashier, admin -------------------------------------
select pg_temp.act_as('guidance');
select pg_temp.ok((select count(*) from public.students) = 10, 'guidance staff can look up students');
select pg_temp.ok((select count(*) from public.audit_logs) = 0, 'office staff cannot read the audit log');
select pg_temp.act_as('program_head');
select pg_temp.ok((select count(*) from public.students) = 6, 'BSIT program head sees only BSIT students');
select pg_temp.act_as('cashier');
select pg_temp.ok((select count(*) from public.students) = 0, 'cashier has no access to student records');
select pg_temp.ok((select count(*) from public.payment_webhook_events) = 0
                  and not private.has_global_permission('payments.view_webhooks'),
  'cashier cannot read raw webhook events');
select pg_temp.ok(private.has_global_permission('payments.view_all'), 'cashier can view payments');
select pg_temp.act_as('admin');
select pg_temp.ok((select count(*) from public.students) = 10, 'administrator can read every student');
select pg_temp.ok((select count(*) from public.audit_logs) > 0, 'administrator can read the audit log');
select pg_temp.ok(not private.has_global_permission('clearance.approve'),
  'administrator holds no clearance approval permission');

-- deactivated accounts lose access ---------------------------------------------------
select pg_temp.as_owner();
update public.profiles set is_active = false where id = pg_temp.u('ssg_governor');
select pg_temp.act_as('ssg_governor');
select pg_temp.ok((select count(*) from public.students) = 0, 'inactive account sees no students');
select pg_temp.ok((select count(*) from public.organizations) = 0, 'inactive account sees no reference data');

-- audit log is append-only --------------------------------------------------------------
select pg_temp.as_owner();
select pg_temp.fails('update public.audit_logs set action = ''x''', 'AUDIT_LOG_IMMUTABLE', 'audit log cannot be updated');
select pg_temp.fails('delete from public.audit_logs', 'AUDIT_LOG_IMMUTABLE', 'audit log cannot be deleted');

-- every public table has RLS enabled -------------------------------------------------------
select pg_temp.ok(not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
  'RLS is enabled on every public table');

select pg_temp.summary('010_rls_access');
rollback;
