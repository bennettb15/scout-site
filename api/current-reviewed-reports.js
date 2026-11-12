import {
  authenticateRequest,
  createServiceClient,
  getQueryValue,
  loadUserPortalPropertyAccess,
  methodAllowed,
  sendJson,
} from "./_reportPortalShared.js";
import { isUuid } from "../api-lib/tenantComparison.js";
import { portalAccessCanReviewCompletion } from "../api-lib/punchListPermissions.js";
import { dispatchReviewedReportRequest } from "../api-lib/reviewedReportDispatch.js";
import { publicRequest } from "./reviewed-reports.js";

function bodyOf(req) {
  if (typeof req.body === "string") return JSON.parse(req.body);
  return req.body || {};
}

export function currentReportAvailability(state) {
  const outcomes = Array.isArray(state?.review_outcomes) ? state.review_outcomes : [];
  const issues = Array.isArray(state?.issue_states) ? state.issue_states : [];
  return Boolean(state?.package_id && state?.state_hash &&
    Number(state?.unresolved_count) === 0 && issues.length > 0 && outcomes.length > 0);
}

export function hasUnreportedReviewDecision(state, decisions, latestAutomaticAt, latestReviewedAt) {
  const coveredAt = Math.max(
    Date.parse(state?.session_completed_at || "") || 0,
    Date.parse(latestAutomaticAt || "") || 0,
    Date.parse(latestReviewedAt || "") || 0,
  );
  return decisions.some((decision) => (Date.parse(decision.created_at || "") || 0) > coveredAt);
}

export function createCurrentReviewedReportsHandler({
  authenticate = authenticateRequest,
  serviceClient = createServiceClient,
  propertyAccess = loadUserPortalPropertyAccess,
  dispatch = dispatchReviewedReportRequest,
} = {}) {
  return async function handler(req, res) {
    if (!methodAllowed(req, res, ["GET", "POST", "OPTIONS"])) return;
    let body = {};
    if (req.method === "POST") {
      try { body = bodyOf(req); }
      catch { return sendJson(res, 400, { error: "Invalid JSON body." }); }
    }
    const orgId = body.orgId || getQueryValue(req, "orgId");
    const propertyId = body.propertyId || getQueryValue(req, "propertyId");
    if (!isUuid(orgId) || !isUuid(propertyId)) {
      return sendJson(res, 400, { error: "Select a property and organization." });
    }
    try {
      const auth = await authenticate(req);
      if (auth.error) return sendJson(res, 401, { error: auth.error });
      const service = serviceClient();
      const access = await propertyAccess(service, auth.user);
      if (!portalAccessCanReviewCompletion(access, orgId, propertyId)) {
        return sendJson(res, 403, { error: "Review access is required to update reports." });
      }
      const { data: property, error: propertyError } = await service.from("properties")
        .select("id").eq("id", propertyId).eq("org_id", orgId)
        .is("deleted_at", null).maybeSingle();
      if (propertyError) throw propertyError;
      if (!property) return sendJson(res, 404, { error: "Property not found." });

      const { data: state, error: stateError } = await service.rpc("current_reviewed_report_state", {
        p_org_id: orgId,
        p_property_id: propertyId,
      });
      if (stateError) throw stateError;
      let available = currentReportAvailability(state);
      if (available) {
        const decisionIds = [...new Set(state.review_outcomes
          .map((outcome) => outcome.decision_activity_id).filter(isUuid))];
        if (decisionIds.length === 0) {
          available = false;
        } else {
          const { data: automatic, error: automaticError } = await service.from("report_packages")
            .select("completed_at").eq("id", state.package_id)
            .eq("org_id", orgId).eq("property_id", propertyId).maybeSingle();
          if (automaticError) throw automaticError;
          const { data: decisions, error: decisionError } = await service.from("punchlist_activity")
            .select("id,created_at").eq("org_id", orgId).eq("property_id", propertyId)
            .in("id", decisionIds);
          if (decisionError) throw decisionError;
          const { data: reviewed, error: reviewedError } = await service.from("reviewed_report_requests")
            .select("completed_at").eq("org_id", orgId).eq("property_id", propertyId)
            .eq("report_scope", "current_property").eq("status", "ready")
            .order("completed_at", { ascending: false }).limit(1);
          if (reviewedError) throw reviewedError;
          available = hasUnreportedReviewDecision(state, decisions || [], automatic?.completed_at, reviewed?.[0]?.completed_at);
        }
      }
      let latest = null;
      if (state?.package_id && state?.state_hash) {
        const { data: requests, error: requestError } = await service.from("reviewed_report_requests")
          .select("*").eq("org_id", orgId).eq("property_id", propertyId)
          .eq("report_scope", "current_property")
          .eq("source_package_id", state.package_id)
          .eq("current_state_hash", state.state_hash)
          .order("requested_at", { ascending: false }).limit(1);
        if (requestError) throw requestError;
        latest = requests?.[0] || null;
      }
      if (req.method === "GET") {
        return sendJson(res, 200, {
          available,
          unresolvedCount: Number(state?.unresolved_count || 0),
          sourcePackageId: state?.package_id || null,
          request: publicRequest(latest),
        });
      }
      if (!available) {
        return sendJson(res, 400, { error: "Finish reviewing this property's pending items before updating its reports." });
      }
      if (latest && ["queued", "generating", "ready"].includes(latest.status)) {
        if (latest.status === "queued") await dispatch(service, latest.id);
        return sendJson(res, latest.status === "ready" ? 200 : 202, { request: publicRequest(latest) });
      }
      const { data: request, error: insertError } = await service.from("reviewed_report_requests")
        .insert({
          org_id: orgId,
          property_id: propertyId,
          source_package_id: state.package_id,
          current_state_hash: state.state_hash,
          report_scope: "current_property",
          requested_by: auth.user.id,
        }).select("*").single();
      if (insertError) throw insertError;
      const dispatchState = await dispatch(service, request.id);
      return sendJson(res, 202, { request: publicRequest(request), dispatch: dispatchState });
    } catch (error) {
      const unavailable = ["42883", "PGRST202", "42703", "PGRST205"].includes(error?.code);
      const stale = error?.code === "23514";
      const alreadyRunning = error?.code === "23505";
      return sendJson(res, unavailable || alreadyRunning ? 409 : stale ? 400 : 500, {
        error: unavailable
          ? "Current property report updates are not available yet."
          : alreadyRunning
            ? "Reports are already being updated. Refresh this page shortly."
            : stale
              ? "The property changed while preparing the reports. Refresh and try again."
              : "Unable to prepare updated reports.",
      });
    }
  };
}

export default createCurrentReviewedReportsHandler();
