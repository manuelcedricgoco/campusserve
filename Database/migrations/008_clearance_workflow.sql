-- =============================================================================
-- CampusServe 008: configurable clearance workflow
--
-- Nothing about offices or order is hardcoded:
--   clearance_templates      a named, versioned process for an academic year,
--                            initiated by a configured office (e.g. SAS)
--   clearance_steps          approval steps; steps that share a `sequence`
--                            may be approved in parallel; a lower sequence
--                            must be fully approved before a higher one
--   clearance_requirements   gates a step checks (receipts, guidance slip,
--                            library slip/receipt/ID, unresolved penalties)
--
-- approve_clearance_step() is the secure gate. It re-evaluates the step's
-- requirements live, checks that the caller holds the step's position at the
-- step's resolved scope in the current academic year, that earlier steps are
-- approved, and that the caller is not the student.
-- =============================================================================

create table public.clearance_templates (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null check (code ~ '^[A-Z0-9_]+$'),
  name                  text not null,
  description           text,
  academic_year_id      uuid not null references public.academic_years (id),
  version               integer not null default 1 check (version > 0),
  initiating_office_id  uuid not null references public.offices (id),
  status                text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  created_by            uuid references public.profiles (id) on delete set null,
  activated_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (code, academic_year_id, version)
);
create unique index clearance_templates_one_active_idx
  on public.clearance_templates (code, academic_year_id) where status = 'active';

