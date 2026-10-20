-- Report email settings belong to signed-in organization members.
-- Keep authenticated and service-role grants unchanged; RLS continues to
-- restrict members and owners to the appropriate organization.
revoke all privileges on table public.report_email_org_settings from anon;
revoke all privileges on table public.report_email_user_preferences from anon;
