-- ScoutCapture account deletion migration bundle.
-- Run only in Supabase project scout-dev (ref chlvazmtucoszicehtnm), main.
-- This adds schema/functions/guards; it does not request or execute a deletion.
-- All five migrations are in one transaction. Any error rolls back the bundle.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $$
begin
    if to_regclass('public.orgs') is null
       or to_regclass('public.users_profile') is null
       or to_regclass('public.org_memberships') is null
       or to_regclass('public.sessions') is null
       or to_regclass('public.session_snapshots') is null
       or to_regclass('public.report_packages') is null
       or to_regclass('storage.objects') is null then
        raise exception 'ScoutCapture schema is incomplete; no migration applied';
    end if;
end;
$$;


-- ==== 202609280001_account_deletion_requests.sql ====
-- Account deletion is distinct from organization record retention. The request
-- stage removes data access immediately and queues irreversible cleanup.
create table if not exists public.account_deletion_requests (
    id uuid primary key default gen_random_uuid(),
    user_id uuid unique references auth.users(id) on delete set null,
    request_email text,
    request_full_name text,
    status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
    requested_at timestamptz not null default timezone('utc', now()),
    started_at timestamptz,
    completed_at timestamptz,
    last_error text
);

create index if not exists idx_account_deletion_requests_work
    on public.account_deletion_requests (requested_at)
    where status in ('pending', 'failed');

alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon, authenticated;
grant select, insert, update, delete on public.account_deletion_requests to service_role;

create table if not exists public.organization_retention_schedule (
    org_id uuid primary key references public.orgs(id) on delete cascade,
    inactive_since timestamptz not null,
    purge_after timestamptz not null,
    status text not null default 'scheduled' check (status in ('scheduled', 'purging', 'purged', 'canceled')),
    last_error text,
    updated_at timestamptz not null default timezone('utc', now())
);

alter table public.organization_retention_schedule enable row level security;
revoke all on public.organization_retention_schedule from anon, authenticated;
grant select, insert, update, delete on public.organization_retention_schedule to service_role;

