-- =============================================================================
-- CampusServe 007: services, service/document requests and online queueing
--
-- Overbooking and duplicate reservations are prevented in the database:
--   * reserve_queue_slot() locks the slot row (SELECT ... FOR UPDATE), checks
--     capacity and increments reserved_count in the same transaction.
--   * CHECK (reserved_count <= capacity) is the last line of defence.
--   * A partial unique index allows one live ticket per student per slot.
--   * queue numbers are unique per slot.
-- =============================================================================

create table public.services (
  id                             uuid primary key default gen_random_uuid(),
  office_id                      uuid not null references public.offices (id) on delete cascade,
  code                           text not null check (code ~ '^[A-Z0-9_]+$'),
  name                           text not null,
  description                    text,
  service_kind                   text not null default 'queue' check (service_kind in ('queue', 'request', 'both')),
  max_active_tickets_per_student integer not null default 1 check (max_active_tickets_per_student between 1 and 10),
  cancellation_cutoff_minutes    integer not null default 30 check (cancellation_cutoff_minutes >= 0),
  allow_reschedule               boolean not null default true,
  required_documents             text[] not null default '{}',
  is_active                      boolean not null default true,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now(),
  unique (office_id, code)
);

create sequence public.service_request_number_seq;

create table public.service_requests (
  id              uuid primary key default gen_random_uuid(),
  request_number  text not null unique
                    default ('REQ-' || lpad(nextval('public.service_request_number_seq')::text, 7, '0')),
  student_id      uuid not null references public.students (profile_id) on delete cascade,
  service_id      uuid not null references public.services (id),
  office_id       uuid not null references public.offices (id),
  purpose         text not null check (length(trim(purpose)) > 0),
  details         text,
  status          text not null default 'submitted'
                    check (status in ('submitted', 'in_review', 'ready_for_release', 'released', 'rejected', 'cancelled')),
  handled_by      uuid references public.profiles (id),
  remarks         text,
  submitted_at    timestamptz not null default now(),
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index service_requests_student_idx on public.service_requests (student_id, created_at desc);
create index service_requests_office_status_idx on public.service_requests (office_id, status);

-- Files live in the private 'request-documents' bucket; this is the index.
create table public.request_documents (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references public.service_requests (id) on delete cascade,
  storage_bucket  text not null default 'request-documents',
  storage_path    text not null unique,
  file_name       text not null,
  mime_type       text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes      integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by     uuid not null references public.profiles (id),
  created_at      timestamptz not null default now()
);
create index request_documents_request_idx on public.request_documents (request_id);

create table public.request_status_history (
  id           bigint generated always as identity primary key,
  request_id   uuid not null references public.service_requests (id) on delete cascade,
  from_status  text,
  to_status    text not null,
  changed_by   uuid references public.profiles (id),
  remarks      text,
  changed_at   timestamptz not null default now()
);
create index request_status_history_request_idx on public.request_status_history (request_id, changed_at);

create or replace function private.log_request_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.request_status_history (request_id, from_status, to_status, changed_by, remarks)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid(), new.remarks);
  end if;
  return null;
end;
$$;
create trigger service_requests_status_history after insert or update of status on public.service_requests
  for each row execute function private.log_request_status();

create table public.queue_schedules (
  id                 uuid primary key default gen_random_uuid(),
  service_id         uuid not null references public.services (id) on delete cascade,
  day_of_week        smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday
  start_time         time not null,
  end_time           time not null,
  slot_minutes       integer not null check (slot_minutes between 5 and 240),
  capacity_per_slot  integer not null check (capacity_per_slot between 1 and 500),
  effective_from     date not null,
  effective_until    date,
  is_active          boolean not null default true,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint queue_schedules_times_chk check (end_time > start_time),
  constraint queue_schedules_dates_chk check (effective_until is null or effective_until >= effective_from)
);
create index queue_schedules_service_idx on public.queue_schedules (service_id) where is_active;

create table public.queue_slots (
  id                 uuid primary key default gen_random_uuid(),
  service_id         uuid not null references public.services (id) on delete cascade,
  schedule_id        uuid references public.queue_schedules (id) on delete set null,
  slot_date          date not null,
  start_time         time not null,
  end_time           time not null,
  capacity           integer not null check (capacity > 0),
  reserved_count     integer not null default 0,
  last_queue_number  integer not null default 0,
  status             text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (service_id, slot_date, start_time),
  constraint queue_slots_times_chk check (end_time > start_time),
  constraint queue_slots_capacity_chk check (reserved_count >= 0 and reserved_count <= capacity)
);
create index queue_slots_date_idx on public.queue_slots (slot_date, service_id);