create table public.clearance_steps (
  id                      uuid primary key default gen_random_uuid(),
  template_id             uuid not null references public.clearance_templates (id) on delete cascade,
  step_key                text not null check (step_key ~ '^[a-z][a-z0-9_]*$'),
  name                    text not null,
  description             text,
  sequence                integer not null check (sequence > 0),
  approver_position_code  text not null references public.positions (code),
  approver_scope          text not null check (approver_scope in
                            ('fixed_organization', 'fixed_office', 'student_department_organization', 'student_program')),
  fixed_organization_id   uuid references public.organizations (id),
  fixed_office_id         uuid references public.offices (id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (template_id, step_key),
  constraint clearance_steps_fixed_org_chk check (
    (approver_scope = 'fixed_organization') = (fixed_organization_id is not null)),
  constraint clearance_steps_fixed_office_chk check (
    (approver_scope = 'fixed_office') = (fixed_office_id is not null))
);
create index clearance_steps_template_idx on public.clearance_steps (template_id, sequence);

create table public.clearance_requirements (
  id                     uuid primary key default gen_random_uuid(),
  step_id                uuid not null references public.clearance_steps (id) on delete cascade,
  requirement_key        text not null check (requirement_key ~ '^[a-z][a-z0-9_]*$'),
  name                   text not null,
  requirement_type       text not null check (requirement_type in (
                           'receipt_obligations', 'guidance_slip', 'library_slip', 'library_receipt',
                           'library_id_validation', 'no_unresolved_penalties')),
  organization_selector  text not null default 'none' check (organization_selector in
                           ('none', 'fixed', 'student_department_organization', 'student_clubs')),
  organization_id        uuid references public.organizations (id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (step_id, requirement_key),
  constraint clearance_requirements_fixed_org_chk check (
    (organization_selector = 'fixed') = (organization_id is not null)),
  constraint clearance_requirements_selector_chk check (
    (requirement_type in ('receipt_obligations', 'no_unresolved_penalties')) = (organization_selector <> 'none'))
);

-- Steps and requirements can only change while their template is a draft.
create or replace function private.protect_active_template()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_template uuid;
begin
  if tg_table_name = 'clearance_steps' then
    v_template := coalesce(new.template_id, old.template_id);
  else
    select s.template_id into v_template from public.clearance_steps s
     where s.id = coalesce(new.step_id, old.step_id);
  end if;
  if exists (select 1 from public.clearance_templates t where t.id = v_template and t.status <> 'draft') then
    perform private.fail('TEMPLATE_LOCKED',
      'An active or retired template cannot be edited. Create a new version instead.');
  end if;
  return coalesce(new, old);
end;
$$;
create trigger clearance_steps_protect before insert or update or delete on public.clearance_steps
  for each row execute function private.protect_active_template();
create trigger clearance_requirements_protect before insert or update or delete on public.clearance_requirements
  for each row execute function private.protect_active_template();

create sequence public.clearance_number_seq;

create table public.student_clearances (
  id                 uuid primary key default gen_random_uuid(),
  clearance_number   text not null unique
                       default ('CLR-' || lpad(nextval('public.clearance_number_seq')::text, 7, '0')),
  student_id         uuid not null references public.students (profile_id),
  template_id        uuid not null references public.clearance_templates (id),
  academic_year_id   uuid not null references public.academic_years (id),
  template_snapshot  jsonb not null,
  status             text not null default 'in_progress' check (status in ('in_progress', 'completed', 'cancelled')),
  initiated_by       uuid not null references public.profiles (id),
  initiated_at       timestamptz not null default now(),
  completed_at       timestamptz,
  cancelled_by       uuid references public.profiles (id),
  cancelled_at       timestamptz,
  cancel_reason      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint student_clearances_not_self_chk check (initiated_by <> student_id)
);
create unique index student_clearances_one_live_idx
  on public.student_clearances (student_id, template_id) where status <> 'cancelled';
create index student_clearances_status_idx on public.student_clearances (academic_year_id, status);

create table public.clearance_approvals (
  id                      uuid primary key default gen_random_uuid(),
  student_clearance_id    uuid not null references public.student_clearances (id) on delete cascade,
  step_id                 uuid not null references public.clearance_steps (id),
  step_key                text not null,
  step_name               text not null,
  sequence                integer not null,
  approver_position_code  text not null references public.positions (code),
  organization_id         uuid references public.organizations (id),
  office_id               uuid references public.offices (id),
  program_id              uuid references public.programs (id),
  status                  text not null default 'pending' check (status in ('pending', 'approved', 'returned')),
  acted_by                uuid references public.profiles (id),
  acted_at                timestamptz,
  remarks                 text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (student_clearance_id, step_id),
  constraint clearance_approvals_one_scope_chk check (num_nonnulls(organization_id, office_id, program_id) = 1)
);
create index clearance_approvals_org_idx on public.clearance_approvals (organization_id, status);
create index clearance_approvals_office_idx on public.clearance_approvals (office_id, status);
create index clearance_approvals_program_idx on public.clearance_approvals (program_id, status);

create table public.clearance_requirement_status (
  id                    uuid primary key default gen_random_uuid(),
  student_clearance_id  uuid not null references public.student_clearances (id) on delete cascade,
  approval_id           uuid not null references public.clearance_approvals (id) on delete cascade,
  requirement_id        uuid not null references public.clearance_requirements (id),
  requirement_key       text not null,
  status                text not null default 'pending' check (status in ('pending', 'satisfied', 'not_satisfied')),
  details               jsonb not null default '{}'::jsonb,
  evaluated_at          timestamptz,
  unique (student_clearance_id, requirement_id)
);
create index clearance_requirement_status_approval_idx on public.clearance_requirement_status (approval_id);

create table public.clearance_history (
  id                    bigint generated always as identity primary key,
  student_clearance_id  uuid not null references public.student_clearances (id) on delete cascade,
  approval_id           uuid references public.clearance_approvals (id),
  event_type            text not null check (event_type in
                          ('initiated', 'evaluated', 'approved', 'returned', 'completed', 'cancelled')),
  actor_id              uuid references public.profiles (id),
  details               jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now()
);
create index clearance_history_clearance_idx on public.clearance_history (student_clearance_id, created_at);

-- =============================================================================
-- Requirement evaluation
-- =============================================================================

-- Organizations a requirement refers to, for one student. Returns null for the
-- department organization when the program mapping is not confirmed.
create or replace function private.requirement_organizations(
  p_selector text, p_organization_id uuid, p_student_id uuid, p_academic_year_id uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_orgs uuid[];
begin
  if p_selector = 'fixed' then
    return array[p_organization_id];
  elsif p_selector = 'student_department_organization' then
    select array[prg.department_organization_id] into v_orgs
      from public.students st
      join public.programs prg on prg.id = st.program_id
     where st.profile_id = p_student_id
       and prg.organization_mapping_status = 'confirmed';
    return v_orgs; -- null when unconfirmed
  elsif p_selector = 'student_clubs' then
    -- every club; per-obligation applicability decides which receipts apply
    select coalesce(array_agg(o.id), '{}') into v_orgs
      from public.organizations o
     where o.organization_type = 'club' and o.is_active;
    return v_orgs;
  end if;
  return '{}';
end;
$$;

create or replace function private.evaluate_requirement(
  p_requirement_id uuid, p_student_id uuid, p_academic_year_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.clearance_requirements;
  v_orgs uuid[];
  v_missing jsonb;
  v_unresolved jsonb;
  v_ok boolean;
begin
  select * into r from public.clearance_requirements where id = p_requirement_id;

  if r.requirement_type in ('receipt_obligations', 'no_unresolved_penalties') then
    v_orgs := private.requirement_organizations(r.organization_selector, r.organization_id,
                                                p_student_id, p_academic_year_id);
    if v_orgs is null then
      return jsonb_build_object('satisfied', false, 'reason', 'department_organization_unconfirmed',
        'message', 'The student''s program has no confirmed department organization. An administrator must configure it.');
    end if;
  end if;

  if r.requirement_type = 'receipt_obligations' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'obligation_id', ob.id, 'organization_id', ob.organization_id, 'name', ob.name, 'amount', ob.amount)), '[]')
      into v_missing
      from public.receipt_obligations ob
     where ob.organization_id = any (v_orgs)
       and ob.academic_year_id = p_academic_year_id
       and ob.is_active
       and private.obligation_applies(ob.id, p_student_id)
       and not exists (select 1 from public.receipt_records rr
                       where rr.obligation_id = ob.id and rr.student_id = p_student_id
                         and rr.status = 'verified');
    return jsonb_build_object('satisfied', jsonb_array_length(v_missing) = 0, 'missing_receipts', v_missing);

  elsif r.requirement_type = 'no_unresolved_penalties' then
    -- Only VERIFIED violations that add to the count can block. Reported,
    -- rejected, disputed and voided records are ignored.
    select coalesce(jsonb_agg(jsonb_build_object(
             'violation_record_id', vr.id, 'organization_id', vr.organization_id,
             'violation_count', vr.violation_count,
             'assessment_status', pa.status)), '[]')
      into v_unresolved
      from public.violation_records vr
      left join public.penalty_assessments pa on pa.id = vr.assessment_id
     where vr.student_id = p_student_id
       and vr.academic_year_id = p_academic_year_id
       and vr.organization_id = any (v_orgs)
       and vr.status = 'verified'
       and vr.violation_count > 0
       and (pa.id is null or pa.status <> 'resolved');
    return jsonb_build_object('satisfied', jsonb_array_length(v_unresolved) = 0,
                              'unresolved_violations', v_unresolved);

  elsif r.requirement_type = 'guidance_slip' then
    select exists (select 1 from public.guidance_records g
                   where g.student_id = p_student_id and g.academic_year_id = p_academic_year_id
                     and g.slip_status = 'issued') into v_ok;
  elsif r.requirement_type = 'library_slip' then
    select exists (select 1 from public.library_records l
                   where l.student_id = p_student_id and l.academic_year_id = p_academic_year_id
                     and l.slip_status = 'issued') into v_ok;
  elsif r.requirement_type = 'library_receipt' then
    select exists (select 1 from public.library_records l
                   where l.student_id = p_student_id and l.academic_year_id = p_academic_year_id
                     and l.receipt_status = 'verified') into v_ok;
  elsif r.requirement_type = 'library_id_validation' then
    select exists (select 1 from public.library_records l
                   where l.student_id = p_student_id and l.academic_year_id = p_academic_year_id
                     and l.id_validation_status = 'validated') into v_ok;
  end if;
  return jsonb_build_object('satisfied', coalesce(v_ok, false));
end;
$$;

-- Re-evaluates and stores every requirement of a clearance (or of one approval).
create or replace function private.refresh_clearance_requirements(p_clearance_id uuid, p_approval_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.student_clearances;
  s record;
  v_result jsonb;
  v_all boolean := true;
begin
  select * into v_c from public.student_clearances where id = p_clearance_id;
  for s in
    select crs.id, crs.requirement_id from public.clearance_requirement_status crs
     where crs.student_clearance_id = p_clearance_id
       and (p_approval_id is null or crs.approval_id = p_approval_id)
  loop
    v_result := private.evaluate_requirement(s.requirement_id, v_c.student_id, v_c.academic_year_id);
    update public.clearance_requirement_status
       set status = case when (v_result ->> 'satisfied')::boolean then 'satisfied' else 'not_satisfied' end,
           details = v_result, evaluated_at = now()
     where id = s.id;
    v_all := v_all and (v_result ->> 'satisfied')::boolean;
  end loop;
  return v_all;
end;
$$;

-- Can the caller see this clearance?
create or replace function private.can_view_clearance(p_clearance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.student_clearances c
    join public.clearance_templates t on t.id = c.template_id
    where c.id = p_clearance_id
      and (c.student_id = auth.uid()
           or private.has_global_permission('records.view_all')
           or private.has_office_permission(t.initiating_office_id, 'clearance.initiate')
           or exists (select 1 from public.clearance_approvals a
                      where a.student_clearance_id = c.id
                        and private.holds_position(a.approver_position_code, a.organization_id,
                                                   a.office_id, a.program_id))));
$$;

-- =============================================================================
-- Workflow
-- =============================================================================
create or replace function public.initiate_student_clearance(p_student_id uuid, p_template_id uuid)
returns public.student_clearances
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_t public.clearance_templates;
  v_student public.students;
  v_program public.programs;
  v_c public.student_clearances;
  v_snapshot jsonb;
  s public.clearance_steps;
  v_approval uuid;
  v_org uuid;
  v_office uuid;
  v_prog uuid;
begin
  select * into v_t from public.clearance_templates where id = p_template_id and status = 'active';
  if not found then
    perform private.fail('TEMPLATE_NOT_FOUND', 'Clearance template not found or not active.');
  end if;
  if not private.has_office_permission(v_t.initiating_office_id, 'clearance.initiate') then
    perform private.fail('FORBIDDEN', 'Your office cannot initiate this clearance.', '42501');
  end if;
  if p_student_id = v_actor then
    perform private.fail('SELF_VERIFICATION', 'You cannot initiate your own clearance.', '42501');
  end if;
  select * into v_student from public.students where profile_id = p_student_id;
  if not found then
    perform private.fail('STUDENT_NOT_FOUND', 'Student not found.');
  end if;
  select * into v_program from public.programs where id = v_student.program_id;
  if not exists (select 1 from public.clearance_steps where template_id = p_template_id) then
    perform private.fail('TEMPLATE_EMPTY', 'The template has no steps.');
  end if;
  if exists (select 1 from public.clearance_steps
             where template_id = p_template_id and approver_scope = 'student_department_organization')
     and v_program.organization_mapping_status <> 'confirmed' then
    perform private.fail('DEPARTMENT_ORGANIZATION_UNCONFIRMED',
      format('Program %s has no confirmed department organization. An administrator must configure it first.',
             v_program.code));
  end if;

  select jsonb_build_object(
           'template', to_jsonb(v_t),
           'steps', coalesce(jsonb_agg(to_jsonb(st) || jsonb_build_object(
                      'requirements', (select coalesce(jsonb_agg(to_jsonb(cr) order by cr.requirement_key), '[]')
                                         from public.clearance_requirements cr where cr.step_id = st.id))
                    order by st.sequence, st.step_key), '[]'))
    into v_snapshot
    from public.clearance_steps st where st.template_id = p_template_id;

  insert into public.student_clearances (student_id, template_id, academic_year_id, template_snapshot, initiated_by)
  values (p_student_id, p_template_id, v_t.academic_year_id, v_snapshot, v_actor)
  returning * into v_c;

  for s in select * from public.clearance_steps where template_id = p_template_id order by sequence, step_key loop
    v_org := null; v_office := null; v_prog := null;
    case s.approver_scope
      when 'fixed_organization' then v_org := s.fixed_organization_id;
      when 'fixed_office' then v_office := s.fixed_office_id;
      when 'student_department_organization' then v_org := v_program.department_organization_id;
      when 'student_program' then v_prog := v_program.id;
    end case;
    insert into public.clearance_approvals
      (student_clearance_id, step_id, step_key, step_name, sequence, approver_position_code,
       organization_id, office_id, program_id)
    values (v_c.id, s.id, s.step_key, s.name, s.sequence, s.approver_position_code, v_org, v_office, v_prog)
    returning id into v_approval;
    insert into public.clearance_requirement_status (student_clearance_id, approval_id, requirement_id, requirement_key)
    select v_c.id, v_approval, cr.id, cr.requirement_key from public.clearance_requirements cr where cr.step_id = s.id;
  end loop;

  perform private.refresh_clearance_requirements(v_c.id);
  insert into public.clearance_history (student_clearance_id, event_type, actor_id)
  values (v_c.id, 'initiated', v_actor);
  perform private.notify(p_student_id, 'clearance', 'Clearance initiated',
    format('Your clearance %s has been initiated.', v_c.clearance_number));
  return v_c;
end;
$$;

-- Re-checks requirements (e.g. after a receipt is verified) and returns them.
create or replace function public.evaluate_student_clearance(p_clearance_id uuid)
returns setof public.clearance_requirement_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  if not private.can_view_clearance(p_clearance_id) then
    perform private.fail('CLEARANCE_NOT_FOUND', 'Clearance not found.');
  end if;
  if exists (select 1 from public.student_clearances where id = p_clearance_id and status = 'in_progress') then
    perform private.refresh_clearance_requirements(p_clearance_id);
    insert into public.clearance_history (student_clearance_id, event_type, actor_id)
    values (p_clearance_id, 'evaluated', v_actor);
  end if;
  return query select * from public.clearance_requirement_status where student_clearance_id = p_clearance_id
               order by requirement_key;
end;
$$;

create or replace function public.approve_clearance_step(p_approval_id uuid, p_remarks text default null)
returns public.clearance_approvals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_a public.clearance_approvals;
  v_c public.student_clearances;
  v_ok boolean;
begin
  select * into v_a from public.clearance_approvals where id = p_approval_id;
  if not found then
    perform private.fail('APPROVAL_NOT_FOUND', 'Clearance step not found.');
  end if;
  -- Lock the clearance so parallel approvals complete it exactly once.
  select * into v_c from public.student_clearances where id = v_a.student_clearance_id for update;
  select * into v_a from public.clearance_approvals where id = p_approval_id for update;

  if v_c.student_id = v_actor then
    perform private.fail('SELF_VERIFICATION', 'You cannot approve your own clearance.', '42501');
  end if;
  if not (private.holds_position(v_a.approver_position_code, v_a.organization_id, v_a.office_id, v_a.program_id)
          and (   (v_a.organization_id is not null and private.has_org_permission(v_a.organization_id, 'clearance.approve'))
               or (v_a.office_id is not null and private.has_office_permission(v_a.office_id, 'clearance.approve'))
               or (v_a.program_id is not null and private.has_program_permission(v_a.program_id, 'clearance.approve')))) then
    perform private.fail('FORBIDDEN', 'You are not the approver for this clearance step.', '42501');
  end if;
  if v_c.status <> 'in_progress' then
    perform private.fail('INVALID_STATE', 'This clearance is not in progress.');
  end if;
  if v_a.status = 'approved' then
    perform private.fail('INVALID_STATE', 'This step is already approved.');
  end if;
  if exists (select 1 from public.clearance_approvals
             where student_clearance_id = v_c.id and sequence < v_a.sequence and status <> 'approved') then
    perform private.fail('PREVIOUS_STEPS_PENDING', 'Earlier clearance steps must be approved first.');
  end if;

  v_ok := private.refresh_clearance_requirements(v_c.id, p_approval_id);
  if not v_ok then
    perform private.fail('CLEARANCE_REQUIREMENTS_NOT_MET',
      'Some requirements for this step are not satisfied. Review the requirement status.');
  end if;

  update public.clearance_approvals
     set status = 'approved', acted_by = v_actor, acted_at = now(), remarks = p_remarks
   where id = p_approval_id returning * into v_a;
  insert into public.clearance_history (student_clearance_id, approval_id, event_type, actor_id, details)
  values (v_c.id, p_approval_id, 'approved', v_actor, jsonb_build_object('step_key', v_a.step_key));
  perform private.notify(v_c.student_id, 'clearance', 'Clearance step approved',
    format('%s approved your clearance step.', v_a.step_name));

  if not exists (select 1 from public.clearance_approvals
                 where student_clearance_id = v_c.id and status <> 'approved') then
    update public.student_clearances set status = 'completed', completed_at = now() where id = v_c.id;
    insert into public.clearance_history (student_clearance_id, event_type, actor_id)
    values (v_c.id, 'completed', v_actor);
    perform private.notify(v_c.student_id, 'clearance', 'Clearance completed',
      format('Your clearance %s is complete.', v_c.clearance_number));
  end if;
  return v_a;
end;
$$;

create or replace function public.return_clearance_step(p_approval_id uuid, p_remarks text)
returns public.clearance_approvals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_a public.clearance_approvals;
  v_c public.student_clearances;
begin
  select * into v_a from public.clearance_approvals where id = p_approval_id for update;
  if not found or not private.holds_position(v_a.approver_position_code, v_a.organization_id,
                                             v_a.office_id, v_a.program_id) then
    perform private.fail('APPROVAL_NOT_FOUND', 'Clearance step not found.');
  end if;
  select * into v_c from public.student_clearances where id = v_a.student_clearance_id;
  if v_c.student_id = v_actor then
    perform private.fail('SELF_VERIFICATION', 'You cannot act on your own clearance.', '42501');
  end if;
  if v_c.status <> 'in_progress' or v_a.status <> 'pending' then
    perform private.fail('INVALID_STATE', 'Only a pending step can be returned.');
  end if;
  if p_remarks is null or length(trim(p_remarks)) = 0 then
    perform private.fail('REASON_REQUIRED', 'Tell the student what to complete.');
  end if;
  update public.clearance_approvals
     set status = 'returned', acted_by = v_actor, acted_at = now(), remarks = p_remarks
   where id = p_approval_id returning * into v_a;
  insert into public.clearance_history (student_clearance_id, approval_id, event_type, actor_id, details)
  values (v_c.id, p_approval_id, 'returned', v_actor, jsonb_build_object('remarks', p_remarks));
  perform private.notify(v_c.student_id, 'clearance', 'Clearance step returned',
    format('%s: %s', v_a.step_name, p_remarks));
  return v_a;
end;
$$;

create or replace function public.cancel_student_clearance(p_clearance_id uuid, p_reason text)
returns public.student_clearances
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_c public.student_clearances;
  v_office uuid;
begin
  select * into v_c from public.student_clearances where id = p_clearance_id for update;
  select initiating_office_id into v_office from public.clearance_templates where id = v_c.template_id;
  if v_c.id is null or not private.has_office_permission(v_office, 'clearance.initiate') then
    perform private.fail('CLEARANCE_NOT_FOUND', 'Clearance not found.');
  end if;
  if v_c.status <> 'in_progress' then
    perform private.fail('INVALID_STATE', 'Only an in-progress clearance can be cancelled.');
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    perform private.fail('REASON_REQUIRED', 'A reason is required.');
  end if;
  update public.student_clearances
     set status = 'cancelled', cancelled_by = v_actor, cancelled_at = now(), cancel_reason = p_reason
   where id = p_clearance_id returning * into v_c;
  insert into public.clearance_history (student_clearance_id, event_type, actor_id, details)
  values (p_clearance_id, 'cancelled', v_actor, jsonb_build_object('reason', p_reason));
  return v_c;
end;
$$;