create or replace function public.request_user_account_deletion(
    target_user_id uuid,
    trusted_admin_emails text[] default '{}'::text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    target_email text;
    target_full_name text;
    request_id uuid;
    affected_org_id uuid;
    request_time timestamptz := timezone('utc', now());
begin
    if cardinality(trusted_admin_emails) = 0 then
        raise exception 'Platform admin exclusion list is required';
    end if;
    select email into target_email from auth.users where id = target_user_id;
    if not found then
        raise exception 'Account not found';
    end if;
    if lower(target_email) = any(trusted_admin_emails) then
        raise exception 'Transfer platform administration before deleting this account';
    end if;
    if exists (
        select 1
          from public.org_memberships member
         where member.user_id = target_user_id
           and member.deleted_at is null
           and member.role = 'owner'
           and not exists (
               select 1 from public.org_memberships other_owner
                where other_owner.org_id = member.org_id
                  and other_owner.user_id <> target_user_id
                  and other_owner.deleted_at is null
                  and other_owner.role = 'owner'
           )
    ) then
        raise exception 'Transfer sole organization ownership before deleting this account';
    end if;

    select full_name into target_full_name
      from public.users_profile where id = target_user_id;

    insert into public.account_deletion_requests (user_id, request_email, request_full_name)
    values (target_user_id, target_email, target_full_name)
    on conflict (user_id) do update
        set request_email = excluded.request_email,
            request_full_name = excluded.request_full_name
    returning id into request_id;

    -- Access is removed in this transaction, before any asynchronous cleanup.
    update public.org_memberships
       set deleted_at = coalesce(deleted_at, request_time), updated_by = null
     where user_id = target_user_id and deleted_at is null;

    if to_regclass('public.report_package_email_notifications') is not null then
        execute 'update public.report_package_email_notifications set status = ''skipped'' where recipient_user_id = $1 and status in (''pending'', ''failed'')'
            using target_user_id;
    end if;

    for affected_org_id in
        select distinct org_id from public.org_memberships where user_id = target_user_id
    loop
        if not exists (
            select 1
              from public.org_memberships member
              join public.users_profile profile on profile.id = member.user_id
             where member.org_id = affected_org_id
               and member.deleted_at is null
               and lower(coalesce(profile.email, '')) <> all(trusted_admin_emails)
        ) then
            insert into public.organization_retention_schedule (
                org_id, inactive_since, purge_after, status, updated_at
            ) values (
                affected_org_id, request_time, request_time + interval '90 days', 'scheduled', request_time
            )
            on conflict (org_id) do update
                set inactive_since = case
                        when public.organization_retention_schedule.status = 'scheduled'
                            then public.organization_retention_schedule.inactive_since
                        else excluded.inactive_since
                    end,
                    purge_after = case
                        when public.organization_retention_schedule.status = 'scheduled'
                            then public.organization_retention_schedule.purge_after
                        else excluded.purge_after
                    end,
                    status = 'scheduled', updated_at = request_time;
        end if;
    end loop;

    -- Profile fields stop appearing in portal attribution immediately, while
    -- the Auth row remains until the resumable hard-delete worker finishes.
    update public.users_profile
       set email = null, full_name = null, avatar_url = null,
           deleted_at = coalesce(deleted_at, request_time), updated_by = null
     where id = target_user_id;

    return request_id;
end;
$$;

revoke all on function public.request_user_account_deletion(uuid, text[]) from public, anon, authenticated;
grant execute on function public.request_user_account_deletion(uuid, text[]) to service_role;

-- Keep a durable transfer journal so a failed Storage API operation can resume
-- without discarding an organization's original media.
create table if not exists public.account_deletion_storage_transfers (
    request_id uuid not null references public.account_deletion_requests(id) on delete cascade,
    bucket_id text not null,
    object_name text not null,
    temporary_name text not null,
    status text not null default 'pending' check (status in ('pending', 'complete')),
    primary key (request_id, bucket_id, object_name)
);

alter table public.account_deletion_storage_transfers enable row level security;
revoke all on public.account_deletion_storage_transfers from anon, authenticated;
grant select, insert, update, delete on public.account_deletion_storage_transfers to service_role;

create or replace function public.account_deletion_owned_objects(target_user_id uuid)
returns table (bucket_id text, object_name text)
language sql
security definer
set search_path = public
as $$
    select object_row.bucket_id, object_row.name
      from storage.objects object_row
     where object_row.owner_id = target_user_id::text
        or object_row.owner::text = target_user_id::text
     order by object_row.bucket_id, object_row.name;
$$;

revoke all on function public.account_deletion_owned_objects(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_owned_objects(uuid) to service_role;

alter table public.org_invitations alter column invited_by drop not null;
alter table public.property_access_grants alter column granted_by drop not null;
alter table public.punchlist_activity alter column created_by drop not null;

-- Run only after every Storage object owned by the user has been safely
-- transferred through the Storage API. The procedure never deletes org data.
create or replace function public.prepare_user_account_hard_delete(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    target_email text;
    referenced_table text;
    referenced_column text;
    required_reference_exists boolean;
    fk record;
begin
    if not exists (
        select 1 from public.account_deletion_requests request
        where request.user_id = target_user_id
          and request.status in ('pending', 'processing', 'failed')
    ) then
        raise exception 'Deletion request not found';
    end if;

    if exists (
        select 1 from storage.objects object_row
        where object_row.owner_id = target_user_id::text
           or object_row.owner::text = target_user_id::text
    ) then
        raise exception 'Storage ownership must be transferred before Auth deletion';
    end if;

    select email into target_email from auth.users where id = target_user_id;

    -- Personal invitation and email delivery records have no retained
    -- organization-document value after the account is removed.
    delete from public.portal_invites where lower(email) = lower(target_email);
    delete from public.org_invitations where lower(invitee_email) = lower(target_email);
    if to_regclass('public.report_package_email_notifications') is not null then
        execute 'delete from public.report_package_email_notifications where recipient_user_id = $1 or lower(recipient_email) = lower($2)'
            using target_user_id, target_email;
    end if;

    -- Release live locks owned by the departing user. property_status has
    -- constraints requiring an owner while occupied or in draft state.
    update public.property_status
       set status = case when status in ('occupied', 'draft') then 'idle' else status end,
           active_session_id = case when status in ('occupied', 'draft') then null else active_session_id end,
           draft_session_id = case when status in ('occupied', 'draft') then null else draft_session_id end,
           owner_user_id = null,
           owner_device_id = null,
           status_reason = 'account_deleted'
     where owner_user_id = target_user_id;

    update public.property_session_occupancy
       set occupied_by_user_id = null, occupied_by_device_id = null, occupied_at = null
     where occupied_by_user_id = target_user_id;

    update public.sessions
       set locked_by_user_id = null, locked_by_device_id = null, locked_at = null
     where locked_by_user_id = target_user_id;

    -- Remove direct access rows. Other FK columns are authorship/update
    -- pointers on organization-owned records and become anonymous.
    delete from public.property_access_grants where user_id = target_user_id;
    delete from public.org_memberships where user_id = target_user_id;
    if to_regclass('public.report_email_user_preferences') is not null then
        execute 'delete from public.report_email_user_preferences where user_id = $1'
            using target_user_id;
    end if;

    for fk in
        select child_namespace.nspname as schema_name,
               child_table.relname as table_name,
               child_column.attname as column_name,
               child_column.attnotnull as required
          from pg_constraint constraint_row
          join pg_class child_table on child_table.oid = constraint_row.conrelid
          join pg_namespace child_namespace on child_namespace.oid = child_table.relnamespace
          join pg_attribute child_column
            on child_column.attrelid = child_table.oid
           and child_column.attnum = constraint_row.conkey[1]
         where constraint_row.contype = 'f'
           and constraint_row.confrelid = 'public.users_profile'::regclass
           and array_length(constraint_row.conkey, 1) = 1
    loop
        referenced_table := format('%I.%I', fk.schema_name, fk.table_name);
        referenced_column := format('%I', fk.column_name);
        if fk.required then
            -- Known required access and notification rows were removed above.
            -- A new required FK must receive an explicit retention policy.
            execute format('select exists (select 1 from %s where %s = $1)', referenced_table, referenced_column)
                into strict required_reference_exists using target_user_id;
            if required_reference_exists then
                raise exception 'Unreviewed required account reference %.%', referenced_table, referenced_column;
            end if;
        else
            execute format('update %s set %s = null where %s = $1', referenced_table, referenced_column, referenced_column)
                using target_user_id;
        end if;
    end loop;

    -- Fail closed if a future multi-column FK needs an explicit policy.
    if exists (
        select 1 from pg_constraint constraint_row
         where constraint_row.contype = 'f'
           and constraint_row.confrelid = 'public.users_profile'::regclass
           and array_length(constraint_row.conkey, 1) <> 1
    ) then
        raise exception 'Unreviewed multi-column user-profile reference';
    end if;
end;
$$;

revoke all on function public.prepare_user_account_hard_delete(uuid) from public, anon, authenticated;
grant execute on function public.prepare_user_account_hard_delete(uuid) to service_role;

-- Claim one request atomically so overlapping scheduled invocations do not
-- process the same account. A stale processing claim can be retried.
create or replace function public.claim_next_account_deletion()
returns table (
    id uuid,
    user_id uuid,
    request_email text,
    request_full_name text,
    status text,
    started_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
    return query
    update public.account_deletion_requests request
       set status = 'processing',
           started_at = timezone('utc', now()),
           last_error = null
     where request.id = (
         select candidate.id
           from public.account_deletion_requests candidate
          where candidate.status in ('pending', 'failed')
             or (candidate.status = 'processing'
                 and candidate.started_at < timezone('utc', now()) - interval '15 minutes')
          order by case candidate.status
                       when 'pending' then 0
                       when 'failed' then 1
                       else 2
                   end, candidate.requested_at
          for update skip locked
          limit 1
     )
    returning request.id, request.user_id, request.request_email,
              request.request_full_name, request.status, request.started_at;
end;
$$;

revoke all on function public.claim_next_account_deletion() from public, anon, authenticated;
grant execute on function public.claim_next_account_deletion() to service_role;

-- Reconcile the 90-day clock for membership changes outside account deletion.
-- A previously active customer membership is required so a newly created,
-- admin-only organization is not scheduled before its first customer joins.
create or replace function public.reconcile_org_retention_schedule(
    trusted_admin_emails text[] default '{}'::text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if cardinality(trusted_admin_emails) = 0 then
        raise exception 'Platform admin exclusion list is required';
    end if;
    update public.organization_retention_schedule schedule
       set status = 'canceled', updated_at = timezone('utc', now()), last_error = null
     where schedule.status = 'scheduled'
       and exists (
           select 1
             from public.org_memberships member
             join public.users_profile profile on profile.id = member.user_id
            where member.org_id = schedule.org_id
              and member.deleted_at is null
              and lower(coalesce(profile.email, '')) <> all(trusted_admin_emails)
       );

    insert into public.organization_retention_schedule (
        org_id, inactive_since, purge_after, status, updated_at
    )
    select org.id, timezone('utc', now()), timezone('utc', now()) + interval '90 days',
           'scheduled', timezone('utc', now())
      from public.orgs org
     where org.deleted_at is null
       and exists (
           select 1
             from public.org_memberships member
             join public.users_profile profile on profile.id = member.user_id
            where member.org_id = org.id
              and lower(coalesce(profile.email, '')) <> all(trusted_admin_emails)
       )
       and not exists (
           select 1
             from public.org_memberships member
             join public.users_profile profile on profile.id = member.user_id
            where member.org_id = org.id
              and member.deleted_at is null
              and lower(coalesce(profile.email, '')) <> all(trusted_admin_emails)
       )
    on conflict (org_id) do update
        set inactive_since = excluded.inactive_since,
            purge_after = excluded.purge_after,
            status = 'scheduled',
            updated_at = excluded.updated_at,
            last_error = null
      where public.organization_retention_schedule.status = 'canceled';
end;
$$;

revoke all on function public.reconcile_org_retention_schedule(text[]) from public, anon, authenticated;
grant execute on function public.reconcile_org_retention_schedule(text[]) to service_role;

-- A cached JWT or admin reinvite cannot restore a deletion-pending profile
-- or membership before the Auth hard delete completes.
create or replace function public.guard_deleting_account_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if exists (
        select 1 from public.account_deletion_requests request
         where request.user_id = new.id
           and request.status in ('pending', 'processing', 'failed')
    ) and (
        new.email is not null or new.full_name is not null
        or new.avatar_url is not null or new.deleted_at is null
    ) then
        raise exception 'Account deletion is in progress';
    end if;
    return new;
end;
$$;

drop trigger if exists guard_deleting_account_profile on public.users_profile;
create trigger guard_deleting_account_profile
    before insert or update on public.users_profile
    for each row execute function public.guard_deleting_account_profile();

create or replace function public.guard_deleting_account_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.deleted_at is null and exists (
        select 1 from public.account_deletion_requests request
         where request.user_id = new.user_id
           and request.status in ('pending', 'processing', 'failed')
    ) then
        raise exception 'Account deletion is in progress';
    end if;
    return new;
end;
$$;

drop trigger if exists guard_deleting_account_membership on public.org_memberships;
create trigger guard_deleting_account_membership
    before insert or update on public.org_memberships
    for each row execute function public.guard_deleting_account_membership();


-- ==== 202609280002_account_deletion_snapshot_redactions.sql ====
-- A resumable scan and journal for removing account attribution from retained
-- session snapshots. Applied only after the request migration.
alter table public.account_deletion_requests
    add column if not exists snapshot_scan_cursor uuid,
    add column if not exists snapshot_scan_complete boolean not null default false;

create table if not exists public.account_deletion_snapshot_redactions (
    request_id uuid not null references public.account_deletion_requests(id) on delete cascade,
    snapshot_id uuid not null,
    bucket_id text not null check (bucket_id = 'scoutcapture-session-snapshots'),
    object_name text not null,
    temporary_name text not null,
    original_sha256 text not null check (original_sha256 ~ '^[0-9a-f]{64}$'),
    redacted_sha256 text not null check (redacted_sha256 ~ '^[0-9a-f]{64}$'),
    raw_session_json_sha256 text not null check (raw_session_json_sha256 ~ '^[0-9a-f]{64}$'),
    payload_byte_size bigint not null check (payload_byte_size > 0),
    redacted_manifest jsonb not null,
    status text not null default 'pending' check (status in ('pending', 'complete')),
    primary key (request_id, snapshot_id)
);

alter table public.account_deletion_snapshot_redactions enable row level security;
revoke all on public.account_deletion_snapshot_redactions from anon, authenticated;
grant select, insert, update, delete on public.account_deletion_snapshot_redactions to service_role;


-- ==== 202609280003_account_deletion_metadata_redaction.sql ====
-- Redact account attribution that can live in organization-owned JSON/text
-- after the Auth user and profile are removed. Business records remain.
create or replace function public.account_deletion_redact_text(
    source_text text,
    target_email text,
    target_full_name text default null
)
returns text
language plpgsql
immutable
as $$
declare
    remainder text := source_text;
    output_text text := '';
    match_position integer;
begin
    if source_text is null or nullif(target_email, '') is null then
        return source_text;
    end if;
    if nullif(target_full_name, '') is not null
       and lower(trim(source_text)) = lower(trim(target_full_name)) then
        return 'Deleted user';
    end if;
    loop
        match_position := position(lower(target_email) in lower(remainder));
        exit when match_position = 0;
        output_text := output_text || substring(remainder from 1 for match_position - 1) || 'Deleted user';
        remainder := substring(remainder from match_position + char_length(target_email));
    end loop;
    return output_text || remainder;
end;
$$;

create or replace function public.account_deletion_redact_jsonb(
    source_value jsonb,
    target_email text,
    target_user_id uuid,
    target_full_name text default null
)
returns jsonb
language plpgsql
immutable
as $$
declare
    result_value jsonb;
    entry_key text;
    entry_value jsonb;
    plain_text text;
begin
    case jsonb_typeof(source_value)
        when 'object' then
            result_value := '{}'::jsonb;
            for entry_key, entry_value in select key, value from jsonb_each(source_value) loop
                result_value := result_value || jsonb_build_object(
                    entry_key,
                    public.account_deletion_redact_jsonb(
                        entry_value, target_email, target_user_id, target_full_name
                    )
                );
            end loop;
            return result_value;
        when 'array' then
            result_value := '[]'::jsonb;
            for entry_value in select value from jsonb_array_elements(source_value) loop
                result_value := result_value || jsonb_build_array(
                    public.account_deletion_redact_jsonb(
                        entry_value, target_email, target_user_id, target_full_name
                    )
                );
            end loop;
            return result_value;
        when 'string' then
            plain_text := source_value #>> '{}';
            if lower(plain_text) = lower(target_user_id::text) then
                return 'null'::jsonb;
            end if;
            return to_jsonb(public.account_deletion_redact_text(
                plain_text, target_email, target_full_name
            ));
        else
            return source_value;
    end case;
end;
$$;

revoke all on function public.account_deletion_redact_text(text, text, text)
    from public, anon, authenticated;
revoke all on function public.account_deletion_redact_jsonb(jsonb, text, uuid, text)
    from public, anon, authenticated;

create or replace function public.redact_user_account_metadata(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    target_email text;
    target_full_name text;
begin
    select request_email, request_full_name
      into target_email, target_full_name
      from public.account_deletion_requests
     where user_id = target_user_id
       and status in ('pending', 'processing', 'failed');
    if not found or nullif(target_email, '') is null then
        raise exception 'Account deletion request is missing attribution details';
    end if;

    update public.session_events event_row
       set payload = public.account_deletion_redact_jsonb(
           event_row.payload, target_email, target_user_id, target_full_name
       )
     where event_row.org_id in (
         select org_id from public.org_memberships where user_id = target_user_id
     )
       and event_row.payload is distinct from public.account_deletion_redact_jsonb(
           event_row.payload, target_email, target_user_id, target_full_name
       );

    update public.session_snapshots snapshot
       set manifest = public.account_deletion_redact_jsonb(
           snapshot.manifest, target_email, target_user_id, target_full_name
       ), updated_by = null
     where snapshot.org_id in (
         select org_id from public.org_memberships where user_id = target_user_id
     )
       and snapshot.manifest is distinct from public.account_deletion_redact_jsonb(
           snapshot.manifest, target_email, target_user_id, target_full_name
       );

    if to_regclass('public.report_packages') is not null then
        execute $query$
            update public.report_packages package
               set manifest = public.account_deletion_redact_jsonb(
                       package.manifest, $1, $2, $3
                   ),
                   validation_summary = public.account_deletion_redact_jsonb(
                       package.validation_summary, $1, $2, $3
                   ),
                   weather_metadata = public.account_deletion_redact_jsonb(
                       package.weather_metadata, $1, $2, $3
                   )
             where package.org_id in (
                 select org_id from public.org_memberships where user_id = $2
             )
               and (
                   package.manifest is distinct from public.account_deletion_redact_jsonb(package.manifest, $1, $2, $3)
                   or package.validation_summary is distinct from public.account_deletion_redact_jsonb(package.validation_summary, $1, $2, $3)
                   or package.weather_metadata is distinct from public.account_deletion_redact_jsonb(package.weather_metadata, $1, $2, $3)
               )
        $query$ using target_email, target_user_id, target_full_name;
    end if;

    update public.properties property_row
       set client_email = case
               when lower(property_row.client_email) = lower(target_email) then null
               else property_row.client_email end,
           client_name = case
               when target_full_name is not null
                    and lower(property_row.client_name) = lower(target_full_name) then null
               else property_row.client_name end
     where property_row.org_id in (
         select org_id from public.org_memberships where user_id = target_user_id
     )
       and (lower(property_row.client_email) = lower(target_email)
            or (target_full_name is not null
                and lower(property_row.client_name) = lower(target_full_name)));

    update public.observations observation
       set title = public.account_deletion_redact_text(observation.title, target_email, target_full_name),
           detail = public.account_deletion_redact_text(observation.detail, target_email, target_full_name)
     where observation.org_id in (
         select org_id from public.org_memberships where user_id = target_user_id
     )
       and (position(lower(target_email) in lower(coalesce(observation.title, ''))) > 0
            or position(lower(target_email) in lower(coalesce(observation.detail, ''))) > 0);

    update public.observation_updates update_row
       set message = public.account_deletion_redact_text(update_row.message, target_email, target_full_name),
           note = public.account_deletion_redact_text(update_row.note, target_email, target_full_name)
     where update_row.org_id in (
         select org_id from public.org_memberships where user_id = target_user_id
     )
       and (position(lower(target_email) in lower(coalesce(update_row.message, ''))) > 0
            or position(lower(target_email) in lower(coalesce(update_row.note, ''))) > 0);

    update public.punchlist_activity activity
       set note = public.account_deletion_redact_text(activity.note, target_email, target_full_name),
           filename = public.account_deletion_redact_text(activity.filename, target_email, target_full_name)
     where activity.org_id in (
         select org_id from public.org_memberships where user_id = target_user_id
     )
       and (position(lower(target_email) in lower(coalesce(activity.note, ''))) > 0
            or position(lower(target_email) in lower(coalesce(activity.filename, ''))) > 0);

    if to_regclass('public.report_package_files') is not null then
        execute $query$
            update public.report_package_files file_row
               set filename = public.account_deletion_redact_text(
                   file_row.filename, $1, $3
               )
             where file_row.org_id in (
                 select org_id from public.org_memberships where user_id = $2
             )
               and position(lower($1) in lower(file_row.filename)) > 0
        $query$ using target_email, target_user_id, target_full_name;
    end if;

    update public.temporary_exports export_row
       set filename = public.account_deletion_redact_text(
           export_row.filename, target_email, target_full_name
       )
     where export_row.org_id in (
         select org_id from public.org_memberships where user_id = target_user_id
     )
       and position(lower(target_email) in lower(coalesce(export_row.filename, ''))) > 0;
end;
$$;

revoke all on function public.redact_user_account_metadata(uuid)
    from public, anon, authenticated;
grant execute on function public.redact_user_account_metadata(uuid) to service_role;


-- ==== 202609280004_historical_scope_update_guards.sql ====
-- Scope checks that query parent deleted_at can become false after a valid
-- parent is soft-deleted. A CHECK re-runs for every metadata edit, preventing
-- account-attribution redaction of historical rows. Keep the same predicates
-- for inserts and scope-link changes; leave historical metadata edits possible.
create or replace function public.validate_historical_record_scope_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    scope_valid boolean;
begin
    -- UPDATE OF fires even if a client sends the same link values. Such an
    -- update is still a metadata edit and must not fail on an archived parent.
    if tg_op = 'UPDATE' then
        case tg_table_name
            when 'session_events' then
                if row(new.org_id, new.property_id, new.session_id)
                   is not distinct from row(old.org_id, old.property_id, old.session_id) then return new; end if;
            when 'session_snapshots' then
                if row(new.org_id, new.property_id, new.session_id)
                   is not distinct from row(old.org_id, old.property_id, old.session_id) then return new; end if;
            when 'report_packages', 'temporary_exports' then
                if row(new.org_id, new.property_id, new.session_id, new.snapshot_id)
                   is not distinct from row(old.org_id, old.property_id, old.session_id, old.snapshot_id) then return new; end if;
            when 'report_package_files' then
                if row(new.package_id, new.org_id, new.property_id, new.session_id, new.snapshot_id)
                   is not distinct from row(old.package_id, old.org_id, old.property_id, old.session_id, old.snapshot_id) then return new; end if;
            when 'observations' then
                if row(new.org_id, new.property_id, new.session_id,
                       new.first_seen_session_id, new.last_update_session_id,
                       new.resolved_session_id, new.shot_id)
                   is not distinct from row(old.org_id, old.property_id, old.session_id,
                       old.first_seen_session_id, old.last_update_session_id,
                       old.resolved_session_id, old.shot_id) then return new; end if;
            when 'observation_updates' then
                if row(new.org_id, new.property_id, new.observation_id, new.session_id, new.shot_id)
                   is not distinct from row(old.org_id, old.property_id, old.observation_id, old.session_id, old.shot_id) then return new; end if;
            when 'punchlist_activity' then
                if row(new.org_id, new.property_id, new.observation_id, new.shot_id)
                   is not distinct from row(old.org_id, old.property_id, old.observation_id, old.shot_id) then return new; end if;
        end case;
    end if;
    case tg_table_name
        when 'session_events' then
            scope_valid := public.session_event_insert_scope_valid(
                new.org_id, new.property_id, new.session_id
            );
        when 'session_snapshots' then
            scope_valid := public.session_snapshot_row_matches_parents(
                new.org_id, new.property_id, new.session_id
            );
        when 'report_packages' then
            scope_valid := public.report_artifact_row_matches_parents(
                new.org_id, new.property_id, new.session_id, new.snapshot_id
            );
        when 'temporary_exports' then
            scope_valid := public.report_artifact_row_matches_parents(
                new.org_id, new.property_id, new.session_id, new.snapshot_id
            );
        when 'report_package_files' then
            scope_valid := public.report_package_file_matches_package(
                new.package_id, new.org_id, new.property_id, new.session_id, new.snapshot_id
            );
        when 'observations' then
            scope_valid := public.observation_lineage_scope_valid(
                new.org_id, new.property_id, new.session_id,
                new.first_seen_session_id, new.last_update_session_id,
                new.resolved_session_id, new.shot_id
            );
        when 'observation_updates' then
            scope_valid := public.observation_update_scope_valid(
                new.org_id, new.property_id, new.observation_id,
                new.session_id, new.shot_id
            );
        when 'punchlist_activity' then
            scope_valid := public.punchlist_activity_scope_valid(
                new.org_id, new.property_id, new.observation_id, new.shot_id
            );
        else
            raise exception 'Unreviewed historical scope table: %', tg_table_name;
    end case;
    if scope_valid is false then
        raise exception 'Invalid % organization/property/session scope', tg_table_name;
    end if;
    return new;
end;
$$;

revoke all on function public.validate_historical_record_scope_change()
    from public, anon, authenticated;

alter table public.session_events
    drop constraint if exists session_events_scope_consistency_check;
drop trigger if exists validate_historical_scope on public.session_events;
create trigger validate_historical_scope
    before insert or update of org_id, property_id, session_id
    on public.session_events for each row
    execute function public.validate_historical_record_scope_change();

alter table public.session_snapshots
    drop constraint if exists session_snapshots_parent_match_check;
drop trigger if exists validate_historical_scope on public.session_snapshots;
create trigger validate_historical_scope
    before insert or update of org_id, property_id, session_id
    on public.session_snapshots for each row
    execute function public.validate_historical_record_scope_change();

alter table public.report_packages
    drop constraint if exists report_packages_parent_match_check;
drop trigger if exists validate_historical_scope on public.report_packages;
create trigger validate_historical_scope
    before insert or update of org_id, property_id, session_id, snapshot_id
    on public.report_packages for each row
    execute function public.validate_historical_record_scope_change();

alter table public.temporary_exports
    drop constraint if exists temporary_exports_parent_match_check;
drop trigger if exists validate_historical_scope on public.temporary_exports;
create trigger validate_historical_scope
    before insert or update of org_id, property_id, session_id, snapshot_id
    on public.temporary_exports for each row
    execute function public.validate_historical_record_scope_change();

alter table public.report_package_files
    drop constraint if exists report_package_files_package_match_check;
drop trigger if exists validate_historical_scope on public.report_package_files;
create trigger validate_historical_scope
    before insert or update of package_id, org_id, property_id, session_id, snapshot_id
    on public.report_package_files for each row
    execute function public.validate_historical_record_scope_change();

alter table public.observations
    drop constraint if exists observations_lineage_scope_check;
drop trigger if exists validate_historical_scope on public.observations;
create trigger validate_historical_scope
    before insert or update of org_id, property_id, session_id,
        first_seen_session_id, last_update_session_id, resolved_session_id, shot_id
    on public.observations for each row
    execute function public.validate_historical_record_scope_change();

alter table public.observation_updates
    drop constraint if exists observation_updates_scope_check;
drop trigger if exists validate_historical_scope on public.observation_updates;
create trigger validate_historical_scope
    before insert or update of org_id, property_id, observation_id, session_id, shot_id
    on public.observation_updates for each row
    execute function public.validate_historical_record_scope_change();

alter table public.punchlist_activity
    drop constraint if exists punchlist_activity_scope_check;
drop trigger if exists validate_historical_scope on public.punchlist_activity;
create trigger validate_historical_scope
    before insert or update of org_id, property_id, observation_id, shot_id
    on public.punchlist_activity for each row
    execute function public.validate_historical_record_scope_change();


-- ==== 202609280005_organization_retention_purge.sql ====
-- Purge an organization only after its 90-day grace period, once all customer
-- memberships are inactive. Storage is removed first by the service worker;
-- the final database deletion is atomic and refuses to run while files remain.
-- This migration does not schedule the worker or delete any existing data.

-- Serialize a returning customer with the worker's claim/finalize operations.
create or replace function public.guard_purging_organization_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    retention_status text;
begin
    if new.deleted_at is not null then return new; end if;
    select schedule.status into retention_status
      from public.organization_retention_schedule schedule
     where schedule.org_id = new.org_id
     for update;
    if retention_status = 'purging' then
        raise exception 'Organization data removal is already in progress';
    end if;
    if retention_status = 'scheduled' then
        update public.organization_retention_schedule
           set status = 'canceled', updated_at = timezone('utc', now()), last_error = null
         where org_id = new.org_id;
    end if;
    return new;
end;
$$;

drop trigger if exists guard_purging_organization_membership on public.org_memberships;
create trigger guard_purging_organization_membership
    before insert or update of org_id, user_id, deleted_at
    on public.org_memberships for each row
    execute function public.guard_purging_organization_membership();

create or replace function public.claim_next_organization_purge(
    trusted_admin_emails text[] default '{}'::text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    claimed_org_id uuid;
begin
    if cardinality(trusted_admin_emails) = 0 then
        raise exception 'Platform admin exclusion list is required';
    end if;
    update public.organization_retention_schedule schedule
       set status = 'purging', updated_at = timezone('utc', now()), last_error = null
     where schedule.org_id = (
         select candidate.org_id
           from public.organization_retention_schedule candidate
          where ((candidate.status = 'scheduled'
                  and candidate.purge_after <= timezone('utc', now()))
              or (candidate.status = 'purging'
                  and candidate.updated_at < timezone('utc', now()) - interval '15 minutes'))
            and not exists (
                select 1 from public.org_memberships member
                join public.users_profile profile on profile.id = member.user_id
                where member.org_id = candidate.org_id
                  and member.deleted_at is null
                  and lower(coalesce(profile.email, '')) <> all(trusted_admin_emails)
            )
          order by case when candidate.status = 'scheduled' then 0 else 1 end,
                   candidate.purge_after
          for update skip locked
          limit 1
     )
    returning schedule.org_id into claimed_org_id;
    return claimed_org_id;
end;
$$;

-- Exact storage rows, including unindexed objects under the reviewed prefixes.
-- Return an unfamiliar bucket to the worker so it fails closed.
create or replace function public.organization_purge_storage_objects(target_org_id uuid)
returns table (bucket_id text, object_name text)
language sql
security definer
set search_path = public
as $$
    select object_row.bucket_id, object_row.name
      from storage.objects object_row
     where object_row.name like 'orgs/' || target_org_id::text || '/%'
        or object_row.name like 'punchlist-completions/orgs/' || target_org_id::text || '/%'
        or exists (
            select 1 from public.sessions session_row
             where session_row.org_id = target_org_id
               and object_row.name like 'sessions/' || session_row.id::text || '/%'
        )
        or exists (
            select 1 from public.shots shot
             where shot.org_id = target_org_id
               and shot.storage_bucket = object_row.bucket_id
               and shot.storage_path = object_row.name
        )
        or exists (
            select 1 from public.session_snapshots snapshot
             where snapshot.org_id = target_org_id
               and snapshot.payload_storage_bucket = object_row.bucket_id
               and snapshot.payload_storage_path = object_row.name
        )
        or exists (
            select 1 from public.punchlist_activity activity
             where activity.org_id = target_org_id
               and activity.storage_bucket = object_row.bucket_id
               and activity.storage_path = object_row.name
        )
        or exists (
            select 1 from public.report_package_files file_row
             where file_row.org_id = target_org_id
               and file_row.storage_bucket = object_row.bucket_id
               and file_row.storage_path = object_row.name
        )
        or exists (
            select 1 from public.temporary_exports export_row
             where export_row.org_id = target_org_id
               and export_row.storage_bucket = object_row.bucket_id
               and export_row.storage_path = object_row.name
        )
     order by object_row.bucket_id, object_row.name;
$$;

create or replace function public.finish_organization_purge(
    target_org_id uuid,
    trusted_admin_emails text[] default '{}'::text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    retention_row public.organization_retention_schedule%rowtype;
    table_name text;
    tables_to_delete text[] := array[
        'report_package_email_notifications', 'report_package_files',
        'temporary_exports', 'observation_updates', 'punchlist_activity',
        'report_packages', 'session_events', 'session_snapshots',
        'observations', 'shots', 'portal_invite_property_grants',
        'property_access_grants', 'property_session_occupancy',
        'property_status', 'sessions', 'portal_invites', 'org_invitations',
        'org_memberships', 'report_email_user_preferences',
        'report_email_org_settings', 'properties'
    ];
begin
    if cardinality(trusted_admin_emails) = 0 then
        raise exception 'Platform admin exclusion list is required';
    end if;
    select * into retention_row
      from public.organization_retention_schedule
     where org_id = target_org_id for update;
    if not found or retention_row.status <> 'purging'
       or retention_row.purge_after > timezone('utc', now()) then
        raise exception 'Organization is not eligible for purge';
    end if;
    if exists (
        select 1 from public.org_memberships member
        join public.users_profile profile on profile.id = member.user_id
        where member.org_id = target_org_id
          and member.deleted_at is null
          and lower(coalesce(profile.email, '')) <> all(trusted_admin_emails)
    ) then
        raise exception 'Organization has an active customer';
    end if;
    if exists (select 1 from public.organization_purge_storage_objects(target_org_id)) then
        raise exception 'Organization Storage objects remain';
    end if;
    foreach table_name in array tables_to_delete loop
        execute format('delete from public.%I where org_id = $1', table_name)
            using target_org_id;
    end loop;
    delete from public.orgs where id = target_org_id;
end;
$$;

revoke all on function public.guard_purging_organization_membership() from public, anon, authenticated;
revoke all on function public.claim_next_organization_purge(text[]) from public, anon, authenticated;
revoke all on function public.organization_purge_storage_objects(uuid) from public, anon, authenticated;
revoke all on function public.finish_organization_purge(uuid, text[]) from public, anon, authenticated;
grant execute on function public.claim_next_organization_purge(text[]) to service_role;
grant execute on function public.organization_purge_storage_objects(uuid) to service_role;
grant execute on function public.finish_organization_purge(uuid, text[]) to service_role;


commit;

-- The SQL Editor should show one row with five true values after success.
select
    to_regclass('public.account_deletion_requests') is not null as requests_ready,
    to_regclass('public.organization_retention_schedule') is not null as retention_ready,
    to_regprocedure('public.redact_user_account_metadata(uuid)') is not null as metadata_ready,
    to_regprocedure('public.claim_next_organization_purge(text[])') is not null as claim_ready,
    to_regprocedure('public.finish_organization_purge(uuid,text[])') is not null as purge_ready;
