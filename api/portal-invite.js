import {
  createServiceClient,
  methodAllowed,
  sendJson,
} from "./_reportPortalShared.js";
import { normalizeEmail, readJsonBody } from "./_portalAdminShared.js";
import {
  activateInvite,
  getInviteToken,
  inviteRoleLabel,
  loadInvitePublicDetails,
  portalInviteErrorResponse,
} from "./_portalInviteShared.js";
import { membershipResponse, upsertOrgMembership } from "./admin/portal-access.js";

function inviteDetailsResponse({ invite, org, publicState }) {
  return {
    state: publicState.state,
    accountMode: publicState.accountMode || null,
    email: normalizeEmail(invite?.email),
    org: org ? { id: org.id, name: org.name } : null,
    accessRole: invite?.role || null,
    accessLabel: invite?.role ? inviteRoleLabel(invite.role) : null,
    expiresAt: invite?.expires_at || null,
  };
}

async function handleGet(req, res, service) {
  try {
    const details = await loadInvitePublicDetails(service, getInviteToken(req));
    return sendJson(res, 200, inviteDetailsResponse(details));
  } catch (error) {
    return portalInviteErrorResponse(res, error);
  }
}

async function handlePost(req, res, service) {
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, {
      error: "Invalid JSON body.",
      code: "invalid_json",
    });
  }

  try {
    const token = String(body.token || getInviteToken(req) || "").trim();
    const details = await loadInvitePublicDetails(service, token);
    const { user, membership } = await activateInvite({
      service,
      req,
      invite: details.invite,
      org: details.org,
      password: body.password,
      actorId: details.invite?.created_by || null,
      upsertOrgMembership,
    });

    return sendJson(res, 200, {
      state: "accepted",
      user: {
        id: user.id,
        email: normalizeEmail(user.email),
      },
      org: {
        id: details.org.id,
        name: details.org.name,
      },
      membership: membershipResponse(membership),
    });
  } catch (error) {
    return portalInviteErrorResponse(res, error);
  }
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    methodAllowed(req, res, ["GET", "POST", "OPTIONS"]);
    return;
  }
  if (!methodAllowed(req, res, ["GET", "POST", "OPTIONS"])) return;

  const service = createServiceClient();
  if (req.method === "GET") return handleGet(req, res, service);
  if (req.method === "POST") return handlePost(req, res, service);
}
