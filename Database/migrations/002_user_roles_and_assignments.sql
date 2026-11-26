-- =============================================================================
-- CampusServe 002: user roles, positions, permissions and scoped assignments
--
-- Five system roles (student, office_staff, administrator, cashier,
-- department_head) describe the kind of account. Operational authority
-- (SSG Governor, Treasurer, Guidance Staff, SAS Head, Program Head, ...) comes
-- from ASSIGNMENTS: a position held in one organization, office, program or
-- department for one academic year. Positions and their permissions are data,
-- not hardcoded roles.
-- =============================================================================

create table public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null check (role in
                ('student', 'office_staff', 'administrator', 'cashier', 'department_head')),
  granted_by  uuid references public.profiles (id) on delete set null,
  granted_at  timestamptz not null default now(),
  unique (user_id, role)
);
create index user_roles_role_idx on public.user_roles (role);

-- -----------------------------------------------------------------------------
-- Permission catalog
-- -----------------------------------------------------------------------------
create table public.permissions (
  code         text primary key check (code ~ '^[a-z_]+\.[a-z_]+$'),
  description  text not null
);

create table public.positions (
  code         text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  scope        text not null check (scope in ('organization', 'office', 'academic')),
  name         text not null,
  description  text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.position_permissions (
  position_code    text not null references public.positions (code) on delete cascade,
  permission_code  text not null references public.permissions (code) on delete cascade,
  primary key (position_code, permission_code)
);

-- Campus-wide permissions that come from a system role (administrator, cashier).
create table public.role_permissions (
  role             text not null check (role in
                     ('student', 'office_staff', 'administrator', 'cashier', 'department_head')),
  permission_code  text not null references public.permissions (code) on delete cascade,
  primary key (role, permission_code)
);

-- -----------------------------------------------------------------------------
-- Assignments
-- -----------------------------------------------------------------------------
create table public.office_staff (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  office_id         uuid not null references public.offices (id) on delete cascade,
  position_code     text not null references public.positions (code),
  academic_year_id  uuid not null references public.academic_years (id),
  is_active         boolean not null default true,
  assigned_by       uuid references public.profiles (id) on delete set null,
  assigned_at       timestamptz not null default now(),
  revoked_at        timestamptz,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, office_id, position_code, academic_year_id)
);
create index office_staff_office_idx on public.office_staff (office_id, academic_year_id) where is_active;

create table public.organization_assignments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  position_code     text not null references public.positions (code),
  academic_year_id  uuid not null references public.academic_years (id),
  -- Optional narrower scope, used by class officers (batch remittance).
  program_id        uuid references public.programs (id) on delete cascade,
  section           text,
  is_active         boolean not null default true,
  assigned_by       uuid references public.profiles (id) on delete set null,
  assigned_at       timestamptz not null default now(),
  revoked_at        timestamptz,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint organization_assignments_section_chk check (section is null or program_id is not null)
);
create unique index organization_assignments_unique_idx on public.organization_assignments (
  user_id, organization_id, position_code, academic_year_id,
  coalesce(program_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(section, ''));
create index organization_assignments_org_idx
  on public.organization_assignments (organization_id, academic_year_id) where is_active;

-- Program Heads and Department Heads.
create table public.academic_assignments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  position_code     text not null references public.positions (code),
  academic_year_id  uuid not null references public.academic_years (id),
  program_id        uuid references public.programs (id) on delete cascade,
  department_id     uuid references public.departments (id) on delete cascade,
  is_active         boolean not null default true,
  assigned_by       uuid references public.profiles (id) on delete set null,
  assigned_at       timestamptz not null default now(),
  revoked_at        timestamptz,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint academic_assignments_one_scope_chk check (num_nonnulls(program_id, department_id) = 1)
);
create unique index academic_assignments_unique_idx on public.academic_assignments (
  user_id, position_code, academic_year_id,
  coalesce(program_id, department_id));

-- Club / organization membership (used for club receipt applicability).
create table public.organization_members (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  student_id        uuid not null references public.students (profile_id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years (id),
  status            text not null default 'active' check (status in ('active', 'inactive')),
  joined_on         date not null default current_date,
  recorded_by       uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, student_id, academic_year_id)
);
create index organization_members_student_idx on public.organization_members (student_id, academic_year_id);

