# Account deletion launch status

## Live pilot, 28 September 2026

- The five account-deletion SQL migrations were applied to Supabase project `chlvazmtucoszicehtnm` in one transaction through SQL Editor. The returned readiness checks were `true,true,true,true,true` for requests, retention, metadata, claim, and purge.
- The portal deployment was promoted to production with `ACCOUNT_DELETION_PILOT_EMAILS` set only to the disposable test account. `ACCOUNT_DELETION_WORKER_ENABLED=true`; the global `ACCOUNT_DELETION_ENABLED` variable is absent. General users cannot submit a deletion request yet.
- The production cron route is scheduled daily at 03:00 UTC and requires `CRON_SECRET`. The on-demand path was deployed to production as `dpl_FwRL2aHsxHKc6k1nCtKNZ4PkFbyM`; it applies to new requests. Requests made before this deployment still rely on a worker retry. An authenticated manual invocation returned both `account: idle` and `organization: idle` before the pilot request. The disposable account request completed in the live worker, followed by an idle run.
- The public `/account` page returned 200 and the cron route returned 401 without its secret.
- Portal unit tests passed (160 tests). The on-demand files passed syntax checks; the current focused lint attempt stalled on local file reads. Full repository lint still has unrelated existing errors. The production Vercel build and unsigned iOS Release build passed using external SSD build paths.

## Build 18 website and deletion check, 6 October 2026

- The prepared privacy and account pages were restored to production. The existing app links through `www.scoutclear.com` and the Reports Portal route each returned HTTP 200 after deployment. Privacy, account, reports, and contact pages were checked at phone and desktop widths; a mobile marketing-page overflow was corrected. A labeled live contact-form submission displayed its success message.
- The user reported that the disposable `+6` account submitted deletion through the live account page, received the account-deleted email, and can no longer sign in. This confirms end-to-end deletion for that account. Whether `+6` was outside the pilot allowlist was not independently established; Vercel hides the production feature-flag values on readback.
- The deployed work is saved in draft PR #1 (`codex/scoutclear-app-links`). It remains unmerged, so a future Git deployment from `main` could replace the restored routes.

## Remaining before general availability

1. Confirm whether the deleted `+6` account was outside `ACCOUNT_DELETION_PILOT_EMAILS`. It received the completion email and cannot sign in, but pilot-list membership was not independently verified. The earlier `+4` captured-user pilot confirmed that an authorized admin could still open the retained report with “Captured by System.”
2. Review the live Storage paths and any newly added database references or buckets. The worker fails closed for unfamiliar buckets, but classification must be updated before those users or organizations can be cleaned up.
3. Confirm the current production value of `ACCOUNT_DELETION_ENABLED` through a trusted admin view or an authenticated non-pilot test. Vercel's sensitive-variable readback masks it. If it is false, explicitly approve enabling it for all eligible users and redeploy. Remove the pilot allowlist after confirming global availability. Monitor failed deletion requests and retention schedules; the daily cron remains a fallback for interrupted jobs.
4. Install and test the iOS build containing its Manage Account link. Prepare a separate invited App Review account with a password and suitable organization access. Explain the invite-only flow and direct portal deletion link in App Review notes. Do not upload or submit until the final build is ready.
5. Review and merge draft PR #1 so future deployments from `main` retain the restored privacy and account routes.

The deletion flow removes the Supabase Auth login and profile, revokes every membership immediately, scrubs account attribution in supported records, and retains active organizations' shared captures/reports. An organization with no active customer members is scheduled for cleanup after 90 days. The cleanup worker refuses unknown Storage buckets and new required user references, preserving data for manual review rather than deleting it blindly.

[Apple's account deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app) allows the app to link directly to a website that finishes deletion; it expects a clear deletion path and a completion notice when processing is delayed.
