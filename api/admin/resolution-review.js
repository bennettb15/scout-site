import {
  loadOrg,
  readJsonBody,
  requirePortalAdmin,
  validateUuid,
} from "../_portalAdminShared.js";
import { sendJson } from "../_reportPortalShared.js";
import {
  canManageResolutionReview,
  requiresFieldResolutionReview,
} from "../../api-lib/resolutionReviewPolicy.js";

export default async function handler(req, res) {
  const context = await requirePortalAdmin(req, res, ["GET", "POST", "OPTIONS"]);
  if (!context) return;

  let body = {};
  if (req.method === "POST") {
    try {
      body = await readJsonBody(req);
    } catch {
      return sendJson(res, 400, { error: "Invalid JSON body." });
    }
  }
  const orgId = validateUuid(req.method === "GET" ? req.query?.orgId : body.orgId);
  if (!orgId) return sendJson(res, 400, { error: "Valid organization ID is required." });
  if (!canManageResolutionReview(context, orgId)) {
    return sendJson(res, 403, { error: "Organization owner access required." });
  }
  if (req.method === "POST" && typeof body.requireReviewForFieldResolutions !== "boolean") {
    return sendJson(res, 400, { error: "Review setting must be true or false." });
  }

  try {
    const org = await loadOrg(context.service, orgId);
    if (!org) return sendJson(res, 404, { error: "Organization not found." });
    if (req.method === "POST") {
      const { data, error } = await context.service.from("orgs")
        .update({ require_review_for_field_resolutions: body.requireReviewForFieldResolutions })
        .eq("id", orgId).is("deleted_at", null)
        .select("id,require_review_for_field_resolutions").single();
      if (error) throw error;
      return sendJson(res, 200, {
        orgId: data.id,
        requireReviewForFieldResolutions: requiresFieldResolutionReview(data.require_review_for_field_resolutions),
      });
    }
    const { data, error } = await context.service.from("orgs")
      .select("id,require_review_for_field_resolutions")
      .eq("id", orgId).is("deleted_at", null).single();
    if (error) throw error;
    return sendJson(res, 200, {
      orgId: data.id,
      requireReviewForFieldResolutions: requiresFieldResolutionReview(data.require_review_for_field_resolutions),
    });
  } catch (error) {
    const missingSchema = error?.code === "42703";
    return sendJson(res, missingSchema ? 409 : 500, {
      error: missingSchema
        ? "Review setting is not installed yet. Run the database migration first."
        : "Unable to load or update the review setting.",
    });
  }
}
