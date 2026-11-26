-- =============================================================================
-- CampusServe 006: penalty assessment, resolution and digital payment records
--
--   * An assessment snapshots the policy version it used (policy_snapshot),
--     so later policy changes never alter historical assessments.
--   * The student chooses an allowed resolution (community service or payment).
--   * The RESPONSIBLE organization verifies community service and payments.
--     A student can never verify their own penalty or payment.
--   * A payment becomes 'paid' only through a provider webhook with a valid
--     signature (or a provider status query) processed by the trusted backend
--     using the service role. Staff cannot mark a payment paid, and an uploaded
--     screenshot is never proof of settlement. Even after 'paid', the
--     organization must verify it before the penalty is resolved.
--   * Webhooks are idempotent on (provider, provider_event_id).
-- =============================================================================

create table public.penalty_assessments (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id),
  student_id             uuid not null references public.students (profile_id),
  academic_year_id       uuid not null references public.academic_years (id),
  policy_id              uuid not null references public.violation_policies (id),
  policy_version_id      uuid not null references public.violation_policy_versions (id),
  policy_snapshot        jsonb not null,
  violation_count        integer not null check (violation_count > 0),
  required_hours         numeric(8, 2) check (required_hours >= 0),
  required_amount        numeric(12, 2) check (required_amount >= 0),
  status                 text not null default 'open'
                           check (status in ('open', 'pending_verification', 'resolved', 'superseded')),
  selected_resolution    text check (selected_resolution in ('community_service', 'payment')),
  superseded_by          uuid references public.penalty_assessments (id),
  assessed_by            uuid not null references public.profiles (id),
  assessed_at            timestamptz not null default now(),
  resolved_by            uuid references public.profiles (id),
  resolved_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint penalty_assessments_not_self_chk check (
    assessed_by <> student_id and (resolved_by is null or resolved_by <> student_id)),
  constraint penalty_assessments_resolved_fields_chk check (
    status <> 'resolved' or (resolved_by is not null and resolved_at is not null))
);
create unique index penalty_assessments_one_live_idx
  on public.penalty_assessments (organization_id, student_id, academic_year_id, policy_id)
  where status in ('open', 'pending_verification');
create index penalty_assessments_student_idx on public.penalty_assessments (student_id, academic_year_id);
create index penalty_assessments_org_status_idx on public.penalty_assessments (organization_id, status);

alter table public.violation_records
  add constraint violation_records_assessment_fk
  foreign key (assessment_id) references public.penalty_assessments (id);

-- Policy snapshots are historical records: they never change.
create or replace function private.protect_assessment_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.policy_snapshot is distinct from old.policy_snapshot
     or new.policy_version_id is distinct from old.policy_version_id
     or new.violation_count is distinct from old.violation_count
     or new.required_hours is distinct from old.required_hours
     or new.required_amount is distinct from old.required_amount
     or new.student_id is distinct from old.student_id
     or new.organization_id is distinct from old.organization_id then
    perform private.fail('ASSESSMENT_IMMUTABLE',
      'An assessment''s policy, count and amounts cannot change. Supersede it instead.');
  end if;
  return new;
end;
$$;
create trigger penalty_assessments_protect before update on public.penalty_assessments
  for each row execute function private.protect_assessment_snapshot();

create table public.penalty_resolutions (
  id               uuid primary key default gen_random_uuid(),
  assessment_id    uuid not null references public.penalty_assessments (id) on delete cascade,
  student_id       uuid not null references public.students (profile_id),
  resolution_type  text not null check (resolution_type in ('community_service', 'payment')),
  status           text not null default 'selected'
                     check (status in ('selected', 'submitted', 'verified', 'rejected', 'cancelled')),
  selected_at      timestamptz not null default now(),
  verified_by      uuid references public.profiles (id),
  verified_at      timestamptz,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint penalty_resolutions_not_self_chk check (verified_by is null or verified_by <> student_id)
);
create unique index penalty_resolutions_one_live_idx
  on public.penalty_resolutions (assessment_id) where status in ('selected', 'submitted', 'verified');

