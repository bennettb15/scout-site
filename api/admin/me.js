import { isApprovedAdminEmail, normalizeEmail } from "../_portalAdminShared.js";
import {
  authenticateRequest,
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
  sendJson(res, 200, {
    email,
    isAdmin: isApprovedAdminEmail(email),
  });
}
