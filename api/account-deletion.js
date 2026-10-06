import { waitUntil } from "@vercel/functions";
import { adminEmailSet } from "../api-lib/portalAdminAccess.js";
import { processRequestedAccountDeletion } from "../api-lib/accountDeletionProcessor.js";
import { deletionEnabledFor } from "../api-lib/accountDeletionFeature.js";
import { readJsonBody } from "./_portalAdminShared.js";
import {
  authenticateRequest,
  createServiceClient,
  methodAllowed,
  sendJson,
} from "./_reportPortalShared.js";

export { deletionEnabledFor };

export function scheduleImmediateAccountDeletion(
  service,
  requestId,
  userId,
  { schedule = waitUntil, runWorker = processRequestedAccountDeletion, logError = console.error } = {}
) {
  if (process.env.ACCOUNT_DELETION_WORKER_ENABLED !== "true" || !requestId || !userId) return false;
  try {
    schedule(Promise.resolve().then(() => runWorker(service, { requestId, userId })).catch((error) => {
      logError("On-demand account deletion failed; the scheduled worker will retry:", error);
    }));
    return true;
  } catch (error) {
    logError("Could not start on-demand account deletion; the scheduled worker will retry:", error);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    methodAllowed(req, res, ["GET", "POST", "OPTIONS"]);
    return;
  }
  if (!methodAllowed(req, res, ["GET", "POST", "OPTIONS"])) return;

  const auth = await authenticateRequest(req, { allowDeletionPending: true });
  if (auth.error) return sendJson(res, 401, { error: auth.error });

  try {
    const service = createServiceClient();
    if (req.method === "GET") {
      const { data, error } = await service
        .from("account_deletion_requests")
        .select("status,requested_at,completed_at")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (error) throw error;
      return sendJson(res, 200, {
        enabled: deletionEnabledFor(auth.user.email),
        status: data?.status || "none",
        requestedAt: data?.requested_at || null,
        completedAt: data?.completed_at || null,
      });
    }

    if (!deletionEnabledFor(auth.user.email)) {
      return sendJson(res, 503, { error: "Account deletion is not available yet." });
    }

    const body = await readJsonBody(req);
    if (body.confirmation !== true && body.confirmation !== "DELETE") {
      return sendJson(res, 400, { error: "Confirm account deletion." });
    }

    const { data: requestId, error } = await service.rpc("request_user_account_deletion", {
      target_user_id: auth.user.id,
      trusted_admin_emails: [...adminEmailSet()],
    });
    if (error) throw error;
    scheduleImmediateAccountDeletion(service, requestId, auth.user.id);
    return sendJson(res, 202, {
      requestId,
      status: "pending",
      message: "Your account deletion request was received and organization access has been removed. We will complete account deletion within 30 days and email you when it is done.",
    });
  } catch (error) {
    if (String(error?.message || "").includes("Transfer sole organization ownership")) {
      return sendJson(res, 409, { error: "Please assign another organization owner before deleting your account." });
    }
    if (String(error?.message || "").includes("Transfer platform administration")) {
      return sendJson(res, 409, { error: "Please transfer platform administration before deleting your account." });
    }
    return sendJson(res, 500, { error: "Account deletion is temporarily unavailable. Please try again." });
  }
}