create table public.queue_tickets (
  id                   uuid primary key default gen_random_uuid(),
  slot_id              uuid not null references public.queue_slots (id),
  service_id           uuid not null references public.services (id),
  office_id            uuid not null references public.offices (id),
  student_id           uuid not null references public.students (profile_id) on delete cascade,
  queue_number         integer not null check (queue_number > 0),
  status               text not null default 'reserved'
                         check (status in ('reserved', 'checked_in', 'serving', 'completed', 'no_show', 'cancelled')),
  reserved_at          timestamptz not null default now(),
  checked_in_at        timestamptz,
  called_at            timestamptz,
  served_by            uuid references public.profiles (id),
  completed_at         timestamptz,
  cancelled_at         timestamptz,
  cancelled_by         uuid references public.profiles (id),
  cancel_reason        text,
  rescheduled_from_id  uuid references public.queue_tickets (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (slot_id, queue_number)
);
create unique index queue_tickets_one_live_per_slot_idx
  on public.queue_tickets (slot_id, student_id) where status in ('reserved', 'checked_in', 'serving');
create index queue_tickets_student_idx on public.queue_tickets (student_id, status);
create index queue_tickets_office_idx on public.queue_tickets (office_id, status);

create table public.queue_events (
  id           bigint generated always as identity primary key,
  ticket_id    uuid not null references public.queue_tickets (id) on delete cascade,
  event_type   text not null check (event_type in
                 ('reserved', 'checked_in', 'called', 'completed', 'no_show', 'cancelled', 'rescheduled')),
  from_status  text,
  to_status    text not null,
  actor_id     uuid references public.profiles (id),
  notes        text,
  created_at   timestamptz not null default now()
);
create index queue_events_ticket_idx on public.queue_events (ticket_id, created_at);

-- -----------------------------------------------------------------------------
-- Time helpers
-- -----------------------------------------------------------------------------
create or replace function private.campus_timezone()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select value #>> '{}' from public.system_settings where key = 'campus.timezone'),
                  'Asia/Manila');
$$;

create or replace function private.campus_now()
returns timestamp
language sql
stable
security definer
set search_path = ''
as $$
  select now() at time zone private.campus_timezone();
$$;

-- -----------------------------------------------------------------------------
-- Internal: reserve / release (callers do authorization)
-- -----------------------------------------------------------------------------
create or replace function private.reserve_slot_for(p_slot_id uuid, p_student_id uuid, p_rescheduled_from uuid)
returns public.queue_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot public.queue_slots;
  v_service public.services;
  v_active integer;
  v_ticket public.queue_tickets;
begin
  -- Serializes every reservation for this slot.
  select * into v_slot from public.queue_slots where id = p_slot_id for update;
  if not found then
    perform private.fail('SLOT_NOT_FOUND', 'Time slot not found.');
  end if;
  select * into v_service from public.services where id = v_slot.service_id;
  if v_slot.status <> 'open' or not v_service.is_active
     or v_service.service_kind not in ('queue', 'both') then
    perform private.fail('SLOT_CLOSED', 'This time slot is not open for reservations.');
  end if;
  if (v_slot.slot_date + v_slot.start_time) <= private.campus_now() then
    perform private.fail('SLOT_IN_PAST', 'This time slot has already started.');
  end if;
  if exists (select 1 from public.queue_tickets
             where slot_id = p_slot_id and student_id = p_student_id
               and status in ('reserved', 'checked_in', 'serving')) then
    perform private.fail('DUPLICATE_RESERVATION', 'You already have a reservation in this time slot.');
  end if;
  select count(*) into v_active
    from public.queue_tickets t
    join public.queue_slots s on s.id = t.slot_id
   where t.student_id = p_student_id and t.service_id = v_slot.service_id
     and t.status in ('reserved', 'checked_in', 'serving')
     and (s.slot_date + s.end_time) > private.campus_now();
  if v_active >= v_service.max_active_tickets_per_student then
    perform private.fail('RESERVATION_LIMIT_REACHED',
      format('You can hold at most %s active reservation(s) for this service.',
             v_service.max_active_tickets_per_student));
  end if;
  if v_slot.reserved_count >= v_slot.capacity then
    perform private.fail('SLOT_FULL', 'This time slot is fully booked.');
  end if;

  update public.queue_slots
     set reserved_count = reserved_count + 1, last_queue_number = last_queue_number + 1
   where id = p_slot_id
  returning * into v_slot;

  insert into public.queue_tickets
    (slot_id, service_id, office_id, student_id, queue_number, rescheduled_from_id)
  values
    (p_slot_id, v_slot.service_id, v_service.office_id, p_student_id, v_slot.last_queue_number, p_rescheduled_from)
  returning * into v_ticket;
  insert into public.queue_events (ticket_id, event_type, from_status, to_status, actor_id)
  values (v_ticket.id, 'reserved', null, 'reserved', auth.uid());
  perform private.notify(p_student_id, 'queue', 'Queue reservation confirmed',
    format('%s on %s at %s. Your queue number is %s.',
           v_service.name, v_slot.slot_date, to_char(v_slot.start_time, 'HH24:MI'), v_ticket.queue_number));
  return v_ticket;
