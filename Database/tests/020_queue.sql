-- Queue reservation tests (sequential). Concurrency: queue_concurrency_test.sh
begin;
\ir _helpers.sql

-- Fixtures: three evening slots (outside seeded hours) for the Registrar's
-- DOCUMENT_REQUEST service (cutoff 60 min, max 1 active ticket per student).
select pg_temp.as_owner();
select pg_temp.put('service', (select s.id from public.services s join public.offices o on o.id = s.office_id
                               where o.code = 'REGISTRAR' and s.code = 'DOCUMENT_REQUEST')::text);
select pg_temp.put('day', (private.campus_now()::date + 3)::text);
insert into public.queue_slots (service_id, slot_date, start_time, end_time, capacity) values
  (pg_temp.get('service')::uuid, pg_temp.get('day')::date, '18:00', '18:30', 2),
  (pg_temp.get('service')::uuid, pg_temp.get('day')::date, '18:30', '19:00', 2),
  (pg_temp.get('service')::uuid, pg_temp.get('day')::date, '19:00', '19:30', 1),
  (pg_temp.get('service')::uuid, private.campus_now()::date - 1, '18:00', '18:30', 5);
select pg_temp.put('slotA', (select id from public.queue_slots where service_id = pg_temp.get('service')::uuid
                             and slot_date = pg_temp.get('day')::date and start_time = '18:00')::text);
select pg_temp.put('slotB', (select id from public.queue_slots where service_id = pg_temp.get('service')::uuid
                             and slot_date = pg_temp.get('day')::date and start_time = '18:30')::text);
select pg_temp.put('slotC', (select id from public.queue_slots where service_id = pg_temp.get('service')::uuid
                             and slot_date = pg_temp.get('day')::date and start_time = '19:00')::text);
select pg_temp.put('past', (select id from public.queue_slots where service_id = pg_temp.get('service')::uuid
                            and slot_date = private.campus_now()::date - 1 and start_time = '18:00')::text);

-- Reservation ------------------------------------------------------------------
select pg_temp.act_as('bsit1');
select pg_temp.put('t1', (public.reserve_queue_slot(pg_temp.get('slotA')::uuid)).id::text);
select pg_temp.ok((select queue_number from public.queue_tickets where id = pg_temp.get('t1')::uuid) = 1,
  'first reservation gets queue number 1');
select pg_temp.fails(format('select public.reserve_queue_slot(%L)', pg_temp.get('slotA')),
  'DUPLICATE_RESERVATION', 'same student cannot reserve the same slot twice');
select pg_temp.fails(format('select public.reserve_queue_slot(%L)', pg_temp.get('slotB')),
  'RESERVATION_LIMIT_REACHED', 'per-service active reservation limit is enforced');
select pg_temp.fails(format('select public.reserve_queue_slot(%L)', pg_temp.get('past')),
  'SLOT_IN_PAST', 'cannot reserve a slot that has started');

select pg_temp.act_as('bsit2');
select pg_temp.put('t2', (public.reserve_queue_slot(pg_temp.get('slotA')::uuid)).id::text);
select pg_temp.ok((select queue_number from public.queue_tickets where id = pg_temp.get('t2')::uuid) = 2,
  'second reservation gets queue number 2');
select pg_temp.ok((select count(*) from public.queue_tickets) = 1, 'a student sees only their own tickets');

select pg_temp.act_as('beed');
select pg_temp.fails(format('select public.reserve_queue_slot(%L)', pg_temp.get('slotA')),
  'SLOT_FULL', 'a full slot rejects further reservations');

select pg_temp.as_owner();
select pg_temp.ok((select reserved_count from public.queue_slots where id = pg_temp.get('slotA')::uuid) = 2,
  'reserved_count matches capacity, no overbooking');
select pg_temp.fails(format('update public.queue_slots set capacity = 1 where id = %L', pg_temp.get('slotA')),
  '23514', 'capacity cannot be lowered below existing reservations');
select pg_temp.fails(format(
  'insert into public.queue_tickets (slot_id, service_id, office_id, student_id, queue_number) '
  'select id, service_id, (select office_id from public.services where id = service_id), %L, 1 '
  'from public.queue_slots where id = %L', pg_temp.u('beed'), pg_temp.get('slotA')),
  '23505', 'queue numbers are unique per slot');

-- Cancellation frees capacity ------------------------------------------------------
select pg_temp.act_as('bsit1');
select public.cancel_queue_ticket(pg_temp.get('t1')::uuid, 'Changed plans');
select pg_temp.act_as('beed');
select pg_temp.put('t3', (public.reserve_queue_slot(pg_temp.get('slotA')::uuid)).id::text);
select pg_temp.ok((select queue_number from public.queue_tickets where id = pg_temp.get('t3')::uuid) = 3,
  'cancellation frees a place; queue numbers are never reused');

-- Rescheduling ------------------------------------------------------------------------
select pg_temp.act_as('bsit2');
select pg_temp.put('t2b', (public.reschedule_queue_ticket(pg_temp.get('t2')::uuid, pg_temp.get('slotB')::uuid)).id::text);
select pg_temp.as_owner();
select pg_temp.ok((select status from public.queue_tickets where id = pg_temp.get('t2')::uuid) = 'cancelled'
                  and (select rescheduled_from_id from public.queue_tickets where id = pg_temp.get('t2b')::uuid)
                      = pg_temp.get('t2')::uuid
                  and (select reserved_count from public.queue_slots where id = pg_temp.get('slotA')::uuid) = 1
                  and (select reserved_count from public.queue_slots where id = pg_temp.get('slotB')::uuid) = 1,
  'reschedule moves the reservation and the capacity');