create table public.community_service_records (
  id               uuid primary key default gen_random_uuid(),
  resolution_id    uuid not null references public.penalty_resolutions (id) on delete cascade,
  assessment_id    uuid not null references public.penalty_assessments (id),
  student_id       uuid not null references public.students (profile_id),
  organization_id  uuid not null references public.organizations (id),
  service_date     date not null,
  hours_rendered   numeric(6, 2) not null check (hours_rendered > 0 and hours_rendered <= 24),
  description      text not null check (length(trim(description)) > 0),
  supervisor_name  text,
  status           text not null default 'submitted' check (status in ('submitted', 'verified', 'rejected')),
  verified_by      uuid references public.profiles (id),
  verified_at      timestamptz,
  decision_notes   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint community_service_not_self_chk check (verified_by is null or verified_by <> student_id)
);
create index community_service_assessment_idx on public.community_service_records (assessment_id);

create sequence public.payment_reference_seq;

create table public.penalty_payments (
  id                       uuid primary key default gen_random_uuid(),
  reference                text not null unique
                             default ('CSP-' || to_char(now(), 'YYYY') || '-'
                                      || lpad(nextval('public.payment_reference_seq')::text, 8, '0')),
  idempotency_key          text not null check (length(idempotency_key) between 8 and 128),
  assessment_id            uuid not null references public.penalty_assessments (id),
  resolution_id            uuid not null references public.penalty_resolutions (id),
  student_id               uuid not null references public.students (profile_id),
  organization_id          uuid not null references public.organizations (id),
  amount                   numeric(12, 2) not null check (amount > 0),
  currency                 text not null default 'PHP' check (currency = 'PHP'),
  provider                 text not null check (provider in ('gcash', 'maya', 'landbank')),
  provider_transaction_id  text,
  provider_checkout_url    text,
  status                   text not null default 'created'
                             check (status in ('created', 'pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded')),
  status_reason            text,
  paid_at                  timestamptz,
  expires_at               timestamptz,
  verification_status      text not null default 'unverified'
                             check (verification_status in ('unverified', 'verified', 'rejected')),
  verified_by              uuid references public.profiles (id),
  verified_at              timestamptz,
  verification_notes       text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (student_id, idempotency_key),
  unique (provider, provider_transaction_id),
  constraint penalty_payments_verified_requires_paid_chk check (
    verification_status <> 'verified' or status = 'paid'),
  constraint penalty_payments_paid_at_chk check (status <> 'paid' or paid_at is not null),
  constraint penalty_payments_not_self_chk check (verified_by is null or verified_by <> student_id)
);
-- At most one in-flight or paid (and not rejected) payment per assessment.
create unique index penalty_payments_one_live_idx
  on public.penalty_payments (assessment_id)
  where status in ('created', 'pending') or (status = 'paid' and verification_status <> 'rejected');
create index penalty_payments_org_idx on public.penalty_payments (organization_id, status);
create index penalty_payments_student_idx on public.penalty_payments (student_id);

create table public.payment_webhook_events (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null check (provider in ('gcash', 'maya', 'landbank')),
  provider_event_id   text not null,
  event_type          text,
  signature_valid     boolean not null,
  payload             jsonb not null,
  penalty_payment_id  uuid references public.penalty_payments (id),
  processing_status   text not null default 'received'
                        check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  processing_error    text,
  received_at         timestamptz not null default now(),
  processed_at        timestamptz,
  unique (provider, provider_event_id)
);
create index payment_webhook_events_payment_idx on public.payment_webhook_events (penalty_payment_id);

create table public.payment_reconciliation_records (
  id                  uuid primary key default gen_random_uuid(),
  penalty_payment_id  uuid not null references public.penalty_payments (id),
  organization_id     uuid not null references public.organizations (id),
  reconciled_by       uuid not null references public.profiles (id),
  source              text not null check (source in ('provider_api', 'settlement_report', 'manual_review')),
  provider_reference  text,
  provider_amount     numeric(12, 2),
  provider_status     text,
  result              text not null check (result in ('matched', 'amount_mismatch', 'status_mismatch', 'not_found_at_provider')),
  notes               text,
  created_at          timestamptz not null default now()
);
create index payment_reconciliation_payment_idx on public.payment_reconciliation_records (penalty_payment_id);

-- =============================================================================
-- Workflow functions
-- =============================================================================

