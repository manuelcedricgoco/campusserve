-- =============================================================================
-- CampusServe 003: organization receipts and batch remittance
--
-- Rules enforced here:
--   * Only a VERIFIED receipt_record satisfies a receipt obligation.
--   * A batch total never marks anyone paid. Each batch item is verified
--     individually by the organization; only then is a receipt issued.
--   * The student can never verify their own receipt or allocation.
--   * Who an obligation applies to (all students, department members, club
--     members) is configuration, marked unconfirmed until confirmed.
-- =============================================================================

create table public.receipt_obligations (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete cascade,
  academic_year_id         uuid not null references public.academic_years (id),
  code                     text not null check (code ~ '^[A-Z0-9_]+$'),
  name                     text not null,
  amount                   numeric(10, 2) not null check (amount > 0),
  applicability            text not null check (applicability in
                             ('all_students', 'department_members', 'club_members')),
  applicability_confirmed  boolean not null default false,
  is_active                boolean not null default true,
  created_by               uuid references public.profiles (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (organization_id, academic_year_id, code)
);
create index receipt_obligations_ay_idx on public.receipt_obligations (academic_year_id) where is_active;

create sequence public.receipt_number_seq;
create sequence public.remittance_batch_number_seq;

create table public.remittance_batches (
  id                 uuid primary key default gen_random_uuid(),
  batch_number       text not null unique
                       default ('RB-' || lpad(nextval('public.remittance_batch_number_seq')::text, 7, '0')),
  obligation_id      uuid not null references public.receipt_obligations (id),
  organization_id    uuid not null references public.organizations (id),
  academic_year_id   uuid not null references public.academic_years (id),
  class_officer_id   uuid not null references public.profiles (id),
  program_id         uuid references public.programs (id),
  section            text,
  declared_total     numeric(12, 2) not null check (declared_total >= 0),
  items_total        numeric(12, 2) not null default 0,
  received_total     numeric(12, 2) check (received_total >= 0),
  status             text not null default 'draft'
                       check (status in ('draft', 'submitted', 'under_review', 'completed', 'returned')),
  submitted_at       timestamptz,
  review_started_at  timestamptz,
  reviewed_by        uuid references public.profiles (id),
  completed_at       timestamptz,
  return_reason      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index remittance_batches_org_idx on public.remittance_batches (organization_id, status);
create index remittance_batches_officer_idx on public.remittance_batches (class_officer_id);

create table public.remittance_batch_items (
  id                 uuid primary key default gen_random_uuid(),
  batch_id           uuid not null references public.remittance_batches (id) on delete cascade,
  student_id         uuid not null references public.students (profile_id),
  amount             numeric(10, 2) not null check (amount > 0),
  status             text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  verified_by        uuid references public.profiles (id),
  verified_at        timestamptz,
  rejection_reason   text,
  receipt_record_id  uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (batch_id, student_id),
  constraint batch_items_not_self_verified_chk check (verified_by is null or verified_by <> student_id),
  constraint batch_items_rejection_reason_chk check (status <> 'rejected' or rejection_reason is not null)
);
create index remittance_batch_items_student_idx on public.remittance_batch_items (student_id);

create table public.receipt_records (
  id                uuid primary key default gen_random_uuid(),
  receipt_number    text not null unique
                      default ('OR-' || lpad(nextval('public.receipt_number_seq')::text, 8, '0')),
  obligation_id     uuid not null references public.receipt_obligations (id),
  organization_id   uuid not null references public.organizations (id),
  academic_year_id  uuid not null references public.academic_years (id),
  student_id        uuid not null references public.students (profile_id),
  amount            numeric(10, 2) not null check (amount > 0),
  source            text not null check (source in ('individual', 'batch')),
  batch_item_id     uuid unique references public.remittance_batch_items (id),
  status            text not null default 'pending_verification'
                      check (status in ('pending_verification', 'verified', 'rejected', 'void')),
  recorded_by       uuid not null references public.profiles (id),
  recorded_at       timestamptz not null default now(),
  verified_by       uuid references public.profiles (id),
  verified_at       timestamptz,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint receipt_records_source_chk check ((source = 'batch') = (batch_item_id is not null)),
  constraint receipt_records_not_self_verified_chk check (verified_by is null or verified_by <> student_id),
  constraint receipt_records_verified_fields_chk check (
    status <> 'verified' or (verified_by is not null and verified_at is not null))
);
-- At most one live (pending or verified) receipt per obligation and student.
create unique index receipt_records_one_live_idx
  on public.receipt_records (obligation_id, student_id)
  where status in ('pending_verification', 'verified');
create index receipt_records_student_idx on public.receipt_records (student_id, academic_year_id);
create index receipt_records_org_idx on public.receipt_records (organization_id, status);

alter table public.remittance_batch_items
  add constraint remittance_batch_items_receipt_fk
  foreign key (receipt_record_id) references public.receipt_records (id);

create table public.receipt_verifications (
  id                 uuid primary key default gen_random_uuid(),
  receipt_record_id  uuid not null references public.receipt_records (id) on delete cascade,
  verifier_id        uuid not null references public.profiles (id),
  decision           text not null check (decision in ('verified', 'rejected', 'voided')),
  notes              text,
  created_at         timestamptz not null default now()
);
create index receipt_verifications_receipt_idx on public.receipt_verifications (receipt_record_id);

-- Keep items_total in step with the batch items.
create or replace function private.refresh_batch_items_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch uuid := coalesce(new.batch_id, old.batch_id);
begin
  update public.remittance_batches b
     set items_total = coalesce((select sum(i.amount) from public.remittance_batch_items i
                                 where i.batch_id = v_batch), 0)
   where b.id = v_batch;
  return null;
end;
$$;
create trigger remittance_batch_items_total after insert or update of amount or delete
  on public.remittance_batch_items
  for each row execute function private.refresh_batch_items_total();

-- -----------------------------------------------------------------------------
-- Does an obligation apply to a student?
-- -----------------------------------------------------------------------------
create or replace function private.obligation_applies(p_obligation_id uuid, p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.receipt_obligations ob
    join public.students st on st.profile_id = p_student_id
    left join public.programs prg on prg.id = st.program_id
    where ob.id = p_obligation_id
      and ob.is_active
      and (
        ob.applicability = 'all_students'
        or (ob.applicability = 'department_members'
            and prg.organization_mapping_status = 'confirmed'
            and prg.department_organization_id = ob.organization_id)
        or (ob.applicability = 'club_members'
            and exists (select 1 from public.organization_members m
                        where m.organization_id = ob.organization_id
                          and m.student_id = p_student_id
                          and m.academic_year_id = ob.academic_year_id
                          and m.status = 'active'))));
$$;

-- -----------------------------------------------------------------------------
-- Individual remittance
-- -----------------------------------------------------------------------------
create or replace function public.record_individual_receipt(
  p_obligation_id uuid, p_student_id uuid, p_amount numeric, p_notes text default null)
returns public.receipt_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_ob public.receipt_obligations;
  v_rec public.receipt_records;
begin
  select * into v_ob from public.receipt_obligations where id = p_obligation_id and is_active;
  if not found then
    perform private.fail('OBLIGATION_NOT_FOUND', 'The receipt obligation does not exist or is inactive.');
  end if;
  if not private.has_org_permission(v_ob.organization_id, 'receipts.record') then
    perform private.fail('FORBIDDEN', 'You cannot record receipts for this organization.', '42501');
  end if;
  if not private.obligation_applies(p_obligation_id, p_student_id) then
    perform private.fail('OBLIGATION_NOT_APPLICABLE', 'This obligation does not apply to the student.');
  end if;
  if exists (select 1 from public.receipt_records r
             where r.obligation_id = p_obligation_id and r.student_id = p_student_id
               and r.status in ('pending_verification', 'verified')) then
    perform private.fail('RECEIPT_ALREADY_EXISTS', 'The student already has a pending or verified receipt.');
  end if;

  insert into public.receipt_records
    (obligation_id, organization_id, academic_year_id, student_id, amount, source, recorded_by, notes)
  values
    (v_ob.id, v_ob.organization_id, v_ob.academic_year_id, p_student_id, p_amount, 'individual', v_actor, p_notes)
  returning * into v_rec;
  return v_rec;
end;
$$;

create or replace function public.verify_receipt_record(
  p_receipt_id uuid, p_decision text, p_notes text default null)
returns public.receipt_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_rec public.receipt_records;
  v_ob public.receipt_obligations;
begin
  if p_decision not in ('verified', 'rejected', 'voided') then
    perform private.fail('INVALID_DECISION', 'Decision must be verified, rejected or voided.');
  end if;
  select * into v_rec from public.receipt_records where id = p_receipt_id for update;
  if not found then
    perform private.fail('RECEIPT_NOT_FOUND', 'Receipt not found.');
  end if;
  if not private.has_org_permission(v_rec.organization_id, 'receipts.verify') then
    perform private.fail('FORBIDDEN', 'You cannot verify receipts for this organization.', '42501');
  end if;
  if v_rec.student_id = v_actor then
    perform private.fail('SELF_VERIFICATION', 'You cannot verify your own receipt.', '42501');
  end if;

  if p_decision = 'voided' then
    if v_rec.status <> 'verified' then
      perform private.fail('INVALID_STATE', 'Only a verified receipt can be voided.');
    end if;
    if p_notes is null or length(trim(p_notes)) = 0 then
      perform private.fail('REASON_REQUIRED', 'A reason is required to void a receipt.');
    end if;
    update public.receipt_records set status = 'void', notes = p_notes
     where id = p_receipt_id returning * into v_rec;
  else
    if v_rec.status <> 'pending_verification' then
      perform private.fail('INVALID_STATE', 'Only a pending receipt can be verified or rejected.');
    end if;
    select * into v_ob from public.receipt_obligations where id = v_rec.obligation_id;
    if p_decision = 'verified' and v_rec.amount <> v_ob.amount then
      perform private.fail('AMOUNT_MISMATCH',
        format('Receipt amount %s does not equal the obligation amount %s.', v_rec.amount, v_ob.amount));
    end if;
    update public.receipt_records
       set status = p_decision,
           verified_by = case when p_decision = 'verified' then v_actor end,
           verified_at = case when p_decision = 'verified' then now() end,
           notes = coalesce(p_notes, notes)
     where id = p_receipt_id returning * into v_rec;
  end if;

  insert into public.receipt_verifications (receipt_record_id, verifier_id, decision, notes)
  values (p_receipt_id, v_actor, p_decision, p_notes);
  if p_decision = 'verified' then
    perform private.notify(v_rec.student_id, 'receipt', 'Receipt verified',
      format('Receipt %s has been verified.', v_rec.receipt_number));
  end if;
  return v_rec;
end;
$$;

-- -----------------------------------------------------------------------------
-- Batch remittance
-- -----------------------------------------------------------------------------
create or replace function public.create_remittance_batch(
  p_obligation_id uuid, p_declared_total numeric, p_program_id uuid default null, p_section text default null)
returns public.remittance_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_ob public.receipt_obligations;
  v_batch public.remittance_batches;
begin
  select * into v_ob from public.receipt_obligations where id = p_obligation_id and is_active;
  if not found then
    perform private.fail('OBLIGATION_NOT_FOUND', 'The receipt obligation does not exist or is inactive.');
  end if;
  if not private.has_org_permission(v_ob.organization_id, 'remittance.create') then
    perform private.fail('FORBIDDEN', 'You are not a class officer for this organization.', '42501');
  end if;
  insert into public.remittance_batches
    (obligation_id, organization_id, academic_year_id, class_officer_id, program_id, section, declared_total)
  values
    (v_ob.id, v_ob.organization_id, v_ob.academic_year_id, v_actor, p_program_id, p_section, p_declared_total)
  returning * into v_batch;
  return v_batch;
end;
$$;

create or replace function public.upsert_remittance_batch_item(
  p_batch_id uuid, p_student_id uuid, p_amount numeric)
returns public.remittance_batch_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_batch public.remittance_batches;
  v_item public.remittance_batch_items;
  v_student public.students;
begin
  select * into v_batch from public.remittance_batches where id = p_batch_id for update;
  if not found or v_batch.class_officer_id <> v_actor then
    perform private.fail('BATCH_NOT_FOUND', 'Batch not found.');
  end if;
  if v_batch.status not in ('draft', 'returned') then
    perform private.fail('INVALID_STATE', 'Items can only be changed while the batch is a draft or returned.');
  end if;
  if not private.obligation_applies(v_batch.obligation_id, p_student_id) then
    perform private.fail('OBLIGATION_NOT_APPLICABLE', 'This obligation does not apply to the student.');
  end if;
  select * into v_student from public.students where profile_id = p_student_id;
  if v_batch.program_id is not null and v_student.program_id <> v_batch.program_id then
    perform private.fail('STUDENT_OUT_OF_SCOPE', 'The student is not in this batch''s program.');
  end if;
  if v_batch.section is not null and coalesce(v_student.section, '') <> v_batch.section then
    perform private.fail('STUDENT_OUT_OF_SCOPE', 'The student is not in this batch''s section.');
  end if;
  if exists (select 1 from public.receipt_records r
             where r.obligation_id = v_batch.obligation_id and r.student_id = p_student_id
               and r.status in ('pending_verification', 'verified')) then
    perform private.fail('RECEIPT_ALREADY_EXISTS', 'The student already has a pending or verified receipt.');
  end if;

  insert into public.remittance_batch_items (batch_id, student_id, amount)
  values (p_batch_id, p_student_id, p_amount)
  on conflict (batch_id, student_id) do update
    set amount = excluded.amount, status = 'pending', rejection_reason = null
    where public.remittance_batch_items.status <> 'verified'
  returning * into v_item;
  if v_item.id is null then
    perform private.fail('INVALID_STATE', 'A verified item cannot be changed.');
  end if;
  return v_item;
end;
$$;

create or replace function public.remove_remittance_batch_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_item public.remittance_batch_items;
  v_batch public.remittance_batches;
begin
  select * into v_item from public.remittance_batch_items where id = p_item_id;
  select * into v_batch from public.remittance_batches where id = v_item.batch_id for update;
  if v_item.id is null or v_batch.class_officer_id <> v_actor then
    perform private.fail('ITEM_NOT_FOUND', 'Batch item not found.');
  end if;
  if v_batch.status not in ('draft', 'returned') or v_item.status = 'verified' then
    perform private.fail('INVALID_STATE', 'This item can no longer be removed.');
  end if;
  delete from public.remittance_batch_items where id = p_item_id;
end;
$$;

create or replace function public.submit_remittance_batch(p_batch_id uuid)
returns public.remittance_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_batch public.remittance_batches;
begin
  select * into v_batch from public.remittance_batches where id = p_batch_id for update;
  if not found or v_batch.class_officer_id <> v_actor then
    perform private.fail('BATCH_NOT_FOUND', 'Batch not found.');
  end if;
  if v_batch.status not in ('draft', 'returned') then
    perform private.fail('INVALID_STATE', 'Only a draft or returned batch can be submitted.');
  end if;
  if not exists (select 1 from public.remittance_batch_items where batch_id = p_batch_id and status = 'pending') then
    perform private.fail('BATCH_EMPTY', 'Add at least one pending student before submitting.');
  end if;
  update public.remittance_batches
     set status = 'submitted', submitted_at = now(), return_reason = null
   where id = p_batch_id returning * into v_batch;
  perform private.write_audit('remittance_batch.submitted', 'remittance_batches', p_batch_id::text,
    jsonb_build_object('declared_total', v_batch.declared_total, 'items_total', v_batch.items_total));
  return v_batch;
end;
$$;

-- Treasurer counts the cash/transfer received for the whole batch. A mismatch
-- with the declared or itemized total is recorded; it never verifies anyone.
create or replace function public.begin_remittance_batch_review(p_batch_id uuid, p_received_total numeric)
returns public.remittance_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_batch public.remittance_batches;
begin
  select * into v_batch from public.remittance_batches where id = p_batch_id for update;
  if not found then
    perform private.fail('BATCH_NOT_FOUND', 'Batch not found.');
  end if;
  if not private.has_org_permission(v_batch.organization_id, 'remittance.review') then
    perform private.fail('FORBIDDEN', 'You cannot review batches for this organization.', '42501');
  end if;
  if v_batch.status <> 'submitted' then
    perform private.fail('INVALID_STATE', 'Only a submitted batch can be reviewed.');
  end if;
  if p_received_total is null or p_received_total < 0 then
    perform private.fail('INVALID_AMOUNT', 'Enter the total amount actually received.');
  end if;
  update public.remittance_batches
     set status = 'under_review', received_total = p_received_total,
         review_started_at = now(), reviewed_by = v_actor
   where id = p_batch_id returning * into v_batch;
  perform private.write_audit('remittance_batch.review_started', 'remittance_batches', p_batch_id::text,
    jsonb_build_object('declared_total', v_batch.declared_total, 'items_total', v_batch.items_total,
                       'received_total', p_received_total,
                       'totals_match', v_batch.items_total = p_received_total
                                       and v_batch.declared_total = p_received_total));
  return v_batch;
end;
$$;

-- Verify ONE student's allocation. Only this creates a (verified) receipt.
create or replace function public.verify_remittance_batch_item(
  p_item_id uuid, p_decision text, p_reason text default null)
returns public.remittance_batch_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_item public.remittance_batch_items;
  v_batch public.remittance_batches;
  v_ob public.receipt_obligations;
  v_receipt public.receipt_records;
begin
  if p_decision not in ('verified', 'rejected') then
    perform private.fail('INVALID_DECISION', 'Decision must be verified or rejected.');
  end if;
  select * into v_item from public.remittance_batch_items where id = p_item_id for update;
  if not found then
    perform private.fail('ITEM_NOT_FOUND', 'Batch item not found.');
  end if;
  select * into v_batch from public.remittance_batches where id = v_item.batch_id for update;
  if not (private.has_org_permission(v_batch.organization_id, 'remittance.review')
          and private.has_org_permission(v_batch.organization_id, 'receipts.verify')) then
    perform private.fail('FORBIDDEN', 'You cannot verify allocations for this organization.', '42501');
  end if;
  if v_item.student_id = v_actor then
    perform private.fail('SELF_VERIFICATION', 'You cannot verify your own allocation.', '42501');
  end if;
  if v_batch.status <> 'under_review' then
    perform private.fail('INVALID_STATE', 'Start the batch review before verifying allocations.');
  end if;
  if v_item.status <> 'pending' then
    perform private.fail('INVALID_STATE', 'This allocation has already been decided.');
  end if;

  if p_decision = 'rejected' then
    if p_reason is null or length(trim(p_reason)) = 0 then
      perform private.fail('REASON_REQUIRED', 'A reason is required to reject an allocation.');
    end if;
    update public.remittance_batch_items
       set status = 'rejected', rejection_reason = p_reason, verified_by = v_actor, verified_at = now()
     where id = p_item_id returning * into v_item;
    return v_item;
  end if;

  select * into v_ob from public.receipt_obligations where id = v_batch.obligation_id;
  if v_item.amount <> v_ob.amount then
    perform private.fail('AMOUNT_MISMATCH',
      format('Allocation %s does not equal the obligation amount %s.', v_item.amount, v_ob.amount));
  end if;
  if exists (select 1 from public.receipt_records r
             where r.obligation_id = v_ob.id and r.student_id = v_item.student_id
               and r.status in ('pending_verification', 'verified')) then
    perform private.fail('RECEIPT_ALREADY_EXISTS', 'The student already has a pending or verified receipt.');
  end if;

  insert into public.receipt_records
    (obligation_id, organization_id, academic_year_id, student_id, amount, source, batch_item_id,
     status, recorded_by, verified_by, verified_at)
  values
    (v_ob.id, v_ob.organization_id, v_ob.academic_year_id, v_item.student_id, v_item.amount, 'batch', v_item.id,
     'verified', v_batch.class_officer_id, v_actor, now())
  returning * into v_receipt;
  insert into public.receipt_verifications (receipt_record_id, verifier_id, decision, notes)
  values (v_receipt.id, v_actor, 'verified', format('Batch %s', v_batch.batch_number));

  update public.remittance_batch_items
     set status = 'verified', verified_by = v_actor, verified_at = now(), receipt_record_id = v_receipt.id
   where id = p_item_id returning * into v_item;
  perform private.notify(v_item.student_id, 'receipt', 'Receipt verified',
    format('Receipt %s has been verified.', v_receipt.receipt_number));
  return v_item;
end;
$$;

create or replace function public.finish_remittance_batch_review(
  p_batch_id uuid, p_outcome text, p_reason text default null)
returns public.remittance_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_batch public.remittance_batches;
begin
  select * into v_batch from public.remittance_batches where id = p_batch_id for update;
  if not found then
    perform private.fail('BATCH_NOT_FOUND', 'Batch not found.');
  end if;
  if not private.has_org_permission(v_batch.organization_id, 'remittance.review') then
    perform private.fail('FORBIDDEN', 'You cannot review batches for this organization.', '42501');
  end if;
  if v_batch.status not in ('submitted', 'under_review') then
    perform private.fail('INVALID_STATE', 'This batch is not under review.');
  end if;
  if p_outcome = 'completed' then
    if exists (select 1 from public.remittance_batch_items where batch_id = p_batch_id and status = 'pending') then
      perform private.fail('ITEMS_PENDING', 'Verify or reject every allocation before completing the batch.');
    end if;
    update public.remittance_batches set status = 'completed', completed_at = now()
     where id = p_batch_id returning * into v_batch;
  elsif p_outcome = 'returned' then
    if p_reason is null or length(trim(p_reason)) = 0 then
      perform private.fail('REASON_REQUIRED', 'A reason is required to return a batch.');
    end if;
    update public.remittance_batches set status = 'returned', return_reason = p_reason
     where id = p_batch_id returning * into v_batch;
    perform private.notify(v_batch.class_officer_id, 'remittance', 'Batch returned',
      format('Batch %s was returned: %s', v_batch.batch_number, p_reason));
  else
    perform private.fail('INVALID_DECISION', 'Outcome must be completed or returned.');
  end if;
  return v_batch;
end;
$$;
