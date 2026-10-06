-- Run read-only in the live Supabase SQL editor before enabling account deletion.
-- Save the results for review; this script changes no data.
begin read only;

-- Every public table scoped to an organization, including report tables whose
-- creation is outside the checked-in migrations.
select table_schema, table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and column_name = 'org_id'
order by table_name;

-- All foreign keys to the user profile, their delete actions, and nullability.
select child_ns.nspname as schema_name,
       child.relname as table_name,
       child_col.attname as column_name,
       child_col.attnotnull as required,
       fk.confdeltype as delete_action
from pg_constraint fk
join pg_class child on child.oid = fk.conrelid
join pg_namespace child_ns on child_ns.oid = child.relnamespace
join pg_attribute child_col on child_col.attrelid = child.oid
                           and child_col.attnum = fk.conkey[1]
where fk.contype = 'f'
  and fk.confrelid = 'public.users_profile'::regclass
order by schema_name, table_name, column_name;

-- Likely personal attribution columns in public records.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and (column_name ilike '%email%'
       or column_name ilike '%name%'
       or column_name ilike '%actor%'
       or column_name ilike '%created_by%'
       or column_name ilike '%updated_by%'
       or data_type = 'jsonb')
order by table_name, column_name;

-- Counts and buckets only; no object paths or user details are returned.
select bucket_id, count(*) as object_count,
       count(*) filter (where owner_id is not null or owner is not null) as owned_object_count
from storage.objects
group by bucket_id
order by bucket_id;

-- Check whether automatic organization cleanup needs additional FK handling.
select child_ns.nspname as schema_name,
       child.relname as table_name,
       parent.relname as referenced_table,
       fk.confdeltype as delete_action
from pg_constraint fk
join pg_class child on child.oid = fk.conrelid
join pg_namespace child_ns on child_ns.oid = child.relnamespace
join pg_class parent on parent.oid = fk.confrelid
where fk.contype = 'f'
  and child_ns.nspname = 'public'
  and parent.relname in ('orgs', 'properties', 'sessions', 'shots', 'observations', 'session_snapshots')
order by referenced_table, table_name;

rollback;