-- fill slot C, then try to reschedule into it: original ticket must survive
select pg_temp.act_as('cbam');
select public.reserve_queue_slot(pg_temp.get('slotC')::uuid);
select pg_temp.act_as('bsit2');
select pg_temp.fails(format('select public.reschedule_queue_ticket(%L, %L)', pg_temp.get('t2b'), pg_temp.get('slotC')),
  'SLOT_FULL', 'reschedule into a full slot fails');
select pg_temp.ok((select status from public.queue_tickets where id = pg_temp.get('t2b')::uuid) = 'reserved',
  'failed reschedule keeps the original reservation');

-- Cancellation cutoff -------------------------------------------------------------------
-- Deterministic: a slot 3 days ahead with a cutoff longer than 3 days.
select pg_temp.as_owner();
insert into public.queue_slots (service_id, slot_date, start_time, end_time, capacity)
values (pg_temp.get('service')::uuid, pg_temp.get('day')::date, '20:00', '20:30', 3);
select pg_temp.put('soon', (select id from public.queue_slots where service_id = pg_temp.get('service')::uuid
                            and slot_date = pg_temp.get('day')::date and start_time = '20:00')::text);
select pg_temp.act_as('english_pres');
select pg_temp.put('t_soon', (public.reserve_queue_slot(pg_temp.get('soon')::uuid)).id::text);
select pg_temp.as_owner();
update public.services set cancellation_cutoff_minutes = 60 * 24 * 7 where id = pg_temp.get('service')::uuid;
select pg_temp.act_as('english_pres');
select pg_temp.fails(format('select public.cancel_queue_ticket(%L)', pg_temp.get('t_soon')),
  'CANCELLATION_CUTOFF_PASSED', 'student cannot cancel inside the cutoff window');
select pg_temp.act_as('registrar');
select pg_temp.ok((public.cancel_queue_ticket(pg_temp.get('t_soon')::uuid, 'Office closed')).status = 'cancelled',
  'office staff can still cancel inside the cutoff window');

-- Office staff ----------------------------------------------------------------------------
select pg_temp.act_as('beed');
select pg_temp.fails(format('select public.update_queue_ticket_status(%L, ''checked_in'')', pg_temp.get('t3')),
  'TICKET_NOT_FOUND', 'a student cannot check themselves in');
select pg_temp.act_as('guidance');
select pg_temp.fails(format('select public.update_queue_ticket_status(%L, ''checked_in'')', pg_temp.get('t3')),
  'TICKET_NOT_FOUND', 'staff of another office cannot manage this ticket');
select pg_temp.act_as('registrar');
select pg_temp.ok((select count(*) from public.queue_tickets
                   where slot_id = pg_temp.get('slotA')::uuid) = 3, 'registrar staff see their office''s tickets');
select pg_temp.fails(format('select public.update_queue_ticket_status(%L, ''completed'')', pg_temp.get('t3')),
  'INVALID_TRANSITION', 'cannot complete a ticket that was never served');
select public.update_queue_ticket_status(pg_temp.get('t3')::uuid, 'checked_in');
select pg_temp.ok((public.call_next_queue_ticket(pg_temp.get('slotA')::uuid)).id = pg_temp.get('t3')::uuid,
  'call next picks the checked-in student');
select pg_temp.fails(format('select public.call_next_queue_ticket(%L)', pg_temp.get('slotA')),
  'QUEUE_EMPTY', 'call next reports an empty queue');
select public.update_queue_ticket_status(pg_temp.get('t3')::uuid, 'completed');
select pg_temp.ok((select count(*) from public.queue_events where ticket_id = pg_temp.get('t3')::uuid) = 4,
  'every ticket change is recorded in queue_events');
select pg_temp.ok(public.generate_queue_slots(
                    (select id from public.queue_schedules where service_id = pg_temp.get('service')::uuid limit 1),
                    current_date, current_date + 30) >= 0,
  'office staff can generate slots from a schedule');
select pg_temp.act_as('bsit1');
select pg_temp.fails(format('select public.generate_queue_slots(%L, current_date, current_date + 7)',
                            (select id from public.queue_schedules where service_id = pg_temp.get('service')::uuid limit 1)),
  'FORBIDDEN', 'students cannot generate slots');

-- Service requests ---------------------------------------------------------------------------
select pg_temp.act_as('bsit1');
select pg_temp.put('req', (public.submit_service_request(pg_temp.get('service')::uuid, 'Certificate of grades')).id::text);
select pg_temp.fails(format('select public.update_service_request_status(%L, ''released'')', pg_temp.get('req')),
  'REQUEST_NOT_FOUND', 'a student cannot advance their own request');
select pg_temp.act_as('registrar');
select public.update_service_request_status(pg_temp.get('req')::uuid, 'in_review');
select pg_temp.fails(format('select public.update_service_request_status(%L, ''released'')', pg_temp.get('req')),
  'INVALID_TRANSITION', 'request status transitions are enforced');
select pg_temp.ok((select count(*) from public.request_status_history where request_id = pg_temp.get('req')::uuid) = 2,
  'request status history is recorded');

select pg_temp.summary('020_queue');
rollback;
