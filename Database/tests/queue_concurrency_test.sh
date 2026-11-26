#!/usr/bin/env bash
# Concurrency test for reserve_queue_slot(): many sessions race for one slot.
# Local test database only (built by run_local_tests.sh). Commits fixtures and
# cleans them up afterwards.
set -euo pipefail

DB="${CAMPUSSERVE_TEST_DB:-campusserve_test}"
q() { psql -X -q -At -v ON_ERROR_STOP=1 -d "$DB" -c "$1"; }

SERVICE=$(q "select s.id from public.services s join public.offices o on o.id = s.office_id
             where o.code = 'GUIDANCE' and s.code = 'COUNSELING'")
SLOT=$(q "insert into public.queue_slots (service_id, slot_date, start_time, end_time, capacity)
          values ('$SERVICE', private.campus_now()::date + 5, '20:00', '20:30', 3) returning id" | head -1)
STUDENTS=$(q "select profile_id from public.students order by profile_id")

reserve() {
  psql -X -q -At -d "$DB" -c "begin;
    select set_config('request.jwt.claims', '{\"sub\":\"$1\",\"role\":\"authenticated\"}', true);
    set local role authenticated;
    select public.reserve_queue_slot('$SLOT');
    commit;" >/dev/null 2>&1 && echo ok || echo rejected
}

# Round 1: 10 different students race for 3 places.
results=$(for s in $STUDENTS; do reserve "$s" & done; wait)
ok=$(grep -c '^ok$' <<<"$results" || true)
# Round 2: one student fires 8 simultaneous requests for a slot of another service.
SERVICE2=$(q "select s.id from public.services s join public.offices o on o.id = s.office_id
              where o.code = 'LIBRARY' and s.code = 'LIBRARY_ID_VALIDATION'")
SLOT2=$(q "insert into public.queue_slots (service_id, slot_date, start_time, end_time, capacity)
           values ('$SERVICE2', private.campus_now()::date + 5, '20:30', '21:00', 10) returning id" | head -1)
ONE=$(head -1 <<<"$STUDENTS")
SLOT=$SLOT2
results2=$(for i in $(seq 1 8); do reserve "$ONE" & done; wait)
ok2=$(grep -c '^ok$' <<<"$results2" || true)

count1=$(q "select reserved_count || '/' || (select count(*) from public.queue_tickets t where t.slot_id = s.id
            and t.status <> 'cancelled') from public.queue_slots s where s.start_time = '20:00'
            and service_id = '$SERVICE' and slot_date = private.campus_now()::date + 5")
count2=$(q "select count(*) from public.queue_tickets where slot_id = '$SLOT2'")

# cleanup
q "delete from public.notifications where category = 'queue';
   delete from public.queue_tickets where slot_id in (select id from public.queue_slots
     where service_id = '$SERVICE' and slot_date = private.campus_now()::date + 5 and start_time >= '20:00');
   delete from public.queue_tickets where slot_id = '$SLOT2';
   delete from public.queue_slots where service_id = '$SERVICE' and slot_date = private.campus_now()::date + 5
     and start_time >= '20:00';
   delete from public.queue_slots where id = '$SLOT2';" >/dev/null

fail=0
if [[ "$ok" == "3" && "$count1" == "3/3" ]]; then
  echo "PASS  10 concurrent students, capacity 3: exactly 3 reservations (reserved_count/tickets = $count1)"
else
  echo "FAIL  capacity race: $ok succeeded, reserved_count/tickets = $count1"; fail=1
fi
if [[ "$ok2" == "1" && "$count2" == "1" ]]; then
  echo "PASS  8 concurrent requests from one student: exactly 1 reservation"
else
  echo "FAIL  duplicate race: $ok2 succeeded, $count2 tickets"; fail=1
fi
exit $fail