end;
$$;

-- Cancels a live ticket and frees its capacity. Locks the slot first.
create or replace function private.cancel_ticket(p_ticket_id uuid, p_reason text, p_event text)
returns public.queue_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.queue_tickets;
  v_from text;
begin
  select * into v_ticket from public.queue_tickets where id = p_ticket_id;
  perform 1 from public.queue_slots where id = v_ticket.slot_id for update;
  select * into v_ticket from public.queue_tickets where id = p_ticket_id for update;
  if v_ticket.status not in ('reserved', 'checked_in') then
    perform private.fail('INVALID_STATE', 'Only a reserved or checked-in ticket can be cancelled.');
  end if;
  v_from := v_ticket.status;
  update public.queue_tickets
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = p_reason
   where id = p_ticket_id returning * into v_ticket;
  update public.queue_slots set reserved_count = reserved_count - 1 where id = v_ticket.slot_id;
  insert into public.queue_events (ticket_id, event_type, from_status, to_status, actor_id, notes)
  values (p_ticket_id, p_event, v_from, 'cancelled', auth.uid(), p_reason);
  return v_ticket;
end;
$$;

-- -----------------------------------------------------------------------------
-- Public workflow functions
-- -----------------------------------------------------------------------------
create or replace function public.reserve_queue_slot(p_slot_id uuid)
returns public.queue_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  if not exists (select 1 from public.students where profile_id = v_actor and enrollment_status = 'enrolled') then
    perform private.fail('NOT_A_STUDENT', 'Only enrolled students can reserve a queue slot.', '42501');
  end if;
  return private.reserve_slot_for(p_slot_id, v_actor, null);
end;
$$;

create or replace function public.cancel_queue_ticket(p_ticket_id uuid, p_reason text default null)
returns public.queue_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_ticket public.queue_tickets;
  v_slot public.queue_slots;
  v_service public.services;
begin
  select * into v_ticket from public.queue_tickets where id = p_ticket_id;
  if not found then
    perform private.fail('TICKET_NOT_FOUND', 'Ticket not found.');
  end if;
  if v_ticket.student_id = v_actor then
    select * into v_slot from public.queue_slots where id = v_ticket.slot_id;
    select * into v_service from public.services where id = v_ticket.service_id;
    if (v_slot.slot_date + v_slot.start_time) - make_interval(mins => v_service.cancellation_cutoff_minutes)
       <= private.campus_now() then
      perform private.fail('CANCELLATION_CUTOFF_PASSED',
        format('Reservations must be cancelled at least %s minutes before the slot starts.',
               v_service.cancellation_cutoff_minutes));
    end if;
  elsif not private.has_office_permission(v_ticket.office_id, 'queue.manage') then
    perform private.fail('TICKET_NOT_FOUND', 'Ticket not found.');
  end if;
  return private.cancel_ticket(p_ticket_id, p_reason, 'cancelled');
end;
$$;

create or replace function public.reschedule_queue_ticket(p_ticket_id uuid, p_new_slot_id uuid)
returns public.queue_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_ticket public.queue_tickets;
  v_old_slot public.queue_slots;
  v_new_slot public.queue_slots;
  v_service public.services;
