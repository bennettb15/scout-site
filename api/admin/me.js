import {
  isApprovedAdminEmail,
  loadManagementMemberships,
  normalizeEmail,
} from "../_portalAdminShared.js";
import {
  authenticateRequest,
  createServiceClient,
  methodAllowed,
  sendJson,
} from "../_reportPortalShared.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    methodAllowed(req, res, ["GET", "OPTIONS"]);
    return;
  }

  if (!methodAllowed(req, res, ["GET", "OPTIONS"])) return;

  const auth = await authenticateRequest(req);
  if (auth.error) {
    sendJson(res, 401, { error: auth.error });
    return;
  }

  const email = normalizeEmail(auth.user?.email);
  const isPlatformAdmin = isApprovedAdminEmail(email);
  let managementMemberships = [];
  try {
    managementMemberships = isPlatformAdmin
      ? []
      : await loadManagementMemberships(createServiceClient(), auth.user?.id);
  } catch {
    managementMemberships = [];
  }

  sendJson(res, 200, {
    email,
    isAdmin: isPlatformAdmin || managementMemberships.length > 0,
    isPlatformAdmin,
  });
}