-- Assess one policy's verified, unassessed violations for one student.
-- An existing 'open' assessment with no submitted resolution is superseded
-- and its violations folded into the new one.
create or replace function public.assess_penalty(p_policy_id uuid, p_student_id uuid)
returns public.penalty_assessments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_ay uuid := private.require_current_academic_year();
  v_policy public.violation_policies;
  v_version public.violation_policy_versions;
  v_old public.penalty_assessments;
  v_new public.penalty_assessments;
  v_count integer;
  v_hours numeric;
  v_amount numeric;
begin
  select * into v_policy from public.violation_policies where id = p_policy_id;
  if not found then
    perform private.fail('POLICY_NOT_FOUND', 'Violation policy not found.');
  end if;
  if not private.has_org_permission(v_policy.organization_id, 'penalties.assess') then
    perform private.fail('FORBIDDEN', 'You cannot assess penalties for this organization.', '42501');
  end if;
  if p_student_id = v_actor then
    perform private.fail('SELF_VERIFICATION', 'You cannot assess your own penalty.', '42501');
  end if;
  select * into v_version from public.violation_policy_versions
   where policy_id = p_policy_id and academic_year_id = v_ay and status = 'active';
  if not found or not v_version.penalty_confirmed then
    perform private.fail('PENALTY_NOT_CONFIGURED',
      'This organization''s penalty has not been confirmed. An administrator must configure it.');
  end if;

  select * into v_old from public.penalty_assessments
   where organization_id = v_policy.organization_id and student_id = p_student_id
     and academic_year_id = v_ay and policy_id = p_policy_id
     and status in ('open', 'pending_verification')
   for update;
  if found then
    if v_old.status = 'pending_verification' or exists (
         select 1 from public.penalty_resolutions r
         where r.assessment_id = v_old.id and r.status in ('submitted', 'verified')) then
      perform private.fail('ASSESSMENT_IN_PROGRESS',
        'The student is already resolving the current penalty. Assess again after it is resolved.');
    end if;
    update public.penalty_assessments set status = 'superseded' where id = v_old.id;
    update public.penalty_resolutions set status = 'cancelled'
     where assessment_id = v_old.id and status = 'selected';
    update public.violation_records set assessment_id = null where assessment_id = v_old.id;
  end if;

  select coalesce(sum(violation_count), 0) into v_count
    from public.violation_records
   where policy_id = p_policy_id and student_id = p_student_id and academic_year_id = v_ay
     and status = 'verified' and assessment_id is null and violation_count > 0;
  if v_count = 0 then
    perform private.fail('NO_VERIFIED_VIOLATIONS', 'There are no verified, unassessed violations.');
  end if;

  select c.required_hours, c.required_amount into v_hours, v_amount
    from public.calculate_penalty(v_version.id, v_count) c;

  insert into public.penalty_assessments
    (organization_id, student_id, academic_year_id, policy_id, policy_version_id, policy_snapshot,
     violation_count, required_hours, required_amount, assessed_by)
  values
    (v_policy.organization_id, p_student_id, v_ay, p_policy_id, v_version.id,
     to_jsonb(v_version) || jsonb_build_object('policy_code', v_policy.code, 'policy_name', v_policy.name),
     v_count, v_hours, v_amount, v_actor)
  returning * into v_new;

  update public.violation_records set assessment_id = v_new.id
   where policy_id = p_policy_id and student_id = p_student_id and academic_year_id = v_ay
     and status = 'verified' and assessment_id is null and violation_count > 0;
  if v_old.id is not null then
    update public.penalty_assessments set superseded_by = v_new.id where id = v_old.id;
  end if;

  perform private.notify(p_student_id, 'penalty', 'Penalty assessed',
    format('%s violation(s): %s hour(s) of community service or PHP %s.',
           v_count, coalesce(v_hours::text, 'n/a'), coalesce(v_amount::text, 'n/a')));
  return v_new;
end;
$$;

create or replace function public.select_penalty_resolution(p_assessment_id uuid, p_resolution_type text)
returns public.penalty_resolutions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_a public.penalty_assessments;
  v_res public.penalty_resolutions;
