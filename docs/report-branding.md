# Organization report logos

Report logos are optional and scoped to one organization. New reports use the uploaded logo in the report header and cover, with a small Scout mark in the footer. Without an uploaded logo, reports keep the existing Scout branding. Previously generated PDFs are unchanged.

## Test Org rollout

1. Apply `supabase/migrations/202611080001_org_report_branding.sql` to the shared Supabase project. The same migration is mirrored in ScoutCapture.
2. Release the ScoutCapture report worker changes to `main`. The scheduled worker reads the optional private logo for property, priority, flagged comparison, and tenant comparison reports.
3. Release the website changes. Set the Vercel production environment variable `SCOUT_REPORT_BRANDING_ORG_IDS=d4ba94ff-25e1-4072-aa79-9a548fcb3008` and redeploy. This exposes the upload control only for Test Org in Portal Access.
4. Upload a Test Org logo. Generate a new worker report and a new punch list PDF, then verify the top logo and Scout footer. Remove the logo and generate another report to verify the Scout default.

To expand after testing, add more organization UUIDs to the comma-separated environment variable and redeploy. Each organization keeps the Scout default until its admin uploads a logo. The worker needs no organization allowlist because it only brands reports for organizations with a saved logo row.

The upload endpoint accepts PNG, JPEG, and WebP files up to 3 MB and stores a normalized PNG that fits within 1600 × 600 pixels and is at most 2 MB. The storage bucket is private. Only platform admins and organization owners or organization-wide managers can change an enabled organization's logo.