-- An assignment's position must belong to the table's scope.
create or replace function private.check_position_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_expected text := tg_argv[0];
begin
  if not exists (select 1 from public.positions p
                 where p.code = new.position_code and p.scope = v_expected and p.is_active) then
    perform private.fail('INVALID_POSITION_SCOPE',
      format('Position %s is not an active %s position.', new.position_code, v_expected));
  end if;
  return new;
end;
$$;
create trigger office_staff_scope before insert or update on public.office_staff
  for each row execute function private.check_position_scope('office');
create trigger organization_assignments_scope before insert or update on public.organization_assignments
  for each row execute function private.check_position_scope('organization');
create trigger academic_assignments_scope before insert or update on public.academic_assignments
  for each row execute function private.check_position_scope('academic');

-- -----------------------------------------------------------------------------
-- New Supabase Auth users get a profile and the student role.
-- The role is never taken from user-supplied metadata.
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role)
  values (new.id, 'student')
  on conflict (user_id, role) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_auth_user();

-- =============================================================================
-- Authorization helpers. All of them use auth.uid(): they answer "may the
-- CURRENT caller ...", never "may some other user ...". Assignments count only
-- when active, in the current academic year, and when the profile is active.
-- =============================================================================

create or replace function private.current_academic_year_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.academic_years where is_current limit 1;
$$;

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active);
$$;

create or replace function private.has_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id and p.is_active
    where ur.user_id = auth.uid() and ur.role = p_role);
$$;

create or replace function private.has_global_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    join public.profiles p on p.id = ur.user_id and p.is_active
    where ur.user_id = auth.uid() and rp.permission_code = p_permission);
$$;

create or replace function private.has_org_permission(p_organization_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_assignments a
    join public.position_permissions pp on pp.position_code = a.position_code
    join public.positions pos on pos.code = a.position_code and pos.is_active
    join public.academic_years ay on ay.id = a.academic_year_id and ay.is_current
    join public.profiles p on p.id = a.user_id and p.is_active
    where a.user_id = auth.uid()
      and a.is_active
      and a.organization_id = p_organization_id
      and pp.permission_code = p_permission);
$$;

create or replace function private.has_office_permission(p_office_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.office_staff s
    join public.position_permissions pp on pp.position_code = s.position_code
    join public.positions pos on pos.code = s.position_code and pos.is_active
    join public.academic_years ay on ay.id = s.academic_year_id and ay.is_current
    join public.profiles p on p.id = s.user_id and p.is_active
    where s.user_id = auth.uid()
      and s.is_active
      and s.office_id = p_office_id
      and pp.permission_code = p_permission);
$$;

-- Program-scoped permission; a department-level assignment covers every
-- program in that department.
create or replace function private.has_program_permission(p_program_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.academic_assignments a
    join public.position_permissions pp on pp.position_code = a.position_code
    join public.positions pos on pos.code = a.position_code and pos.is_active
    join public.academic_years ay on ay.id = a.academic_year_id and ay.is_current
    join public.profiles p on p.id = a.user_id and p.is_active
    left join public.programs prg on prg.id = p_program_id
    where a.user_id = auth.uid()
      and a.is_active
      and pp.permission_code = p_permission
      and (a.program_id = p_program_id
           or (a.department_id is not null and a.department_id = prg.department_id)));
$$;

-- Does the caller hold a specific position at a specific scope (used for
-- clearance approval, where the template names the approving position)?
create or replace function private.holds_position(
  p_position_code text, p_organization_id uuid, p_office_id uuid, p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.organization_assignments a
      join public.academic_years ay on ay.id = a.academic_year_id and ay.is_current
      join public.profiles p on p.id = a.user_id and p.is_active
      where a.user_id = auth.uid() and a.is_active
        and a.position_code = p_position_code
        and a.organization_id = p_organization_id)
    or exists (
      select 1 from public.office_staff s
      join public.academic_years ay on ay.id = s.academic_year_id and ay.is_current
      join public.profiles p on p.id = s.user_id and p.is_active
      where s.user_id = auth.uid() and s.is_active
        and s.position_code = p_position_code
        and s.office_id = p_office_id)
    or exists (
      select 1 from public.academic_assignments a
      join public.academic_years ay on ay.id = a.academic_year_id and ay.is_current
      join public.profiles p on p.id = a.user_id and p.is_active
      left join public.programs prg on prg.id = p_program_id
      where a.user_id = auth.uid() and a.is_active
        and a.position_code = p_position_code
        and (a.program_id = p_program_id
             or (a.department_id is not null and a.department_id = prg.department_id)));
$$;

