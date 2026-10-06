import process from "node:process";
import { adminEmailSet } from "../../api-lib/portalAdminAccess.js";
import { createServiceClient, methodAllowed, sendJson } from "../_reportPortalShared.js";
import { processNextAccountDeletion } from "../../api-lib/accountDeletionProcessor.js";
import { processNextOrganizationPurge } from "../../api-lib/organizationPurgeProcessor.js";

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return sendJson(res, 401, { error: "Unauthorized" });
  }
  if (process.env.ACCOUNT_DELETION_WORKER_ENABLED !== "true") {
    return sendJson(res, 503, { error: "Account deletion worker is not enabled." });
  }
  try {
    const service = createServiceClient();
    const { error: reconciliationError } = await service.rpc("reconcile_org_retention_schedule", {
      trusted_admin_emails: [...adminEmailSet()],
    });
    if (reconciliationError) throw reconciliationError;
    let account;
    let organization;
    let failed = false;
    try {
      account = await processNextAccountDeletion(service);
    } catch (error) {
      console.error("Account deletion worker failed:", error);
      account = { status: "failed" };
      failed = true;
    }
    try {
      organization = await processNextOrganizationPurge(service);
    } catch (error) {
      console.error("Organization purge worker failed:", error);
      organization = { status: "failed" };
      failed = true;
    }
    return sendJson(res, failed ? 500 : 200, { account, organization });
  } catch (error) {
    console.error("Deletion cron failed:", error);
    return sendJson(res, 500, { error: "Deletion job failed; it will be retried." });
  }
}
