-- =============================================================================
-- CampusServe 005: violation management
--
--   * Each organization has its own policies. Nothing is shared across
--     organizations: SSG and PADC rules never apply to anyone else.
--   * A policy has immutable VERSIONS. Once a version leaves 'draft' its rule
--     cannot change; a new version is created instead, so history is kept.
--   * calculation_type:
--       per_violation       every verified record = 1 violation (SSG)
--       quantity_threshold  violations = floor(quantity / quantity_per_violation)
--                           per record (= per event); remainders are never
--                           carried to another event (PADC bottles: 10 per violation)
--   * penalty_confirmed = false means the penalty (hours / amount / options) is
--     not confirmed: violations can be recorded and counted, but no penalty can
--     be assessed until a confirmed version exists.
--   * Only VERIFIED records count. Reported, rejected, disputed and voided
--     records never count and never block clearance.
-- =============================================================================

create table public.organization_events (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years (id),
  name              text not null,
  event_date        date not null,
  description       text,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, name, event_date)
);

create table public.violation_policies (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  code             text not null check (code ~ '^[A-Z0-9_]+$'),
  name             text not null,
  description      text,
  is_active        boolean not null default true,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.violation_policy_versions (
  id                      uuid primary key default gen_random_uuid(),
  policy_id               uuid not null references public.violation_policies (id) on delete restrict,
  version_number          integer not null check (version_number > 0),
  academic_year_id        uuid not null references public.academic_years (id),
  calculation_type        text not null check (calculation_type in ('per_violation', 'quantity_threshold')),
  quantity_unit           text,
  quantity_per_violation  integer check (quantity_per_violation > 0),
  hours_per_violation     numeric(6, 2) check (hours_per_violation >= 0),
  amount_per_violation    numeric(10, 2) check (amount_per_violation >= 0),
  allowed_resolutions     text[] not null default '{}'
                            check (allowed_resolutions <@ array['community_service', 'payment']::text[]),
  penalty_confirmed       boolean not null default false,
  status                  text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  notes                   text,
  created_by              uuid references public.profiles (id) on delete set null,
  activated_at            timestamptz,
  retired_at              timestamptz,
  created_at              timestamptz not null default now(),
  unique (policy_id, version_number),
  constraint policy_versions_threshold_fields_chk check (
    calculation_type <> 'quantity_threshold'
    or (quantity_unit is not null and quantity_per_violation is not null)),
  constraint policy_versions_per_violation_fields_chk check (
    calculation_type <> 'per_violation'
    or (quantity_unit is null and quantity_per_violation is null)),
  constraint policy_versions_confirmed_has_options_chk check (
    not penalty_confirmed or cardinality(allowed_resolutions) > 0),
  constraint policy_versions_service_rate_chk check (
    not ('community_service' = any (allowed_resolutions)) or hours_per_violation is not null),
  constraint policy_versions_payment_rate_chk check (
    not ('payment' = any (allowed_resolutions)) or amount_per_violation is not null)
);
create unique index violation_policy_versions_one_active_idx
  on public.violation_policy_versions (policy_id, academic_year_id) where status = 'active';

-- Non-draft versions are immutable, apart from retiring an active version.
create or replace function private.protect_policy_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      perform private.fail('POLICY_VERSION_IMMUTABLE', 'Only draft policy versions can be deleted.');
    end if;
    return old;
  end if;
  if old.status = 'draft' then
    if new.status = 'active' then
      new.activated_at := coalesce(new.activated_at, now());
    end if;
    return new;
  end if;
  if old.status = 'active' and new.status = 'retired'
     and (to_jsonb(new) - array['status', 'retired_at'])
         = (to_jsonb(old) - array['status', 'retired_at']) then
    new.retired_at := coalesce(new.retired_at, now());
    return new;
  end if;
  perform private.fail('POLICY_VERSION_IMMUTABLE',
    'An active or retired policy version cannot be changed. Create a new version instead.');
  return null;
end;
$$;
create trigger violation_policy_versions_protect before update or delete on public.violation_policy_versions
  for each row execute function private.protect_policy_version();

create table public.violation_records (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id),
  policy_id          uuid not null references public.violation_policies (id),
  policy_version_id  uuid not null references public.violation_policy_versions (id),
  calculation_type   text not null check (calculation_type in ('per_violation', 'quantity_threshold')),
  event_id           uuid references public.organization_events (id),
  student_id         uuid not null references public.students (profile_id),
  academic_year_id   uuid not null references public.academic_years (id),
  reported_by        uuid not null references public.profiles (id),
  category           text,
  description        text not null check (length(trim(description)) > 0),
  quantity           integer check (quantity >= 0),
  violation_count    integer check (violation_count >= 0),
  occurred_on        date not null default current_date,
  status             text not null default 'reported'
                       check (status in ('reported', 'verified', 'rejected', 'disputed', 'voided')),
  reviewed_by        uuid references public.profiles (id),
  reviewed_at        timestamptz,
  assessment_id      uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint violation_records_not_self_reported_chk check (reported_by <> student_id),
  constraint violation_records_not_self_reviewed_chk check (reviewed_by is null or reviewed_by <> student_id),
  constraint violation_records_verified_count_chk check (status <> 'verified' or violation_count is not null),
  constraint violation_records_threshold_fields_chk check (
    calculation_type <> 'quantity_threshold' or (quantity is not null and event_id is not null))
);
-- Quantity-threshold tallies are per student per event: one live tally each,
-- so quantities cannot be split to avoid a threshold or merged across events.
create unique index violation_records_one_tally_per_event_idx
  on public.violation_records (policy_id, student_id, event_id)
  where calculation_type = 'quantity_threshold' and status not in ('rejected', 'voided');