begin
  select * into v_ticket from public.queue_tickets where id = p_ticket_id;
  if not found or v_ticket.student_id <> v_actor then
    perform private.fail('TICKET_NOT_FOUND', 'Ticket not found.');
  end if;
  select * into v_service from public.services where id = v_ticket.service_id;
  if not v_service.allow_reschedule then
    perform private.fail('RESCHEDULE_NOT_ALLOWED', 'This office does not allow rescheduling.');
  end if;
  select * into v_new_slot from public.queue_slots where id = p_new_slot_id;
  if not found or v_new_slot.service_id <> v_ticket.service_id then
    perform private.fail('SLOT_NOT_FOUND', 'Choose a time slot for the same service.');
  end if;
  if p_new_slot_id = v_ticket.slot_id then
    perform private.fail('SAME_SLOT', 'Choose a different time slot.');
  end if;
  select * into v_old_slot from public.queue_slots where id = v_ticket.slot_id;
  if (v_old_slot.slot_date + v_old_slot.start_time) - make_interval(mins => v_service.cancellation_cutoff_minutes)
     <= private.campus_now() then
    perform private.fail('CANCELLATION_CUTOFF_PASSED', 'It is too late to reschedule this reservation.');
  end if;
  -- Lock both slots in a fixed order to avoid deadlocks.
  perform 1 from public.queue_slots where id in (v_ticket.slot_id, p_new_slot_id) order by id for update;
  perform private.cancel_ticket(p_ticket_id, 'Rescheduled', 'rescheduled');
  -- If the new slot is full this raises and the whole transaction (including
  -- the cancellation above) rolls back, so the original ticket is kept.
  return private.reserve_slot_for(p_new_slot_id, v_actor, p_ticket_id);
end;
$$;

-- Staff transitions: reserved -> checked_in | no_show | cancelled
--                    checked_in -> serving (via call_next) | no_show | cancelled
--                    serving -> completed
create or replace function public.update_queue_ticket_status(
  p_ticket_id uuid, p_status text, p_notes text default null)
returns public.queue_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_ticket public.queue_tickets;
  v_from text;
begin
  select * into v_ticket from public.queue_tickets where id = p_ticket_id;
  if not found or not private.has_office_permission(v_ticket.office_id, 'queue.manage') then
    perform private.fail('TICKET_NOT_FOUND', 'Ticket not found.');
  end if;
  if p_status = 'cancelled' then
    return private.cancel_ticket(p_ticket_id, coalesce(p_notes, 'Cancelled by office'), 'cancelled');
  end if;
  select * into v_ticket from public.queue_tickets where id = p_ticket_id for update;
  v_from := v_ticket.status;
  if not ((v_from = 'reserved' and p_status in ('checked_in', 'no_show'))
          or (v_from = 'checked_in' and p_status in ('serving', 'no_show'))
          or (v_from = 'serving' and p_status = 'completed')) then
    perform private.fail('INVALID_TRANSITION', format('Cannot change a ticket from %s to %s.', v_from, p_status));
  end if;
  update public.queue_tickets
     set status = p_status,
         checked_in_at = case when p_status = 'checked_in' then now() else checked_in_at end,
         called_at = case when p_status = 'serving' then now() else called_at end,
         served_by = case when p_status in ('serving', 'completed') then v_actor else served_by end,
         completed_at = case when p_status = 'completed' then now() else completed_at end
   where id = p_ticket_id returning * into v_ticket;
  insert into public.queue_events (ticket_id, event_type, from_status, to_status, actor_id, notes)
  values (p_ticket_id,
          case p_status when 'serving' then 'called' else p_status end,
          v_from, p_status, v_actor, p_notes);
  return v_ticket;
end;
$$;

-- Calls the lowest-numbered checked-in ticket in a slot. SKIP LOCKED lets
-- several counters call at once without calling the same student twice.
create or replace function public.call_next_queue_ticket(p_slot_id uuid)
returns public.queue_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_office uuid;
  v_ticket public.queue_tickets;
begin
  select sv.office_id into v_office
    from public.queue_slots s join public.services sv on sv.id = s.service_id
   where s.id = p_slot_id;
  if v_office is null or not private.has_office_permission(v_office, 'queue.manage') then
    perform private.fail('SLOT_NOT_FOUND', 'Time slot not found.');
  end if;
  select * into v_ticket from public.queue_tickets
   where slot_id = p_slot_id and status = 'checked_in'
   order by queue_number
   limit 1
   for update skip locked;
  if not found then
    perform private.fail('QUEUE_EMPTY', 'No checked-in students are waiting in this slot.');
  end if;
  update public.queue_tickets set status = 'serving', called_at = now(), served_by = v_actor
   where id = v_ticket.id returning * into v_ticket;
  insert into public.queue_events (ticket_id, event_type, from_status, to_status, actor_id)
  values (v_ticket.id, 'called', 'checked_in', 'serving', v_actor);
  perform private.notify(v_ticket.student_id, 'queue', 'You are being called',
    format('Queue number %s, please proceed to the counter.', v_ticket.queue_number));
  return v_ticket;