-- Who may see a student's identity and academic data?
create or replace function private.can_view_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user() and (
    p_student_id = auth.uid()
    or private.has_global_permission('records.view_all')
    -- office staff who serve students
    or exists (
      select 1 from public.office_staff s
      join public.position_permissions pp on pp.position_code = s.position_code
                                          and pp.permission_code = 'students.view'
      join public.academic_years ay on ay.id = s.academic_year_id and ay.is_current
      join public.profiles p on p.id = s.user_id and p.is_active
      where s.user_id = auth.uid() and s.is_active)
    -- program / department heads for their programs
    or exists (
      select 1 from public.students st
      where st.profile_id = p_student_id
        and private.has_program_permission(st.program_id, 'students.view'))
    -- officers of a student government (serves every student)
    or exists (
      select 1 from public.organization_assignments a
      join public.organizations o on o.id = a.organization_id
                                 and o.organization_type = 'student_government'
      join public.position_permissions pp on pp.position_code = a.position_code
                                          and pp.permission_code = 'students.view'
      join public.academic_years ay on ay.id = a.academic_year_id and ay.is_current
      join public.profiles p on p.id = a.user_id and p.is_active
      where a.user_id = auth.uid() and a.is_active)
    -- officers of the student's confirmed department organization
    or exists (
      select 1 from public.students st
      join public.programs prg on prg.id = st.program_id
                              and prg.organization_mapping_status = 'confirmed'
      where st.profile_id = p_student_id
        and private.has_org_permission(prg.department_organization_id, 'students.view'))
    -- officers of a club or organization the student belongs to
    or exists (
      select 1 from public.organization_members m
      where m.student_id = p_student_id
        and m.status = 'active'
        and m.academic_year_id = private.current_academic_year_id()
        and private.has_org_permission(m.organization_id, 'students.view')));
$$;

-- Fails unless there is an authenticated, active caller; returns their id.
create or replace function private.require_actor()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    perform private.fail('NOT_AUTHENTICATED', 'Sign in to continue.', '42501');
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and is_active) then
    perform private.fail('ACCOUNT_INACTIVE', 'This account is inactive.', '42501');
  end if;
  return v_uid;
end;
$$;

create or replace function private.require_current_academic_year()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ay uuid := private.current_academic_year_id();
begin
  if v_ay is null then
    perform private.fail('NO_CURRENT_ACADEMIC_YEAR', 'No academic year is marked as current.');
  end if;
  return v_ay;
end;
$$;

-- =============================================================================
-- Permission and position catalog (system configuration, not sample data)
-- =============================================================================
insert into public.permissions (code, description) values
  -- campus-wide (granted to system roles)
  ('records.view_all',       'Read every record campus-wide (administrators).'),
  ('users.manage',           'Create accounts, grant roles and assignments.'),
  ('config.manage',          'Manage reference data, policies, templates and settings.'),
  ('audit.view',             'Read the audit log.'),
  ('reports.view_all',       'View campus-wide reports.'),
  ('payments.view_all',      'View every digital payment and reconciliation record.'),
  ('payments.view_webhooks', 'View raw payment provider webhook events.'),
  -- shared
  ('students.view',          'View student identity and academic data within scope.'),
  ('reports.view',           'View reports within scope.'),
  ('clearance.approve',      'Approve a clearance step assigned to the held position.'),
  -- organization scoped
  ('org.view_members',       'View organization members and officers.'),
  ('org.manage_members',     'Add or remove organization members.'),
  ('receipts.view',          'View organization receipts.'),
  ('receipts.record',        'Record an individual remittance receipt.'),
  ('receipts.verify',        'Verify individual receipts and batch allocations.'),
  ('remittance.create',      'Create and submit batch remittances (class officer).'),
  ('remittance.review',      'Review batch remittances.'),
  ('violations.view',        'View violation records.'),
  ('violations.report',      'Report a violation.'),
  ('violations.review',      'Verify or reject reported violations.'),
  ('disputes.decide',        'Decide violation disputes.'),
  ('penalties.view',         'View penalty assessments and resolutions.'),
  ('penalties.assess',       'Generate penalty assessments from verified violations.'),
  ('penalties.verify_service','Verify community service completion.'),
  ('payments.verify',        'Verify the organization''s penalty payments.'),
  ('payments.reconcile',     'Reconcile the organization''s penalty payments.'),
  -- office scoped
  ('queue.manage',           'Manage queue schedules, slots and tickets.'),
  ('requests.manage',        'Process service and document requests.'),
  ('clearance.initiate',     'Initiate and cancel student clearances.'),
  ('guidance.manage',        'Record teacher evaluations and issue guidance slips.'),
  ('library.manage',         'Validate library IDs, verify library receipts, issue library slips.');

