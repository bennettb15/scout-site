-- Run ONLY against an isolated, disposable Supabase-compatible database.
-- Synthetic rows are rolled back. Never run this file on the live project.
begin;

do $$
declare
    admin_id uuid := '10000000-0000-4000-8000-000000000001';
    departing_id uuid := '10000000-0000-4000-8000-000000000002';
    remaining_id uuid := '10000000-0000-4000-8000-000000000003';
    active_org_id uuid := '20000000-0000-4000-8000-000000000001';
    inactive_org_id uuid := '20000000-0000-4000-8000-000000000002';
    property_id uuid := '30000000-0000-4000-8000-000000000001';
    session_id uuid := '40000000-0000-4000-8000-000000000001';
    snapshot_id uuid := '50000000-0000-4000-8000-000000000001';
    package_id uuid := '60000000-0000-4000-8000-000000000001';
    request_id uuid;
    claimed_org_id uuid;
    account_email text := 'departing-account@example.test';
    snapshot_path text;
begin
    insert into auth.users (id, email, aud, role, raw_user_meta_data, created_at, updated_at)
    values
      (admin_id, 'brian@scoutclear.com', 'authenticated', 'authenticated', '{}'::jsonb, now(), now()),
      (departing_id, account_email, 'authenticated', 'authenticated', '{"full_name":"Departing Account"}'::jsonb, now(), now()),
      (remaining_id, 'remaining@example.test', 'authenticated', 'authenticated', '{}'::jsonb, now(), now());

    insert into public.orgs (id, name) values
      (active_org_id, 'Active test organization'),
      (inactive_org_id, 'Inactive test organization');
    insert into public.org_memberships (org_id, user_id, role) values
      (active_org_id, departing_id, 'field'),
      (active_org_id, remaining_id, 'field'),
      (inactive_org_id, departing_id, 'field');
    insert into public.properties (id, org_id, name, client_email, client_name)
    values (property_id, active_org_id, 'Test property', account_email, 'Departing Account');
    insert into public.sessions (id, org_id, property_id, title, status)
    values (session_id, active_org_id, property_id, 'Test capture', 'completed');
    snapshot_path := public.session_snapshot_expected_storage_path(
      active_org_id, property_id, session_id, 'completed', snapshot_id
    );
    insert into public.session_snapshots (
      id, org_id, property_id, session_id, snapshot_kind,
      snapshot_schema_version, trigger, session_status, is_sealed,
      payload_storage_bucket, payload_storage_path, payload_byte_size,
      raw_session_json_sha256, snapshot_payload_sha256, manifest,
      created_by, updated_by
    ) values (
      snapshot_id, active_org_id, property_id, session_id, 'completed',
      1, 'manual', 'completed', true,
      'scoutcapture-session-snapshots', snapshot_path, 100,
      repeat('a', 64), repeat('b', 64),
      jsonb_build_object('actor', jsonb_build_object('userID', departing_id, 'email', account_email)),
      departing_id, departing_id
    );
    insert into public.report_packages (
      id, org_id, property_id, session_id, snapshot_id, status,
      idempotency_key, session_completed_at, renderer_version, manifest
    ) values (
      package_id, active_org_id, property_id, session_id, snapshot_id, 'ready',
      'account-deletion-disposable-test', now(), 'test',
      jsonb_build_object('uploadedByEmail', account_email, 'uploadedByUserID', departing_id)
    );
    insert into public.session_events (org_id, session_id, event_type, payload)
    values (active_org_id, session_id, 'test_event',
      jsonb_build_object('actorEmail', account_email, 'actorUserID', departing_id));
    -- Completed sessions can later be archived. Their historical metadata must
    -- still be redacted without altering a saved report or capture.
    update public.sessions set deleted_at = now() where id = session_id;
    -- A client may submit the existing scope while editing historical metadata.
    update public.session_events event_row set org_id = active_org_id
      where event_row.event_type = 'test_event';
    update public.session_snapshots snapshot set org_id = active_org_id
      where snapshot.snapshot_kind = 'completed';

    begin
      insert into public.session_events (org_id, session_id, event_type, payload)
      values (inactive_org_id, session_id, 'invalid_cross_org', '{}'::jsonb);
      raise exception 'Cross-organization activity insert was accepted';
    exception when check_violation or raise_exception then
      if sqlerrm = 'Cross-organization activity insert was accepted' then
        raise;
      end if;
    end;

    request_id := public.request_user_account_deletion(
      departing_id, array['brian@scoutclear.com', 'bennettb15@gmail.com']
    );
    if request_id is null then raise exception 'No deletion request was created'; end if;
    if exists (select 1 from public.org_memberships where user_id = departing_id and deleted_at is null) then
      raise exception 'Departing member retained organization access';
    end if;
    if exists (select 1 from public.organization_retention_schedule where org_id = active_org_id) then
      raise exception 'Active customer organization was scheduled for purge';
    end if;
    if not exists (
      select 1 from public.organization_retention_schedule
      where org_id = inactive_org_id and status = 'scheduled'
        and purge_after >= now() + interval '89 days'
    ) then raise exception 'Inactive customer organization was not scheduled'; end if;
    if exists (select 1 from public.users_profile where id = departing_id and email is not null) then
      raise exception 'Profile email was not cleared';
    end if;

    perform public.redact_user_account_metadata(departing_id);
    if exists (select 1 from public.properties where id = property_id and client_email is not null) then
      raise exception 'Property contact email was not cleared';
    end if;
    if exists (select 1 from public.session_events where org_id = active_org_id and payload::text ilike '%' || account_email || '%') then
      raise exception 'Activity JSON still contains account email';
    end if;
    if exists (select 1 from public.report_packages where id = package_id and manifest::text ilike '%' || account_email || '%') then
      raise exception 'Report manifest still contains account email';
    end if;
    if exists (select 1 from public.session_snapshots where id = snapshot_id and manifest::text ilike '%' || account_email || '%') then
      raise exception 'Snapshot manifest still contains account email';
    end if;

    perform public.prepare_user_account_hard_delete(departing_id);
    delete from auth.users where id = departing_id;
    if exists (select 1 from public.users_profile where id = departing_id) then
      raise exception 'Auth deletion left a profile';
    end if;
    if not exists (select 1 from public.report_packages where id = package_id) then
      raise exception 'Shared report was removed';
    end if;
    if not exists (select 1 from public.sessions where id = session_id) then
      raise exception 'Shared capture was removed';
    end if;
    if not exists (select 1 from public.org_memberships where org_id = active_org_id and user_id = remaining_id and deleted_at is null) then
      raise exception 'Remaining customer lost access';
    end if;
    if exists (select 1 from public.session_snapshots where id = snapshot_id and created_by is not null) then
      raise exception 'Snapshot author ID was not cleared';
    end if;

    -- A new customer before day 90 must cancel the company-data purge.
    insert into public.org_memberships (org_id, user_id, role)
    values (inactive_org_id, remaining_id, 'field');
    perform public.reconcile_org_retention_schedule(
      array['brian@scoutclear.com', 'bennettb15@gmail.com']
    );
    if not exists (
      select 1 from public.organization_retention_schedule
      where org_id = inactive_org_id and status = 'canceled'
    ) then raise exception 'New customer did not cancel organization purge'; end if;

    update public.org_memberships set deleted_at = now()
    where org_id = inactive_org_id and user_id = remaining_id;
    perform public.reconcile_org_retention_schedule(
      array['brian@scoutclear.com', 'bennettb15@gmail.com']
    );
    if not exists (
      select 1 from public.organization_retention_schedule
      where org_id = inactive_org_id and status = 'scheduled'
    ) then raise exception 'Inactive organization was not rescheduled'; end if;
    -- Advance only the synthetic organization clock in this rollback-only test.
    update public.organization_retention_schedule
       set purge_after = now() - interval '1 day'
     where org_id = inactive_org_id;
    claimed_org_id := public.claim_next_organization_purge(
      array['brian@scoutclear.com', 'bennettb15@gmail.com']
    );
    if claimed_org_id is distinct from inactive_org_id then
      raise exception 'Wrong organization claimed for purge';
    end if;
    begin
      insert into public.org_memberships (org_id, user_id, role)
      values (inactive_org_id, admin_id, 'owner');
      raise exception 'Membership was accepted during organization purge';
    exception when raise_exception then
      if sqlerrm = 'Membership was accepted during organization purge' then raise; end if;
    end;
    insert into storage.buckets (id, name)
    values ('scoutcapture-deliverables', 'scoutcapture-deliverables')
    on conflict (id) do nothing;
    insert into storage.objects (bucket_id, name)
    values ('scoutcapture-deliverables',
      'orgs/' || inactive_org_id::text || '/synthetic-test.pdf');
    if not exists (
      select 1 from public.organization_purge_storage_objects(inactive_org_id)
      where bucket_id = 'scoutcapture-deliverables'
    ) then raise exception 'Organization file was not discovered'; end if;
    begin
      perform public.finish_organization_purge(
        inactive_org_id, array['brian@scoutclear.com', 'bennettb15@gmail.com']
      );
      raise exception 'Organization was purged while a file remained';
    exception when raise_exception then
      if sqlerrm = 'Organization was purged while a file remained' then raise; end if;
    end;
    -- Simulate Storage API removal in this disposable SQL-only test.
    execute 'alter table storage.objects disable trigger protect_objects_delete';
    delete from storage.objects
     where bucket_id = 'scoutcapture-deliverables'
       and name = 'orgs/' || inactive_org_id::text || '/synthetic-test.pdf';
    execute 'alter table storage.objects enable trigger protect_objects_delete';
    perform public.finish_organization_purge(
      inactive_org_id, array['brian@scoutclear.com', 'bennettb15@gmail.com']
    );
    if exists (select 1 from public.orgs where id = inactive_org_id) then
      raise exception 'Inactive organization was not purged';
    end if;
    if not exists (select 1 from public.orgs where id = active_org_id) then
      raise exception 'Active organization was purged';
    end if;

    -- The second organization contains a property, archived session,
    -- snapshot, report package, and event. All must purge in FK-safe order.
    update public.org_memberships set deleted_at = now()
     where org_id = active_org_id and user_id = remaining_id;
    perform public.reconcile_org_retention_schedule(
      array['brian@scoutclear.com', 'bennettb15@gmail.com']
    );
    update public.organization_retention_schedule
       set purge_after = now() - interval '1 day'
     where org_id = active_org_id;
    claimed_org_id := public.claim_next_organization_purge(
      array['brian@scoutclear.com', 'bennettb15@gmail.com']
    );
    if claimed_org_id is distinct from active_org_id then
      raise exception 'Populated organization was not claimed';
    end if;
    perform public.finish_organization_purge(
      active_org_id, array['brian@scoutclear.com', 'bennettb15@gmail.com']
    );
    if exists (select 1 from public.orgs where id = active_org_id)
       or exists (select 1 from public.properties where id = property_id)
       or exists (select 1 from public.sessions where id = session_id)
       or exists (select 1 from public.session_snapshots where id = snapshot_id)
       or exists (select 1 from public.report_packages where id = package_id) then
      raise exception 'Populated organization records survived purge';
    end if;
end;
$$;

rollback;
