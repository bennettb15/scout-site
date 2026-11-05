# On-demand property reports

## Behavior

The Reports page offers a Tenant Comparison PDF per property. The user selects a Full Documentation baseline; the endpoint defaults to the newest ready Property Report version. An optional end-version selector supports historical comparisons. Version discovery paginates independently of the portal's Latest Only/two-package query.

The worker reuses the existing report-input composition, media preparation, and PDF renderer. Both endpoints are pinned to report-package snapshots. When stored multi-session provenance exists, those exact source snapshots are reused. Snapshot-only composition excludes today's workflow overlays from historical comparisons. Matches use unchanged photo IDs, Guided Shot IDs, or issue IDs. A unique documented-view fallback is labeled explicitly; conflicting or ambiguous identities remain unmatched. Each photo displays its original capture time, and an identical photo is labeled as having no newer documentation.

The Punch List page offers All Open & Resolved PDF for one selected property. Each item has a full page with its original flagged photo on the left. The right shows an open-item placeholder, the latest pending submission, or the photo tied to the latest approval in the current resolution cycle. Original images are selected by stable issue identity and capture date, never by location alone. Legacy resolved items without approval evidence are shown honestly as missing an approved completion photo. Future direct status changes cannot bypass completion-photo review.

The report groups open, pending-review, and resolved items, retains every note with its author and timestamp, and adds Notes continued pages as needed without shrinking or truncating text. Continuation pages repeat the property's location, item identity, and status. The index accounts for continuation pages. Data loads all pages rather than applying the screen's row cap. The existing open-only, trade-selected export retains its layout.

Both new outputs use the private `scoutcapture-on-demand` bucket and service-only `on_demand_report_requests` records. No new source photos, session snapshots, report packages, historical PDFs, or report-ready emails are created. Ready downloads expire after one hour; signed links last at most five minutes. The normal report-worker poll deletes expired files and their request records, including interrupted uploads. Queued requests expire after one day. Physical cleanup requires a healthy scheduled worker; expired tenant requests are denied by the API immediately.

## Coordinated rollout

1. Apply `supabase/migrations/202611050001_on_demand_report_requests.sql` once to the shared project. The same migration is mirrored in ScoutCapture for consistent local resets.
2. Release the ScoutCapture worker changes, including `tenant_comparison.py` and the new workflow input, to the default branch. Confirm `PDF_REPORT_PACKAGE_WORKER_ENABLED=true` so expiry cleanup and queue fallback continue running.
3. Deploy the updated `report-package-dispatch` Supabase function using its existing JWT configuration and existing secrets. Its new path accepts the server service key and dispatches only a queued tenant request. The existing snapshot webhook secret path is preserved.
4. Release the Website changes. No new secrets are required: the server already uses the Supabase service role; the dispatcher already has its GitHub workflow token.

Tenant generation is asynchronous and normally dispatches immediately. If dispatch fails, the normal scheduled poll processes the queued request. The UI polls for readiness and offers a temporary download. Complete punchlists render in the Website's existing PDFKit function and upload directly to temporary storage, avoiding large API response bodies.

## Verification

- Choose an older full baseline after several selective visits; verify it is still selectable.
- Compare against Latest and against a selected older endpoint. Later photos must not enter the older endpoint.
- Include an updated issue, an unchanged photo, a new issue, a missing view, and distinct issues sharing a location.
- Export a property with open, pending-review, and resolved items. Screen tab, priority, and trade filters must not remove items from the complete export.
- Verify another organization/property/user cannot download the request, and that expired requests are refused and cleaned up.
- Confirm stored report packages and prior PDFs are unchanged.

Local verification includes Python worker tests, Website Node tests, mocked dispatcher requests, a rolled-back local SQL migration/permission test, Website production build, and rendered synthetic sample PDFs. A live smoke test remains part of rollout; local checks do not dispatch production work.
