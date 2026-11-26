-- Student visibility: for EVERY account, the rows RLS lets it read from profiles and students must equal a
-- reference computed directly from private.can_view_student (the rule), so policy rewrites for speed
-- (migration 019) can never widen or narrow access.
begin;
\ir _helpers.sql

select pg_temp.as_owner();
create temp table vis_mismatch (user_id uuid, tbl text, extra int, missing int);
grant all on vis_mismatch to authenticated;

do $$
declare
  u record;
  v_extra int; v_missing int;
begin
  -- Every account with a role other than plain student, or any position, plus a sample of plain students
  -- (each is compared against ALL rows; checking every plain student adds cost but no new rule branches).
  for u in select p.id from public.profiles p
            where exists (select 1 from public.user_roles r where r.user_id = p.id and r.role <> 'student')
               or exists (select 1 from public.organization_assignments a where a.user_id = p.id)
               or exists (select 1 from public.office_staff s where s.user_id = p.id)
               or exists (select 1 from public.academic_assignments a where a.user_id = p.id)
               or p.id in (select profile_id from public.students order by profile_id limit 6)
               or not p.is_active loop
    perform set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true);
    -- Reference (as owner, no RLS): what the rule says this caller may see.
    create temp table ref_p on commit drop as
      select p.id from public.profiles p
       where p.id = u.id or private.has_global_permission('records.view_all') or private.can_view_student(p.id);
    create temp table ref_s on commit drop as
      select s.profile_id as id from public.students s where private.can_view_student(s.profile_id);
    grant select on ref_p, ref_s to authenticated;
    -- Actual (through RLS as the caller).
    execute 'set local role authenticated';
    select count(*) into v_extra from (select id from public.profiles except select id from ref_p) x;
    select count(*) into v_missing from (select id from ref_p except select id from public.profiles) x;
    if v_extra + v_missing > 0 then insert into vis_mismatch values (u.id, 'profiles', v_extra, v_missing); end if;
    select count(*) into v_extra from (select profile_id from public.students except select id from ref_s) x;
    select count(*) into v_missing from (select id from ref_s except select profile_id from public.students) x;
    if v_extra + v_missing > 0 then insert into vis_mismatch values (u.id, 'students', v_extra, v_missing); end if;
    execute 'set local role postgres';
    drop table ref_p; drop table ref_s;
  end loop;
end $$;

select pg_temp.ok((select count(*) from public.profiles) > 10, 'there are accounts to compare');
select pg_temp.ok(not exists (select 1 from vis_mismatch),
  'every account sees exactly the profiles and students the visibility rule allows ('
  || coalesce((select string_agg(user_id || ':' || tbl || ' +' || extra || '/-' || missing, ', ') from vis_mismatch), 'no mismatches') || ')');
rollback;
