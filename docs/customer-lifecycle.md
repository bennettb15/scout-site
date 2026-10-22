# Customer dates and access expiration

The private `/admin/customers` page records pilot and ongoing agreement dates for each organization. Only `brian@scoutclear.com` and `bennettb15@gmail.com` can read or edit these records. The API enforces this restriction, and other organization managers and owners do not receive platform admin email rows from Portal Access.

- The pilot cutoff defaults to exactly 30 days after the signed timestamp. A written extension can be recorded by changing the pilot expiration.
- An ongoing subscription needs a start date. Its end date stays blank while monthly access renews; when the customer cancels, enter the end of the current paid period. An ongoing start cannot be later than the pilot cutoff. Once ongoing access starts, its optional end date replaces the pilot cutoff.
- Saving a cutoff that has already passed requires confirmation and runs access expiration immediately.
- The existing daily Vercel cron also revokes customer organization memberships and pending invites once a cutoff passes. The cron runs at 03:00 UTC, so scheduled revocation can occur up to about a day after the timestamp. Platform admin memberships remain for cleanup.
- The existing organization retention process then schedules data removal after 90 days without active customer memberships. New dates do not restore revoked memberships; invite the customer again through Portal Access.

Apply `supabase/migrations/202610190001_customer_lifecycle.sql` first, then `supabase/migrations/202610220001_open_ended_ongoing_access.sql`, before deploying the website code. The existing `ACCOUNT_DELETION_WORKER_ENABLED=true` production setting must remain enabled for the daily expiration job.