create index violation_records_student_idx on public.violation_records (student_id, organization_id, academic_year_id);
create index violation_records_org_status_idx on public.violation_records (organization_id, status);
create index violation_records_assessment_idx on public.violation_records (assessment_id);

-- Evidence files live in the private 'violation-evidence' storage bucket.
create table public.violation_evidence (
  id                   uuid primary key default gen_random_uuid(),
  violation_record_id  uuid not null references public.violation_records (id) on delete cascade,
  storage_path         text not null unique,
  file_name            text not null,
  mime_type            text not null check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
  size_bytes           integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  uploaded_by          uuid not null references public.profiles (id),
  created_at           timestamptz not null default now()
);
create index violation_evidence_record_idx on public.violation_evidence (violation_record_id);

create table public.violation_reviews (
  id                   uuid primary key default gen_random_uuid(),
  violation_record_id  uuid not null references public.violation_records (id) on delete cascade,
  reviewer_id          uuid not null references public.profiles (id),
  decision             text not null check (decision in ('verified', 'rejected', 'dispute_upheld', 'dispute_denied')),
  computed_violation_count integer,
  notes                text,
  created_at           timestamptz not null default now()
);
create index violation_reviews_record_idx on public.violation_reviews (violation_record_id);

create table public.violation_disputes (
  id                    uuid primary key default gen_random_uuid(),
  violation_record_id   uuid not null references public.violation_records (id) on delete cascade,
  student_id            uuid not null references public.students (profile_id),
  reason                text not null check (length(trim(reason)) >= 10),
  record_status_before  text not null check (record_status_before in ('reported', 'verified')),
  status                text not null default 'open' check (status in ('open', 'upheld', 'denied')),
  decided_by            uuid references public.profiles (id),
  decided_at            timestamptz,
  decision_notes        text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint violation_disputes_not_self_decided_chk check (decided_by is null or decided_by <> student_id)
);
create unique index violation_disputes_one_open_idx
  on public.violation_disputes (violation_record_id) where status = 'open';

-- -----------------------------------------------------------------------------
-- Calculation (pure functions, also used by the backend through RPC for previews)
-- -----------------------------------------------------------------------------
create or replace function private.compute_violation_count(
  p_calculation_type text, p_quantity_per_violation integer, p_quantity integer)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_calculation_type = 'per_violation' then
    return 1;
  elsif p_calculation_type = 'quantity_threshold' then
    if p_quantity is null or p_quantity < 0 then
      perform private.fail('QUANTITY_REQUIRED', 'A non-negative quantity is required for this policy.');
    end if;
    if p_quantity_per_violation is null or p_quantity_per_violation <= 0 then
      perform private.fail('INVALID_POLICY', 'The policy has no valid quantity per violation.');
    end if;
    -- Floor division. Never rounds up; remainders are not carried over.
    return floor(p_quantity::numeric / p_quantity_per_violation)::integer;
  end if;
  perform private.fail('INVALID_POLICY', format('Unknown calculation type %s.', p_calculation_type));
  return null;
end;
$$;

create or replace function public.calculate_violation_count(p_policy_version_id uuid, p_quantity integer)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.violation_policy_versions;
begin
  select * into v from public.violation_policy_versions where id = p_policy_version_id;
  if not found then
    perform private.fail('POLICY_NOT_FOUND', 'Policy version not found.');
  end if;
  return private.compute_violation_count(v.calculation_type, v.quantity_per_violation, p_quantity);
end;
$$;

