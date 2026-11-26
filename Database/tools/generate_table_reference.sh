#!/usr/bin/env bash
# Generates Docs/DATABASE_TABLE_REFERENCE.md from a database that has the
# CampusServe migrations applied (by default the local test database built by
# Database/tests/run_local_tests.sh). Re-run after every migration.
#
# Usage: PGHOST=... PGPORT=... PGUSER=... Database/tools/generate_table_reference.sh [dbname]
set -euo pipefail

DB="${1:-${CAMPUSSERVE_TEST_DB:-campusserve_test}}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$ROOT/Docs/DATABASE_TABLE_REFERENCE.md"

psql -X -q -A -t -d "$DB" > "$OUT" <<'SQL'
with tables as (
  select c.oid, c.relname, obj_description(c.oid) as comment
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
),
cols as (
  select t.relname,
         string_agg(format('| `%s` | %s | %s | %s |',
                           a.attname,
                           format_type(a.atttypid, a.atttypmod),
                           case when a.attnotnull then 'yes' else '' end,
                           coalesce(replace(pg_get_expr(d.adbin, d.adrelid), '|', '\|'), '')),
                    E'\n' order by a.attnum) as rows
    from tables t
    join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid = t.oid and d.adnum = a.attnum
   group by t.relname
),
cons as (
  select t.relname,
         string_agg(format('- `%s` %s: `%s`',
                           k.conname,
                           case k.contype when 'p' then 'PRIMARY KEY' when 'f' then 'FOREIGN KEY'
                                          when 'u' then 'UNIQUE' when 'c' then 'CHECK' else k.contype::text end,
                           replace(pg_get_constraintdef(k.oid), '|', '\|')),
                    E'\n' order by k.contype, k.conname) as rows
    from tables t join pg_constraint k on k.conrelid = t.oid
   group by t.relname
),
idx as (
  select t.relname,
         string_agg(format('- `%s`', replace(i.indexdef, '|', '\|')), E'\n' order by i.indexname) as rows
    from tables t join pg_indexes i on i.schemaname = 'public' and i.tablename = t.relname
   where i.indexname not like '%_pkey'
   group by t.relname
),
pols as (
  select t.relname,
         string_agg(format('- `%s` (%s): `%s`', p.policyname, p.cmd, replace(coalesce(p.qual, ''), '|', '\|')),
                    E'\n' order by p.policyname) as rows
    from tables t join pg_policies p on p.schemaname = 'public' and p.tablename = t.relname
   group by t.relname
)
select E'# CampusServe database table reference\n\n'
    || E'Generated from the database by `Database/tools/generate_table_reference.sh`. Do not edit by hand.\n\n'
    || format(E'%s tables in schema `public`, all with Row Level Security enabled.\n\n', count(*))
    || string_agg(format(E'- [%1$s](#%1$s)', relname), E'\n' order by relname)
  from tables
union all
select * from (
  select format(E'\n\n## %s\n\n| Column | Type | Not null | Default |\n|---|---|---|---|\n%s\n\n**Constraints**\n\n%s%s\n\n**RLS policies**\n\n%s',
                t.relname, c.rows, coalesce(k.rows, '- none'),
                coalesce(E'\n\n**Indexes**\n\n' || i.rows, ''),
                coalesce(p.rows, '- none (service role only)'))
    from tables t
    join cols c on c.relname = t.relname
    left join cons k on k.relname = t.relname
    left join idx i on i.relname = t.relname
    left join pols p on p.relname = t.relname
   order by t.relname) s;
SQL

echo "Wrote $OUT"