begin
  select * into v_a from public.penalty_assessments where id = p_assessment_id for update;
  if not found or v_a.student_id <> v_actor then
    perform private.fail('ASSESSMENT_NOT_FOUND', 'Penalty assessment not found.');
  end if;
  if v_a.status <> 'open' then
    perform private.fail('INVALID_STATE', 'A resolution can only be chosen while the penalty is open.');
  end if;
  if not (v_a.policy_snapshot -> 'allowed_resolutions') ? p_resolution_type then
    perform private.fail('RESOLUTION_NOT_ALLOWED', 'This organization does not allow that resolution.');
  end if;
  if exists (select 1 from public.penalty_resolutions
             where assessment_id = p_assessment_id and status = 'submitted') then
    perform private.fail('ASSESSMENT_IN_PROGRESS', 'A submitted resolution is awaiting verification.');
  end if;
  if exists (select 1 from public.penalty_payments
             where assessment_id = p_assessment_id
               and (status = 'pending' or (status = 'paid' and verification_status = 'unverified'))) then
    perform private.fail('PAYMENT_IN_PROGRESS', 'A payment for this penalty is already in progress.');
  end if;

  update public.penalty_resolutions set status = 'cancelled'
   where assessment_id = p_assessment_id and status = 'selected';
  update public.penalty_payments set status = 'cancelled', status_reason = 'Resolution changed'
   where assessment_id = p_assessment_id and status = 'created';
  insert into public.penalty_resolutions (assessment_id, student_id, resolution_type)
  values (p_assessment_id, v_actor, p_resolution_type)
  returning * into v_res;
  update public.penalty_assessments set selected_resolution = p_resolution_type where id = p_assessment_id;
  return v_res;
end;
$$;

create or replace function public.submit_community_service(
  p_resolution_id uuid, p_service_date date, p_hours numeric, p_description text,
  p_supervisor_name text default null)
returns public.community_service_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_res public.penalty_resolutions;
  v_a public.penalty_assessments;
  v_rec public.community_service_records;
begin
  select * into v_res from public.penalty_resolutions where id = p_resolution_id for update;
  if not found or v_res.student_id <> v_actor then
    perform private.fail('RESOLUTION_NOT_FOUND', 'Resolution not found.');
  end if;
  if v_res.resolution_type <> 'community_service' or v_res.status not in ('selected', 'submitted') then
    perform private.fail('INVALID_STATE', 'Community service cannot be submitted for this resolution.');
  end if;
  select * into v_a from public.penalty_assessments where id = v_res.assessment_id for update;
  if v_a.status not in ('open', 'pending_verification') then
    perform private.fail('INVALID_STATE', 'This penalty is no longer open.');
  end if;
  if p_service_date > current_date then
    perform private.fail('INVALID_DATE', 'Service date cannot be in the future.');
  end if;

  insert into public.community_service_records
    (resolution_id, assessment_id, student_id, organization_id, service_date, hours_rendered,
     description, supervisor_name)
  values
    (v_res.id, v_a.id, v_actor, v_a.organization_id, p_service_date, p_hours, p_description, p_supervisor_name)
  returning * into v_rec;
  update public.penalty_resolutions set status = 'submitted' where id = v_res.id;
  update public.penalty_assessments set status = 'pending_verification' where id = v_a.id;
  return v_rec;
end;
$$;

create or replace function public.verify_community_service(
  p_record_id uuid, p_decision text, p_notes text default null)
returns public.penalty_assessments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_rec public.community_service_records;
  v_a public.penalty_assessments;
  v_verified_hours numeric;
