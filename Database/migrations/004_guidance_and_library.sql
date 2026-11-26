-- =============================================================================
-- CampusServe 004: Guidance and Library requirements
--
--   * Guidance: teacher evaluations must be completed before a guidance
--     clearance slip can be issued (enforced by a CHECK constraint).
--   * Library: library ID validated for the academic year, library receipt
--     verified, library clearance slip issued. Which items must be complete
--     before the slip is issued is configurable via system setting
--     'library.slip_prerequisites'.
--   * Guidance and Library are independent tables, so they can be completed in
--     parallel; the clearance template decides how they are checked.
-- =============================================================================

create table public.guidance_records (
  id                         uuid primary key default gen_random_uuid(),
  student_id                 uuid not null references public.students (profile_id) on delete cascade,
  academic_year_id           uuid not null references public.academic_years (id),
  office_id                  uuid not null references public.offices (id),
  teacher_evaluations_status text not null default 'pending'
                               check (teacher_evaluations_status in ('pending', 'completed')),
  evaluations_confirmed_by   uuid references public.profiles (id),
  evaluations_confirmed_at   timestamptz,
  slip_status                text not null default 'not_issued'
                               check (slip_status in ('not_issued', 'issued', 'revoked')),
  slip_number                text unique,
  slip_issued_by             uuid references public.profiles (id),
  slip_issued_at             timestamptz,
  remarks                    text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (student_id, academic_year_id),
  constraint guidance_slip_requires_evaluations_chk check (
    slip_status <> 'issued' or teacher_evaluations_status = 'completed'),
  constraint guidance_slip_fields_chk check (
    slip_status <> 'issued' or (slip_number is not null and slip_issued_by is not null)),
  constraint guidance_not_self_chk check (
    evaluations_confirmed_by is distinct from student_id and slip_issued_by is distinct from student_id)
);
create index guidance_records_office_idx on public.guidance_records (office_id, academic_year_id);

create table public.library_records (
  id                     uuid primary key default gen_random_uuid(),
  student_id             uuid not null references public.students (profile_id) on delete cascade,
  academic_year_id       uuid not null references public.academic_years (id),
  office_id              uuid not null references public.offices (id),
  library_id_number      text,
  id_validation_status   text not null default 'pending'
                           check (id_validation_status in ('pending', 'validated', 'rejected')),
  id_validated_by        uuid references public.profiles (id),
  id_validated_at        timestamptz,
  receipt_status         text not null default 'pending'
                           check (receipt_status in ('pending', 'verified', 'rejected')),
  receipt_number         text,
  receipt_amount         numeric(10, 2) check (receipt_amount is null or receipt_amount >= 0),
  receipt_verified_by    uuid references public.profiles (id),
  receipt_verified_at    timestamptz,
  slip_status            text not null default 'not_issued'
                           check (slip_status in ('not_issued', 'issued', 'revoked')),
  slip_number            text unique,
  slip_issued_by         uuid references public.profiles (id),
  slip_issued_at         timestamptz,
  remarks                text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (student_id, academic_year_id),
  constraint library_validated_has_id_chk check (
    id_validation_status <> 'validated' or library_id_number is not null),
  constraint library_receipt_has_number_chk check (
    receipt_status <> 'verified' or receipt_number is not null),
  constraint library_slip_fields_chk check (
    slip_status <> 'issued' or (slip_number is not null and slip_issued_by is not null)),
  constraint library_not_self_chk check (
    id_validated_by is distinct from student_id
    and receipt_verified_by is distinct from student_id
    and slip_issued_by is distinct from student_id)
);
create index library_records_office_idx on public.library_records (office_id, academic_year_id);

-- Library slip prerequisites come from configuration.
create or replace function private.check_library_slip_prerequisites()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_prereqs jsonb;
begin
  if new.slip_status = 'issued' and (tg_op = 'INSERT' or old.slip_status is distinct from 'issued') then
    select value into v_prereqs from public.system_settings where key = 'library.slip_prerequisites';
    v_prereqs := coalesce(v_prereqs, '[]'::jsonb);
    if v_prereqs ? 'id_validation' and new.id_validation_status <> 'validated' then
      perform private.fail('PREREQUISITE_INCOMPLETE', 'The library ID must be validated first.');
    end if;
    if v_prereqs ? 'receipt' and new.receipt_status <> 'verified' then
      perform private.fail('PREREQUISITE_INCOMPLETE', 'The library receipt must be verified first.');
    end if;
  end if;
  return new;
end;
$$;
create trigger library_records_slip_prerequisites before insert or update on public.library_records
  for each row execute function private.check_library_slip_prerequisites();

create sequence public.guidance_slip_seq;
create sequence public.library_slip_seq;

-- Returns the caller's record for the student in the current academic year,
-- creating it if needed, after checking the caller's office permission.
create or replace function private.guidance_record_for_update(p_student_id uuid, p_office_id uuid)
returns public.guidance_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ay uuid := private.require_current_academic_year();
  v_rec public.guidance_records;
