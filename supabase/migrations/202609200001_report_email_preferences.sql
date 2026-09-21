create table if not exists public.report_email_org_settings (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  report_ready_enabled boolean not null default true,
  updated_by uuid references public.users_profile(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_email_user_preferences (
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references public.users_profile(id) on delete cascade,
  report_ready_enabled boolean not null default true,
  updated_by uuid references public.users_profile(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

drop trigger if exists report_email_org_settings_set_updated_at on public.report_email_org_settings;
create trigger report_email_org_settings_set_updated_at
  before update on public.report_email_org_settings
  for each row execute function public.set_updated_at();

drop trigger if exists report_email_user_preferences_set_updated_at on public.report_email_user_preferences;
create trigger report_email_user_preferences_set_updated_at
  before update on public.report_email_user_preferences
  for each row execute function public.set_updated_at();

alter table public.report_email_org_settings enable row level security;
alter table public.report_email_user_preferences enable row level security;

grant select, insert, update, delete on public.report_email_org_settings to authenticated, service_role;
grant select, insert, update, delete on public.report_email_user_preferences to authenticated, service_role;

drop policy if exists "members can view report email org settings" on public.report_email_org_settings;
create policy "members can view report email org settings"
  on public.report_email_org_settings
  for select
  using (public.is_org_member(org_id));

drop policy if exists "owners can manage report email org settings" on public.report_email_org_settings;
create policy "owners can manage report email org settings"
  on public.report_email_org_settings
  for all
  using (public.has_org_role(org_id, array['owner']))
  with check (
    public.has_org_role(org_id, array['owner'])
    and public.updated_by_matches_actor(updated_by)
  );

drop policy if exists "members can view report email user preferences" on public.report_email_user_preferences;
create policy "members can view report email user preferences"
  on public.report_email_user_preferences
  for select
  using (public.is_org_member(org_id));

drop policy if exists "owners can manage report email user preferences" on public.report_email_user_preferences;
create policy "owners can manage report email user preferences"
  on public.report_email_user_preferences
  for all
  using (public.has_org_role(org_id, array['owner']))
  with check (
    public.has_org_role(org_id, array['owner'])
    and public.updated_by_matches_actor(updated_by)
  );

comment on table public.report_email_org_settings is
  'Organization-level report-ready email notification preference.';
comment on table public.report_email_user_preferences is
  'Per-user report-ready email notification preference within an organization.';