begin
  if p_decision not in ('verified', 'rejected') then
    perform private.fail('INVALID_DECISION', 'Decision must be verified or rejected.');
  end if;
  select * into v_rec from public.community_service_records where id = p_record_id for update;
  if not found then
    perform private.fail('RECORD_NOT_FOUND', 'Community service record not found.');
  end if;
  if not private.has_org_permission(v_rec.organization_id, 'penalties.verify_service') then
    perform private.fail('FORBIDDEN', 'You cannot verify community service for this organization.', '42501');
  end if;
  if v_rec.student_id = v_actor then
    perform private.fail('SELF_VERIFICATION', 'You cannot verify your own community service.', '42501');
  end if;
  if v_rec.status <> 'submitted' then
    perform private.fail('INVALID_STATE', 'This record has already been decided.');
  end if;
  if p_decision = 'rejected' and (p_notes is null or length(trim(p_notes)) = 0) then
    perform private.fail('REASON_REQUIRED', 'A reason is required to reject community service.');
  end if;

  update public.community_service_records
     set status = p_decision, verified_by = v_actor, verified_at = now(), decision_notes = p_notes
   where id = p_record_id;
  select * into v_a from public.penalty_assessments where id = v_rec.assessment_id for update;

  select coalesce(sum(hours_rendered), 0) into v_verified_hours
    from public.community_service_records
   where resolution_id = v_rec.resolution_id and status = 'verified';

  if v_verified_hours >= v_a.required_hours then
    update public.penalty_resolutions set status = 'verified', verified_by = v_actor, verified_at = now()
     where id = v_rec.resolution_id;
    update public.penalty_assessments set status = 'resolved', resolved_by = v_actor, resolved_at = now()
     where id = v_a.id returning * into v_a;
    perform private.notify(v_a.student_id, 'penalty', 'Penalty resolved',
      'Your community service has been verified and the penalty is resolved.');
  elsif not exists (select 1 from public.community_service_records
                    where resolution_id = v_rec.resolution_id and status = 'submitted') then
    -- nothing left to review: the student must submit more hours
    update public.penalty_resolutions set status = 'selected' where id = v_rec.resolution_id;
    update public.penalty_assessments set status = 'open' where id = v_a.id returning * into v_a;
  end if;
  return v_a;
end;
$$;

-- Creates (or returns, for the same idempotency key) a payment record. The
-- trusted backend then asks the provider adapter for a checkout session.
create or replace function public.create_penalty_payment(
  p_assessment_id uuid, p_provider text, p_idempotency_key text)
returns public.penalty_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_a public.penalty_assessments;
  v_res public.penalty_resolutions;
  v_pay public.penalty_payments;
  v_enabled jsonb;
begin
  select * into v_pay from public.penalty_payments
   where student_id = v_actor and idempotency_key = p_idempotency_key;
  if found then
    if v_pay.assessment_id <> p_assessment_id or v_pay.provider <> p_provider then
      perform private.fail('IDEMPOTENCY_CONFLICT', 'This idempotency key was used for a different payment.');
    end if;
    return v_pay;
  end if;

  if p_provider not in ('gcash', 'maya', 'landbank') then
    perform private.fail('INVALID_PROVIDER', 'Choose GCash, Maya or LANDBANK.');
  end if;
  select value into v_enabled from public.system_settings where key = 'payments.enabled_providers';
  if v_enabled is null or not (v_enabled ? p_provider) then
    perform private.fail('PROVIDER_NOT_AVAILABLE',
      'This payment method is not available yet. Merchant integration has not been activated.');
  end if;

  select * into v_a from public.penalty_assessments where id = p_assessment_id for update;
  if not found or v_a.student_id <> v_actor then
    perform private.fail('ASSESSMENT_NOT_FOUND', 'Penalty assessment not found.');
  end if;
  if v_a.status <> 'open' or v_a.required_amount is null or v_a.required_amount <= 0 then
    perform private.fail('INVALID_STATE', 'This penalty cannot be paid online.');
  end if;
  select * into v_res from public.penalty_resolutions
   where assessment_id = p_assessment_id and status = 'selected' and resolution_type = 'payment';
  if not found then
    perform private.fail('RESOLUTION_NOT_SELECTED', 'Choose payment as the resolution first.');
  end if;
  if exists (select 1 from public.penalty_payments
             where assessment_id = p_assessment_id
               and (status in ('created', 'pending') or (status = 'paid' and verification_status <> 'rejected'))) then
    perform private.fail('PAYMENT_IN_PROGRESS', 'A payment for this penalty is already in progress.');
  end if;

  insert into public.penalty_payments
    (idempotency_key, assessment_id, resolution_id, student_id, organization_id, amount, provider)
  values
    (p_idempotency_key, v_a.id, v_res.id, v_actor, v_a.organization_id, v_a.required_amount, p_provider)
  returning * into v_pay;
  return v_pay;
end;
$$;

-- SERVICE ROLE ONLY: store the provider checkout session details.
create or replace function public.attach_payment_checkout(
  p_payment_id uuid, p_provider_transaction_id text, p_checkout_url text, p_expires_at timestamptz)