-- Penalty for a number of violations under a version. Returns null amounts for
-- options the version does not allow, and fails if the penalty is unconfirmed.
create or replace function public.calculate_penalty(p_policy_version_id uuid, p_violation_count integer)
returns table (required_hours numeric, required_amount numeric, allowed_resolutions text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.violation_policy_versions;
begin
  select * into v from public.violation_policy_versions where id = p_policy_version_id;
  if not found then
    perform private.fail('POLICY_NOT_FOUND', 'Policy version not found.');
  end if;
  if not v.penalty_confirmed then
    perform private.fail('PENALTY_NOT_CONFIGURED',
      'This organization''s penalty has not been confirmed. An administrator must configure it.');
  end if;
  if p_violation_count is null or p_violation_count < 0 then
    perform private.fail('INVALID_COUNT', 'Violation count must be zero or more.');
  end if;
  required_hours := case when 'community_service' = any (v.allowed_resolutions)
                         then p_violation_count * v.hours_per_violation end;
  required_amount := case when 'payment' = any (v.allowed_resolutions)
                          then p_violation_count * v.amount_per_violation end;
  allowed_resolutions := v.allowed_resolutions;
  return next;
end;
$$;

-- -----------------------------------------------------------------------------
-- Workflow
-- -----------------------------------------------------------------------------
create or replace function public.report_violation(
  p_policy_id uuid, p_student_id uuid, p_description text,
  p_event_id uuid default null, p_quantity integer default null,
  p_occurred_on date default null, p_category text default null)
returns public.violation_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_ay uuid := private.require_current_academic_year();
  v_policy public.violation_policies;
  v_version public.violation_policy_versions;
  v_rec public.violation_records;
begin
  select * into v_policy from public.violation_policies where id = p_policy_id and is_active;
  if not found then
    perform private.fail('POLICY_NOT_FOUND', 'Violation policy not found or inactive.');
  end if;
  if not private.has_org_permission(v_policy.organization_id, 'violations.report') then
    perform private.fail('FORBIDDEN', 'You cannot report violations for this organization.', '42501');
  end if;
  if p_student_id = v_actor then
    perform private.fail('SELF_REPORT', 'You cannot report a violation against yourself.');
  end if;
  if not exists (select 1 from public.students where profile_id = p_student_id) then
    perform private.fail('STUDENT_NOT_FOUND', 'Student not found.');
  end if;
  select * into v_version from public.violation_policy_versions
   where policy_id = p_policy_id and academic_year_id = v_ay and status = 'active';
  if not found then
    perform private.fail('NO_ACTIVE_POLICY_VERSION', 'This policy has no active version for the current academic year.');
  end if;
  if p_event_id is not null and not exists (
       select 1 from public.organization_events e
       where e.id = p_event_id and e.organization_id = v_policy.organization_id) then
    perform private.fail('EVENT_NOT_FOUND', 'The event does not belong to this organization.');
  end if;
  if v_version.calculation_type = 'quantity_threshold' then
    if p_event_id is null or p_quantity is null then
      perform private.fail('QUANTITY_REQUIRED',
        format('This policy counts %s per event: an event and a quantity are required.', v_version.quantity_unit));
    end if;
  elsif p_quantity is not null then
    perform private.fail('QUANTITY_NOT_ALLOWED', 'This policy counts each verified record as one violation.');
  end if;

  insert into public.violation_records
    (organization_id, policy_id, policy_version_id, calculation_type, event_id, student_id,
     academic_year_id, reported_by, category, description, quantity, occurred_on)
  values
    (v_policy.organization_id, p_policy_id, v_version.id, v_version.calculation_type, p_event_id, p_student_id,
     v_ay, v_actor, p_category, p_description, p_quantity, coalesce(p_occurred_on, current_date))
  returning * into v_rec;
  return v_rec;
end;
$$;

create or replace function public.review_violation(p_record_id uuid, p_decision text, p_notes text default null)
returns public.violation_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_rec public.violation_records;
  v_version public.violation_policy_versions;
  v_count integer;
begin
  if p_decision not in ('verified', 'rejected') then
    perform private.fail('INVALID_DECISION', 'Decision must be verified or rejected.');
  end if;
  select * into v_rec from public.violation_records where id = p_record_id for update;
  if not found then
    perform private.fail('VIOLATION_NOT_FOUND', 'Violation record not found.');
  end if;
  if not private.has_org_permission(v_rec.organization_id, 'violations.review') then
    perform private.fail('FORBIDDEN', 'You cannot review violations for this organization.', '42501');
  end if;
  if v_rec.student_id = v_actor then
    perform private.fail('SELF_VERIFICATION', 'You cannot review your own violation.', '42501');
  end if;
  if v_rec.status <> 'reported' then
    perform private.fail('INVALID_STATE', 'Only a reported violation can be reviewed.');
  end if;
  if p_decision = 'rejected' and (p_notes is null or length(trim(p_notes)) = 0) then
    perform private.fail('REASON_REQUIRED', 'A reason is required to reject a violation.');
  end if;

  if p_decision = 'verified' then
    select * into v_version from public.violation_policy_versions where id = v_rec.policy_version_id;
    v_count := private.compute_violation_count(
      v_version.calculation_type, v_version.quantity_per_violation, v_rec.quantity);
  end if;

  update public.violation_records
     set status = p_decision, violation_count = v_count, reviewed_by = v_actor, reviewed_at = now()
   where id = p_record_id returning * into v_rec;
  insert into public.violation_reviews (violation_record_id, reviewer_id, decision, computed_violation_count, notes)
  values (p_record_id, v_actor, p_decision, v_count, p_notes);
  if p_decision = 'verified' and v_count > 0 then
    perform private.notify(v_rec.student_id, 'violation', 'Violation verified',
      format('A violation was verified (%s counted). You may file a dispute.', v_count));
  end if;
  return v_rec;
end;
$$;

-- Student disputes a reported or verified record. A disputed record never
-- counts; if it was part of an assessment with no resolution yet, that
-- assessment is superseded so it can be recalculated.
create or replace function public.file_violation_dispute(p_record_id uuid, p_reason text)
returns public.violation_disputes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_rec public.violation_records;
  v_assessment_status text;
  v_dispute public.violation_disputes;
begin
  select * into v_rec from public.violation_records where id = p_record_id for update;
  if not found or v_rec.student_id <> v_actor then
    perform private.fail('VIOLATION_NOT_FOUND', 'Violation record not found.');
  end if;
  if v_rec.status not in ('reported', 'verified') then
    perform private.fail('INVALID_STATE', 'This violation cannot be disputed.');
  end if;
  if v_rec.assessment_id is not null then
    select status into v_assessment_status from public.penalty_assessments where id = v_rec.assessment_id for update;
    if v_assessment_status = 'open' and not exists (
         select 1 from public.penalty_resolutions r
         where r.assessment_id = v_rec.assessment_id and r.status in ('submitted', 'verified')) then
      update public.penalty_assessments set status = 'superseded' where id = v_rec.assessment_id;
      update public.penalty_resolutions set status = 'cancelled'
       where assessment_id = v_rec.assessment_id and status = 'selected';
      update public.violation_records set assessment_id = null where assessment_id = v_rec.assessment_id;
    else
      perform private.fail('ASSESSMENT_IN_PROGRESS',
        'This violation is part of a penalty that is already being resolved.');
    end if;
  end if;

  insert into public.violation_disputes (violation_record_id, student_id, reason, record_status_before)
  values (p_record_id, v_actor, p_reason, v_rec.status)
  returning * into v_dispute;
  update public.violation_records set status = 'disputed', assessment_id = null where id = p_record_id;
  return v_dispute;
end;
$$;

create or replace function public.decide_violation_dispute(
  p_dispute_id uuid, p_decision text, p_notes text default null)
returns public.violation_disputes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_dispute public.violation_disputes;
  v_rec public.violation_records;
begin
  if p_decision not in ('upheld', 'denied') then
    perform private.fail('INVALID_DECISION', 'Decision must be upheld or denied.');
  end if;
  select * into v_dispute from public.violation_disputes where id = p_dispute_id for update;
  if not found then
    perform private.fail('DISPUTE_NOT_FOUND', 'Dispute not found.');
  end if;
  select * into v_rec from public.violation_records where id = v_dispute.violation_record_id for update;
  if not private.has_org_permission(v_rec.organization_id, 'disputes.decide') then
    perform private.fail('FORBIDDEN', 'You cannot decide disputes for this organization.', '42501');
  end if;
  if v_dispute.student_id = v_actor then
    perform private.fail('SELF_VERIFICATION', 'You cannot decide your own dispute.', '42501');
  end if;
  if v_dispute.status <> 'open' then
    perform private.fail('INVALID_STATE', 'This dispute has already been decided.');
  end if;
  if p_notes is null or length(trim(p_notes)) = 0 then
    perform private.fail('REASON_REQUIRED', 'Explain the decision.');
  end if;

  update public.violation_disputes
     set status = p_decision, decided_by = v_actor, decided_at = now(), decision_notes = p_notes
   where id = p_dispute_id returning * into v_dispute;
  -- upheld: the violation is voided. denied: it returns to its previous state.
  update public.violation_records
     set status = case when p_decision = 'upheld' then 'voided' else v_dispute.record_status_before end
   where id = v_rec.id;
  insert into public.violation_reviews (violation_record_id, reviewer_id, decision, computed_violation_count, notes)
  values (v_rec.id, v_actor, 'dispute_' || p_decision, v_rec.violation_count, p_notes);
  perform private.notify(v_dispute.student_id, 'violation', 'Dispute decided',
    format('Your dispute was %s.', p_decision));
  return v_dispute;
end;
$$;
