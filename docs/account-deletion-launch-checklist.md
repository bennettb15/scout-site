# Account deletion launch status

## Live pilot, 28 September 2026

- The five account-deletion SQL migrations were applied to Supabase project `chlvazmtucoszicehtnm` in one transaction through SQL Editor. The returned readiness checks were `true,true,true,true,true` for requests, retention, metadata, claim, and purge.
- The portal deployment was promoted to production with `ACCOUNT_DELETION_PILOT_EMAILS` set only to the disposable test account. `ACCOUNT_DELETION_WORKER_ENABLED=true`; the global `ACCOUNT_DELETION_ENABLED` variable is absent. General users cannot submit a deletion request yet.
- The production cron route is scheduled daily at 03:00 UTC and requires `CRON_SECRET`. The on-demand path was deployed to production as `dpl_FwRL2aHsxHKc6k1nCtKNZ4PkFbyM`; it applies to new requests. Requests made before this deployment still rely on a worker retry. An authenticated manual invocation returned both `account: idle` and `organization: idle` before the pilot request. The disposable account request completed in the live worker, followed by an idle run.
- The public `/account` page returned 200 and the cron route returned 401 without its secret.
- Portal unit tests passed (160 tests). The on-demand files passed syntax checks; the current focused lint attempt stalled on local file reads. Full repository lint still has unrelated existing errors. The production Vercel build and unsigned iOS Release build passed using external SSD build paths.

## Remaining before general availability

1. Finish the disposable account verification in a test organization: the `/account` request was accepted and the worker reported `completed`; confirm from the user that old credentials fail, the completion email arrived, and another member can still see business data. Check the applicable 90-day schedule or cancellation. The pilot account already existed and had no completed session, so it did not live-test departing-user attribution in a report. The earlier invitation/password setup test covers the new-user login path; a second disposable captured-user test remains desirable before general availability.
2. Review the live Storage paths and any newly added database references or buckets. The worker fails closed for unfamiliar buckets, but classification must be updated before those users or organizations can be cleaned up.
3. After the live test succeeds, set `ACCOUNT_DELETION_ENABLED=true` in Vercel production and redeploy. Remove the pilot allowlist afterward. Monitor failed deletion requests and retention schedules. New requests start an on-demand background job when the worker flag is enabled; the daily cron remains a fallback for failed or interrupted jobs. Large jobs that exceed one function run may still require a later retry.
4. Install and test the iOS build containing its Manage Account link. Prepare an invited App Review test account with a password and suitable organization access. Explain the invite-only flow and the direct portal deletion link in App Review notes. Do not upload or submit until the final build is ready.
5. Keep the portal and app repository changes in version control after verification. The direct Vercel production deployment currently contains uncommitted local portal changes.

The deletion flow removes the Supabase Auth login and profile, revokes every membership immediately, scrubs account attribution in supported records, and retains active organizations' shared captures/reports. An organization with no active customer members is scheduled for cleanup after 90 days. The cleanup worker refuses unknown Storage buckets and new required user references, preserving data for manual review rather than deleting it blindly.

[Apple's account deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app) allows the app to link directly to a website that finishes deletion; it expects a clear deletion path and a completion notice when processing is delayed.