returns public.penalty_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.penalty_payments;
begin
  update public.penalty_payments
     set provider_transaction_id = p_provider_transaction_id, provider_checkout_url = p_checkout_url,
         expires_at = p_expires_at, status = 'pending'
   where id = p_payment_id and status = 'created'
  returning * into v_pay;
  if not found then
    perform private.fail('INVALID_STATE', 'Payment not found or no longer awaiting checkout.');
  end if;
  return v_pay;
end;
$$;

-- SERVICE ROLE ONLY: idempotent provider webhook processing. The backend
-- verifies the provider signature and passes the result in p_signature_valid.
create or replace function public.process_payment_webhook(
  p_provider text, p_provider_event_id text, p_event_type text, p_signature_valid boolean,
  p_payload jsonb, p_reference text, p_provider_transaction_id text, p_status text, p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_pay public.penalty_payments;
  v_allowed boolean;
begin
  insert into public.payment_webhook_events (provider, provider_event_id, event_type, signature_valid, payload)
  values (p_provider, p_provider_event_id, p_event_type, p_signature_valid, coalesce(p_payload, '{}'::jsonb))
  on conflict (provider, provider_event_id) do nothing
  returning id into v_event_id;
  if v_event_id is null then
    return jsonb_build_object('result', 'duplicate');
  end if;

  if not p_signature_valid then
    update public.payment_webhook_events
       set processing_status = 'ignored', processing_error = 'invalid signature', processed_at = now()
     where id = v_event_id;
    return jsonb_build_object('result', 'ignored', 'reason', 'invalid_signature');
  end if;

  select * into v_pay from public.penalty_payments
   where reference = p_reference and provider = p_provider for update;
  if not found then
    update public.payment_webhook_events
       set processing_status = 'failed', processing_error = 'payment not found', processed_at = now()
     where id = v_event_id;
    return jsonb_build_object('result', 'failed', 'reason', 'payment_not_found');
  end if;
  update public.payment_webhook_events set penalty_payment_id = v_pay.id where id = v_event_id;

  if v_pay.provider_transaction_id is not null and p_provider_transaction_id is not null
     and v_pay.provider_transaction_id <> p_provider_transaction_id then
    update public.payment_webhook_events
       set processing_status = 'failed', processing_error = 'provider transaction id mismatch', processed_at = now()
     where id = v_event_id;
    return jsonb_build_object('result', 'failed', 'reason', 'transaction_mismatch');
  end if;
  if p_status = 'paid' and (p_amount is null or p_amount <> v_pay.amount) then
    update public.payment_webhook_events
       set processing_status = 'failed', processing_error = 'amount mismatch', processed_at = now()
     where id = v_event_id;
    return jsonb_build_object('result', 'failed', 'reason', 'amount_mismatch');
  end if;

  v_allowed := (v_pay.status in ('created', 'pending')
                and p_status in ('pending', 'paid', 'failed', 'expired', 'cancelled'))
               or (v_pay.status = 'paid' and p_status = 'refunded');
  if not v_allowed or v_pay.status = p_status then
    update public.payment_webhook_events
       set processing_status = 'ignored',
           processing_error = format('transition %s -> %s not applied', v_pay.status, p_status),
           processed_at = now()
     where id = v_event_id;
    return jsonb_build_object('result', 'ignored', 'reason', 'transition_not_applied');
  end if;

  update public.penalty_payments
     set status = p_status,
         provider_transaction_id = coalesce(provider_transaction_id, p_provider_transaction_id),
         paid_at = case when p_status = 'paid' then now() else paid_at end,
         verification_status = case when p_status = 'refunded' then 'rejected' else verification_status end,
         status_reason = p_event_type
   where id = v_pay.id returning * into v_pay;

  if p_status = 'paid' then
    update public.penalty_resolutions set status = 'submitted' where id = v_pay.resolution_id;
    update public.penalty_assessments set status = 'pending_verification' where id = v_pay.assessment_id;
    perform private.notify(v_pay.student_id, 'payment', 'Payment received',
      format('Payment %s was received and is awaiting verification by the organization.', v_pay.reference));
  elsif p_status = 'refunded' then
    -- refunded money no longer settles the penalty: reopen it
    update public.penalty_resolutions set status = 'rejected', notes = 'Payment refunded'
     where id = v_pay.resolution_id;
    update public.penalty_assessments
       set status = 'open', selected_resolution = null, resolved_by = null, resolved_at = null
     where id = v_pay.assessment_id;
  end if;

  update public.payment_webhook_events set processing_status = 'processed', processed_at = now()
   where id = v_event_id;
  return jsonb_build_object('result', 'processed', 'payment_id', v_pay.id, 'status', v_pay.status);
end;
$$;

create or replace function public.verify_penalty_payment(
  p_payment_id uuid, p_decision text, p_notes text default null)
returns public.penalty_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_pay public.penalty_payments;
begin
  if p_decision not in ('verified', 'rejected') then
    perform private.fail('INVALID_DECISION', 'Decision must be verified or rejected.');
  end if;
  select * into v_pay from public.penalty_payments where id = p_payment_id for update;
  if not found then
    perform private.fail('PAYMENT_NOT_FOUND', 'Payment not found.');
  end if;
  if not private.has_org_permission(v_pay.organization_id, 'payments.verify') then
    perform private.fail('FORBIDDEN', 'You cannot verify payments for this organization.', '42501');
  end if;
  if v_pay.student_id = v_actor then
    perform private.fail('SELF_VERIFICATION', 'You cannot verify your own payment.', '42501');
  end if;
  if v_pay.status <> 'paid' then
    perform private.fail('PAYMENT_NOT_SETTLED',
      'Only a payment confirmed as paid by the provider can be verified.');
  end if;
  if v_pay.verification_status <> 'unverified' then
    perform private.fail('INVALID_STATE', 'This payment has already been decided.');
  end if;
  if p_decision = 'rejected' and (p_notes is null or length(trim(p_notes)) = 0) then
    perform private.fail('REASON_REQUIRED', 'A reason is required to reject a payment.');
  end if;

  update public.penalty_payments
     set verification_status = p_decision, verified_by = v_actor, verified_at = now(),
         verification_notes = p_notes
   where id = p_payment_id returning * into v_pay;

  if p_decision = 'verified' then
    update public.penalty_resolutions set status = 'verified', verified_by = v_actor, verified_at = now()
     where id = v_pay.resolution_id;
    update public.penalty_assessments set status = 'resolved', resolved_by = v_actor, resolved_at = now()
     where id = v_pay.assessment_id;
    perform private.notify(v_pay.student_id, 'penalty', 'Penalty resolved',
      format('Payment %s was verified and the penalty is resolved.', v_pay.reference));
  else
    update public.penalty_resolutions set status = 'rejected', notes = p_notes where id = v_pay.resolution_id;
    update public.penalty_assessments set status = 'open', selected_resolution = null
     where id = v_pay.assessment_id;
  end if;
  return v_pay;
end;
$$;

create or replace function public.record_payment_reconciliation(
  p_payment_id uuid, p_source text, p_provider_reference text, p_provider_amount numeric,
  p_provider_status text, p_notes text default null)
returns public.payment_reconciliation_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_pay public.penalty_payments;
  v_result text;
  v_rec public.payment_reconciliation_records;
begin
  select * into v_pay from public.penalty_payments where id = p_payment_id;
  if not found then
    perform private.fail('PAYMENT_NOT_FOUND', 'Payment not found.');
  end if;
  if not private.has_org_permission(v_pay.organization_id, 'payments.reconcile') then
    perform private.fail('FORBIDDEN', 'You cannot reconcile payments for this organization.', '42501');
  end if;
  v_result := case
    when p_provider_status is null then 'not_found_at_provider'
    when p_provider_amount is distinct from v_pay.amount then 'amount_mismatch'
    when p_provider_status <> v_pay.status then 'status_mismatch'
    else 'matched' end;
  insert into public.payment_reconciliation_records
    (penalty_payment_id, organization_id, reconciled_by, source, provider_reference, provider_amount,
     provider_status, result, notes)
  values
    (v_pay.id, v_pay.organization_id, v_actor, p_source, p_provider_reference, p_provider_amount,
     p_provider_status, v_result, p_notes)
  returning * into v_rec;
  return v_rec;
end;
$$;
