-- =============================================================================
-- CampusServe 001: initial schema
-- Core reference data (academic years, departments, organizations, clubs,
-- programs, offices), identity (profiles, students), system settings,
-- notifications and the append-only audit log.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
comment on schema private is
  'CampusServe internal helpers. Not exposed through the Data API.';

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Raises a business-rule error. The message is a stable machine-readable code
-- that the backend maps to an HTTP status; the hint is the human explanation.
create or replace function private.fail(p_code text, p_message text, p_errcode text default 'P0001')
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = p_errcode, message = p_code, hint = p_message;
end;
$$;

-- -----------------------------------------------------------------------------
-- Academic years
-- -----------------------------------------------------------------------------
create table public.academic_years (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[0-9]{4}-[0-9]{4}$'),
  starts_on   date not null,
  ends_on     date not null,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint academic_years_dates_chk check (ends_on > starts_on)
);
create unique index academic_years_single_current_idx
  on public.academic_years (is_current) where is_current;

-- -----------------------------------------------------------------------------
-- Departments
-- -----------------------------------------------------------------------------
create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Organizations (SSG, department organizations, clubs)
-- -----------------------------------------------------------------------------
create table public.organizations (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique check (code ~ '^[A-Z0-9_]+$'),
  name               text not null,
  organization_type  text not null check (organization_type in
                       ('student_government', 'department_organization', 'club', 'other')),
  department_id      uuid references public.departments (id) on delete set null,
  description        text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index organizations_type_idx on public.organizations (organization_type);

-- Club-specific details. One row per organization of type 'club'.
-- Who must hold a club receipt is configured on each receipt obligation
-- (receipt_obligations.applicability), not here, so there is one source of truth.
create table public.clubs (
  organization_id               uuid primary key references public.organizations (id) on delete cascade,
  membership_requires_approval  boolean not null default true,
  adviser_name                  text,
  notes                         text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create or replace function private.check_club_organization()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.organizations o
                 where o.id = new.organization_id and o.organization_type = 'club') then
    perform private.fail('INVALID_CLUB', 'A club row must reference an organization of type club.');
  end if;
  return new;
end;
$$;
create trigger clubs_check_type before insert or update on public.clubs
  for each row execute function private.check_club_organization();

-- -----------------------------------------------------------------------------
-- Programs, with a configurable program -> department organization mapping.
-- A mapping is only used for clearance and receipts when it is 'confirmed'.
-- -----------------------------------------------------------------------------
create table public.programs (
  id                           uuid primary key default gen_random_uuid(),
  code                         text not null unique check (code ~ '^[A-Z0-9_]+$'),
  name                         text not null,
  department_id                uuid references public.departments (id) on delete set null,
  department_organization_id   uuid references public.organizations (id) on delete set null,
  organization_mapping_status  text not null default 'unconfirmed'
                                 check (organization_mapping_status in ('confirmed', 'unconfirmed')),
  organization_mapping_notes   text,
  is_active                    boolean not null default true,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  constraint programs_confirmed_mapping_chk check (
    organization_mapping_status = 'unconfirmed' or department_organization_id is not null)
);
create index programs_department_idx on public.programs (department_id);
create index programs_department_org_idx on public.programs (department_organization_id);

create or replace function private.check_program_mapping()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.department_organization_id is not null and not exists (
       select 1 from public.organizations o
       where o.id = new.department_organization_id
         and o.organization_type = 'department_organization') then
    perform private.fail('INVALID_PROGRAM_MAPPING',
      'A program can only be mapped to an organization of type department_organization.');
  end if;
  return new;
end;
$$;
create trigger programs_check_mapping before insert or update on public.programs
  for each row execute function private.check_program_mapping();

-- -----------------------------------------------------------------------------
-- Offices
-- -----------------------------------------------------------------------------
create table public.offices (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z0-9_]+$'),
  name        text not null,
  description text,
  location    text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Profiles (one per Supabase Auth user) and students
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index profiles_email_lower_idx on public.profiles (lower(email));

create table public.students (
  profile_id         uuid primary key references public.profiles (id) on delete cascade,
  student_number     text not null unique,
  program_id         uuid not null references public.programs (id),
  year_level         smallint not null check (year_level between 1 and 6),
  section            text,
  enrollment_status  text not null default 'enrolled'
                       check (enrollment_status in ('enrolled', 'not_enrolled', 'graduated', 'withdrawn')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index students_program_idx on public.students (program_id, year_level, section);

-- -----------------------------------------------------------------------------
-- System settings (non-secret configuration only; never store keys here)
-- -----------------------------------------------------------------------------
create table public.system_settings (
  key           text primary key check (key ~ '^[a-z0-9_]+(\.[a-z0-9_]+)*$'),
  value         jsonb not null,
  description   text not null,
  is_confirmed  boolean not null default false,
  updated_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  category    text not null,
  title       text not null,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;

create or replace function private.notify(
  p_user_id uuid, p_category text, p_title text, p_body text default null, p_link text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, category, title, body, link)
  values (p_user_id, p_category, p_title, p_body, p_link);
$$;

-- -----------------------------------------------------------------------------
-- Audit log (append-only)
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid,
  action       text not null,
  entity_type  text not null,
  entity_id    text,
  old_data     jsonb,
  new_data     jsonb,
  context      jsonb not null default '{}'::jsonb
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id, occurred_at desc);
create index audit_logs_occurred_idx on public.audit_logs (occurred_at desc);

create or replace function private.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.fail('AUDIT_LOG_IMMUTABLE', 'Audit log entries cannot be changed or deleted.');
  return null;
end;
$$;
create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function private.prevent_audit_mutation();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function private.prevent_audit_mutation();

-- Generic row-change audit trigger, attached to important tables in 009.
create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_data, new_data, context)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'profile_id', v_row ->> 'organization_id', v_row ->> 'key'),
    v_old,
    v_new,
    jsonb_build_object('db_role', current_user)
  );
  return null;
end;
$$;

-- Explicit audit entries written by workflow functions.
create or replace function private.write_audit(
  p_action text, p_entity_type text, p_entity_id text, p_context jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, context)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_context, '{}'::jsonb));
$$;