end;
$$;

-- Generates slots from a weekly schedule for a date range (max 62 days).
create or replace function public.generate_queue_slots(p_schedule_id uuid, p_from date, p_to date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_sched public.queue_schedules;
  v_office uuid;
  v_count integer;
begin
  select * into v_sched from public.queue_schedules where id = p_schedule_id and is_active;
  if not found then
    perform private.fail('SCHEDULE_NOT_FOUND', 'Schedule not found or inactive.');
  end if;
  select office_id into v_office from public.services where id = v_sched.service_id;
  if not private.has_office_permission(v_office, 'queue.manage') then
    perform private.fail('FORBIDDEN', 'You cannot manage this office''s queue.', '42501');
  end if;
  if p_to < p_from or p_to - p_from > 62 then
    perform private.fail('INVALID_RANGE', 'Choose a date range of at most 62 days.');
  end if;

  insert into public.queue_slots (service_id, schedule_id, slot_date, start_time, end_time, capacity)
  select v_sched.service_id, v_sched.id, d::date, t::time, (t + make_interval(mins => v_sched.slot_minutes))::time,
         v_sched.capacity_per_slot
    from generate_series(greatest(p_from, v_sched.effective_from),
                         least(p_to, coalesce(v_sched.effective_until, p_to)), interval '1 day') d
   cross join lateral generate_series(
           d::date + v_sched.start_time,
           d::date + v_sched.end_time - make_interval(mins => v_sched.slot_minutes),
           make_interval(mins => v_sched.slot_minutes)) t
   where extract(dow from d) = v_sched.day_of_week
  on conflict (service_id, slot_date, start_time) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Service requests
-- -----------------------------------------------------------------------------
create or replace function public.submit_service_request(p_service_id uuid, p_purpose text, p_details text default null)
returns public.service_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_service public.services;
  v_req public.service_requests;
begin
  if not exists (select 1 from public.students where profile_id = v_actor) then
    perform private.fail('NOT_A_STUDENT', 'Only students can submit requests.', '42501');
  end if;
  select * into v_service from public.services where id = p_service_id and is_active
     and service_kind in ('request', 'both');
  if not found then
    perform private.fail('SERVICE_NOT_FOUND', 'This service does not accept requests.');
  end if;
  insert into public.service_requests (student_id, service_id, office_id, purpose, details)
  values (v_actor, p_service_id, v_service.office_id, p_purpose, p_details)
  returning * into v_req;
  return v_req;
end;
$$;

create or replace function public.update_service_request_status(
  p_request_id uuid, p_status text, p_remarks text default null)
returns public.service_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_req public.service_requests;
begin
  select * into v_req from public.service_requests where id = p_request_id for update;
  if not found then
    perform private.fail('REQUEST_NOT_FOUND', 'Request not found.');
  end if;
  if v_req.student_id = v_actor and p_status = 'cancelled' then
    if v_req.status <> 'submitted' then
      perform private.fail('INVALID_STATE', 'A request can only be cancelled before it is reviewed.');
    end if;
  elsif not private.has_office_permission(v_req.office_id, 'requests.manage') then
    perform private.fail('REQUEST_NOT_FOUND', 'Request not found.');
  elsif v_req.student_id = v_actor then
    perform private.fail('SELF_VERIFICATION', 'You cannot process your own request.', '42501');
  elsif not ((v_req.status = 'submitted' and p_status in ('in_review', 'rejected'))
             or (v_req.status = 'in_review' and p_status in ('ready_for_release', 'rejected'))
             or (v_req.status = 'ready_for_release' and p_status = 'released')) then
    perform private.fail('INVALID_TRANSITION', format('Cannot change a request from %s to %s.', v_req.status, p_status));
  end if;
  if p_status = 'rejected' and (p_remarks is null or length(trim(p_remarks)) = 0) then
    perform private.fail('REASON_REQUIRED', 'A reason is required to reject a request.');
  end if;
  update public.service_requests
     set status = p_status, remarks = coalesce(p_remarks, remarks),
         handled_by = case when v_req.student_id = v_actor then handled_by else v_actor end,
         completed_at = case when p_status in ('released', 'rejected', 'cancelled') then now() end
   where id = p_request_id returning * into v_req;
  if v_req.student_id <> v_actor then
    perform private.notify(v_req.student_id, 'request', 'Request updated',
      format('Request %s is now %s.', v_req.request_number, replace(p_status, '_', ' ')));
  end if;
  return v_req;
end;
$$;