insert into public.positions (code, scope, name, description) values
  ('governor',          'organization', 'Governor',           'Head of the student government (e.g. SSG Governor).'),
  ('mayor',             'organization', 'Mayor',              'Head of a department organization.'),
  ('president',         'organization', 'President',          'Head of a club.'),
  ('treasurer',         'organization', 'Treasurer',          'Organization or club treasurer.'),
  ('class_officer',     'organization', 'Class Officer',      'Collects receipts for an organization through batch remittance.'),
  ('violation_officer', 'organization', 'Violation Officer',  'Reports violations for an organization.'),
  ('sas_staff',         'office',       'SAS Staff',          'Student Affairs and Services staff.'),
  ('sas_head',          'office',       'SAS Head',           'Head of Student Affairs and Services.'),
  ('guidance_staff',    'office',       'Guidance Staff',     'Guidance office staff.'),
  ('library_staff',     'office',       'Library Staff',      'Library staff.'),
  ('office_staff',      'office',       'Office Staff',       'General staff of any office.'),
  ('office_head',       'office',       'Office Head',        'Head of any office.'),
  ('program_head',      'academic',     'Program Head',       'Head of an academic program.'),
  ('department_head',   'academic',     'Department Head',    'Head of an academic department.');

insert into public.position_permissions (position_code, permission_code) values
  ('governor','students.view'), ('governor','org.view_members'), ('governor','org.manage_members'),
  ('governor','receipts.view'), ('governor','violations.view'), ('governor','violations.report'),
  ('governor','violations.review'), ('governor','disputes.decide'), ('governor','penalties.view'),
  ('governor','penalties.assess'), ('governor','penalties.verify_service'), ('governor','clearance.approve'),
  ('mayor','students.view'), ('mayor','org.view_members'), ('mayor','org.manage_members'),
  ('mayor','receipts.view'), ('mayor','violations.view'), ('mayor','violations.report'),
  ('mayor','violations.review'), ('mayor','disputes.decide'), ('mayor','penalties.view'),
  ('mayor','penalties.assess'), ('mayor','penalties.verify_service'), ('mayor','clearance.approve'),
  ('president','students.view'), ('president','org.view_members'), ('president','org.manage_members'),
  ('president','receipts.view'), ('president','violations.view'), ('president','violations.report'),
  ('treasurer','students.view'), ('treasurer','org.view_members'), ('treasurer','receipts.view'),
  ('treasurer','receipts.record'), ('treasurer','receipts.verify'), ('treasurer','remittance.review'),
  ('treasurer','penalties.view'), ('treasurer','payments.verify'), ('treasurer','payments.reconcile'),
  ('class_officer','remittance.create'),
  ('violation_officer','violations.view'), ('violation_officer','violations.report'),
  ('sas_staff','students.view'), ('sas_staff','queue.manage'), ('sas_staff','requests.manage'),
  ('sas_staff','clearance.initiate'),
  ('sas_head','students.view'), ('sas_head','queue.manage'), ('sas_head','requests.manage'),
  ('sas_head','clearance.initiate'), ('sas_head','clearance.approve'), ('sas_head','reports.view'),
  ('guidance_staff','students.view'), ('guidance_staff','queue.manage'),
  ('guidance_staff','requests.manage'), ('guidance_staff','guidance.manage'),
  ('library_staff','students.view'), ('library_staff','queue.manage'),
  ('library_staff','requests.manage'), ('library_staff','library.manage'),
  ('office_staff','students.view'), ('office_staff','queue.manage'), ('office_staff','requests.manage'),
  ('office_head','students.view'), ('office_head','queue.manage'), ('office_head','requests.manage'),
  ('office_head','reports.view'),
  ('program_head','students.view'), ('program_head','clearance.approve'), ('program_head','reports.view'),
  ('department_head','students.view'), ('department_head','reports.view');

-- Administrators manage and read, but hold no approval or verification power.
insert into public.role_permissions (role, permission_code) values
  ('administrator','records.view_all'), ('administrator','users.manage'),
  ('administrator','config.manage'), ('administrator','audit.view'),
  ('administrator','reports.view_all'), ('administrator','payments.view_all'),
  ('administrator','payments.view_webhooks'),
  ('cashier','payments.view_all');
