-- Test helpers (session-temporary). Included by every test file.
-- Tests run inside BEGIN ... ROLLBACK and switch between users with
-- pg_temp.act_as(), which sets the same JWT claims Supabase sets and
-- switches to the `authenticated` database role so RLS applies.

create or replace function pg_temp.u(p_name text)
returns uuid language sql immutable as $$
  select (case p_name
    when 'admin'          then 'a0000000-0000-4000-8000-000000000001'
    when 'cashier'        then 'a0000000-0000-4000-8000-000000000002'
    when 'program_head'   then 'a0000000-0000-4000-8000-000000000003'
    when 'sas_staff'      then 'a0000000-0000-4000-8000-000000000004'
    when 'sas_head'       then 'a0000000-0000-4000-8000-000000000005'
    when 'guidance'       then 'a0000000-0000-4000-8000-000000000006'
    when 'library'        then 'a0000000-0000-4000-8000-000000000007'
    when 'registrar'      then 'a0000000-0000-4000-8000-000000000008'
    when 'ssg_governor'   then 'a0000000-0000-4000-8000-000000000011'
    when 'ssg_treasurer'  then 'a0000000-0000-4000-8000-000000000012'
    when 'padc_mayor'     then 'a0000000-0000-4000-8000-000000000013'
    when 'padc_treasurer' then 'a0000000-0000-4000-8000-000000000014'
    when 'class_officer'  then 'a0000000-0000-4000-8000-000000000015'
    when 'english_pres'   then 'a0000000-0000-4000-8000-000000000016'
    when 'bsit1'          then 'a0000000-0000-4000-8000-000000000021'
    when 'bsit2'          then 'a0000000-0000-4000-8000-000000000022'
    when 'beed'           then 'a0000000-0000-4000-8000-000000000023'
    when 'cbam'           then 'a0000000-0000-4000-8000-000000000024'
  end)::uuid;
$$;

create or replace function pg_temp.act_as(p_name text)
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.u(p_name), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

create or replace function pg_temp.act_as_anon()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
end;
$$;

create or replace function pg_temp.act_as_service()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
end;
$$;

-- Back to the migration owner (bypasses RLS) to arrange fixtures.
create or replace function pg_temp.as_owner()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create or replace function pg_temp.pass(p_label text)
returns void language plpgsql as $$
begin
  perform set_config('cs.passed',
    (coalesce(nullif(current_setting('cs.passed', true), ''), '0')::int + 1)::text, true);
  raise notice 'PASS  %', p_label;
end;
$$;

create or replace function pg_temp.ok(p_cond boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL  %', p_label;
  end if;
  perform pg_temp.pass(p_label);
end;
$$;

-- Runs p_sql and expects it to fail with business code p_code (the error
-- message), or with SQLSTATE p_code when p_code is 5 characters like '42501'.
create or replace function pg_temp.fails(p_sql text, p_code text, p_label text)
returns void language plpgsql as $$
declare
  v_state text;
  v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if v_msg = p_code or v_state = p_code then
      perform pg_temp.pass(p_label);
      return;
    end if;
    raise exception 'FAIL  % (expected %, got % / %)', p_label, p_code, v_state, v_msg;
  end;
  raise exception 'FAIL  % (expected %, but it succeeded)', p_label, p_code;
end;
$$;

create or replace function pg_temp.put(p_key text, p_value text)
returns void language sql as $$ select set_config('cs.' || p_key, p_value, true); $$;

create or replace function pg_temp.get(p_key text)
returns text language sql stable as $$ select current_setting('cs.' || p_key); $$;

create or replace function pg_temp.summary(p_suite text)
returns void language plpgsql as $$
begin
  raise notice '%: % checks passed', p_suite, coalesce(nullif(current_setting('cs.passed', true), ''), '0');
end;
$$;