begin
  if not private.has_office_permission(p_office_id, 'guidance.manage') then
    perform private.fail('FORBIDDEN', 'You cannot manage guidance records for this office.', '42501');
  end if;
  if p_student_id = auth.uid() then
    perform private.fail('SELF_VERIFICATION', 'You cannot update your own guidance record.', '42501');
  end if;
  if not exists (select 1 from public.students where profile_id = p_student_id) then
    perform private.fail('STUDENT_NOT_FOUND', 'Student not found.');
  end if;
  insert into public.guidance_records (student_id, academic_year_id, office_id)
  values (p_student_id, v_ay, p_office_id)
  on conflict (student_id, academic_year_id) do nothing;
  select * into v_rec from public.guidance_records
   where student_id = p_student_id and academic_year_id = v_ay for update;
  return v_rec;
end;
$$;

create or replace function public.confirm_teacher_evaluations(
  p_student_id uuid, p_office_id uuid, p_remarks text default null)
returns public.guidance_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_rec public.guidance_records := private.guidance_record_for_update(p_student_id, p_office_id);
begin
  update public.guidance_records
     set teacher_evaluations_status = 'completed', evaluations_confirmed_by = v_actor,
         evaluations_confirmed_at = now(), remarks = coalesce(p_remarks, remarks)
   where id = v_rec.id returning * into v_rec;
  return v_rec;
end;
$$;

create or replace function public.issue_guidance_slip(p_student_id uuid, p_office_id uuid)
returns public.guidance_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_rec public.guidance_records := private.guidance_record_for_update(p_student_id, p_office_id);
begin
  if v_rec.teacher_evaluations_status <> 'completed' then
    perform private.fail('PREREQUISITE_INCOMPLETE',
      'Teacher evaluations must be completed before the guidance slip is issued.');
  end if;
  if v_rec.slip_status = 'issued' then
    return v_rec;
  end if;
  update public.guidance_records
     set slip_status = 'issued',
         slip_number = 'GS-' || lpad(nextval('public.guidance_slip_seq')::text, 7, '0'),
         slip_issued_by = v_actor, slip_issued_at = now()
   where id = v_rec.id returning * into v_rec;
  perform private.notify(p_student_id, 'guidance', 'Guidance slip issued',
    format('Your guidance clearance slip %s has been issued.', v_rec.slip_number));
  return v_rec;
end;
$$;

create or replace function private.library_record_for_update(p_student_id uuid, p_office_id uuid)
returns public.library_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ay uuid := private.require_current_academic_year();
  v_rec public.library_records;
begin
  if not private.has_office_permission(p_office_id, 'library.manage') then
    perform private.fail('FORBIDDEN', 'You cannot manage library records for this office.', '42501');
  end if;
  if p_student_id = auth.uid() then
    perform private.fail('SELF_VERIFICATION', 'You cannot update your own library record.', '42501');
  end if;
  if not exists (select 1 from public.students where profile_id = p_student_id) then
    perform private.fail('STUDENT_NOT_FOUND', 'Student not found.');
  end if;
  insert into public.library_records (student_id, academic_year_id, office_id)
  values (p_student_id, v_ay, p_office_id)
  on conflict (student_id, academic_year_id) do nothing;
  select * into v_rec from public.library_records
   where student_id = p_student_id and academic_year_id = v_ay for update;
  return v_rec;
end;
$$;

create or replace function public.validate_library_id(
  p_student_id uuid, p_office_id uuid, p_library_id_number text, p_decision text, p_remarks text default null)
returns public.library_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_rec public.library_records := private.library_record_for_update(p_student_id, p_office_id);
begin
  if p_decision not in ('validated', 'rejected') then
    perform private.fail('INVALID_DECISION', 'Decision must be validated or rejected.');
  end if;
  update public.library_records
     set library_id_number = coalesce(nullif(trim(p_library_id_number), ''), library_id_number),
         id_validation_status = p_decision, id_validated_by = v_actor, id_validated_at = now(),
         remarks = coalesce(p_remarks, remarks)
   where id = v_rec.id returning * into v_rec;
  return v_rec;
end;
$$;

create or replace function public.verify_library_receipt(
  p_student_id uuid, p_office_id uuid, p_receipt_number text, p_amount numeric, p_decision text,
  p_remarks text default null)
returns public.library_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_rec public.library_records := private.library_record_for_update(p_student_id, p_office_id);
begin
  if p_decision not in ('verified', 'rejected') then
    perform private.fail('INVALID_DECISION', 'Decision must be verified or rejected.');
  end if;
  update public.library_records
     set receipt_number = coalesce(nullif(trim(p_receipt_number), ''), receipt_number),
         receipt_amount = coalesce(p_amount, receipt_amount),
         receipt_status = p_decision, receipt_verified_by = v_actor, receipt_verified_at = now(),
         remarks = coalesce(p_remarks, remarks)
   where id = v_rec.id returning * into v_rec;
  return v_rec;
end;
$$;

create or replace function public.issue_library_slip(p_student_id uuid, p_office_id uuid)
returns public.library_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_rec public.library_records := private.library_record_for_update(p_student_id, p_office_id);
begin
  if v_rec.slip_status = 'issued' then
    return v_rec;
  end if;
  -- prerequisite trigger enforces the configured requirements
  update public.library_records
     set slip_status = 'issued',
         slip_number = 'LS-' || lpad(nextval('public.library_slip_seq')::text, 7, '0'),
         slip_issued_by = v_actor, slip_issued_at = now()
   where id = v_rec.id returning * into v_rec;
  perform private.notify(p_student_id, 'library', 'Library slip issued',
    format('Your library clearance slip %s has been issued.', v_rec.slip_number));
  return v_rec;
end;
$$;
