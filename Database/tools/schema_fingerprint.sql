-- Schema fingerprint: run against two databases (e.g. the local test database and a
-- Supabase project) and compare the hashes to prove their schemas are identical.
-- Read-only. Object definitions are printed relative to search_path, so it is
-- fixed to Supabase's default before hashing.
set search_path = "$user", public, extensions;
select 'functions' as part, count(*) as n,
       md5(string_agg(md5(pg_get_functiondef(p.oid)), ',' order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))) as hash
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private')
union all
select 'columns', count(*), md5(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' order by table_name, ordinal_position))
  from information_schema.columns where table_schema = 'public'
union all
select 'constraints', count(*), md5(string_agg(c.relname || ':' || k.conname || ':' || pg_get_constraintdef(k.oid), ',' order by c.relname, k.conname))
  from pg_constraint k join pg_class c on c.oid = k.conrelid where k.connamespace = 'public'::regnamespace
union all
select 'indexes', count(*), md5(string_agg(indexdef, ',' order by indexname)) from pg_indexes where schemaname = 'public'
union all
select 'policies', count(*), md5(string_agg(tablename || ':' || policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '') || ':' || roles::text, ',' order by tablename, policyname))
  from pg_policies where schemaname = 'public'
union all
select 'triggers', count(*), md5(string_agg(c.relname || ':' || t.tgname || ':' || p.proname, ',' order by c.relname, t.tgname))
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p on p.oid = t.tgfoid where not t.tgisinternal and n.nspname = 'public'
union all
select 'rls_enabled_tables', count(*) filter (where c.relrowsecurity), md5(string_agg(c.relname || ':' || c.relrowsecurity, ',' order by c.relname))
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
union all
select 'function_grants', count(*), md5(string_agg(routine_schema || '.' || routine_name || ':' || grantee, ',' order by routine_schema, routine_name, grantee))
  from information_schema.routine_privileges
 where routine_schema in ('public', 'private') and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
union all
select 'table_grants', count(*), md5(string_agg(table_name || ':' || grantee || ':' || privilege_type, ',' order by table_name, grantee, privilege_type))
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee in ('anon', 'authenticated')
order by 1;
