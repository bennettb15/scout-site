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

const REQUIRED_REPORT_TYPES = ["property_report", "flagged_observations", "flagged_comparison"];

export function publicRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    sourcePackageId: row.source_package_id,
    status: row.status,
    progressStep: row.progress_step || row.status,
    resultPackageId: row.result_package_id || null,
    requestedAt: row.requested_at,
    error: row.status === "failed" ? "Reviewed reports could not be generated. Please try again." : null,
    dispatchDelayed: String(row.last_error || "").startsWith("dispatch_"),
  };
}

export async function sourcePackages(service, orgId, propertyId) {
  const { data, error } = await service.from("report_packages")
    .select("id,snapshot_id,session_id,session_completed_at,completed_at,report_variant:manifest->>report_variant")
    .eq("org_id", orgId)
    .eq("property_id", propertyId)
    .eq("status", "ready")
    .is("deleted_at", null)
    .order("session_completed_at", { ascending: false })
    .order("completed_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const candidates = (data || []).filter((row) => row.report_variant !== "reviewed");
  if (!candidates.length) return [];
  const snapshotIds = [...new Set(candidates.map((row) => row.snapshot_id).filter(Boolean))];
  if (!snapshotIds.length) return [];
  const { data: snapshots, error: snapshotsError } = await service.from("session_snapshots")
    .select("id,field_resolution_submissions:manifest->fieldResolutionSubmissions")
    .eq("org_id", orgId)
    .eq("property_id", propertyId)
    .in("id", snapshotIds);
  if (snapshotsError) throw snapshotsError;
  const snapshotById = new Map((snapshots || []).map((row) => [row.id, row]));
  const reviewableSnapshotIds = new Set((snapshots || [])
    .filter((row) => Array.isArray(row.field_resolution_submissions) &&
      row.field_resolution_submissions.some((submission) => submission?.status === "pending_review"))
    .map((row) => row.id));
  const legacySnapshotIds = new Set((snapshots || [])
    .filter((row) => row.field_resolution_submissions == null)
    .map((row) => row.id));
  const legacyPackageIds = candidates.filter((row) => legacySnapshotIds.has(row.snapshot_id)).map((row) => row.id);
  const legacySources = new Set();
  const legacyShotsByPackage = new Map();
  if (legacyPackageIds.length) {
    const { data: legacyOutcomes, error: legacyError } = await service.rpc("legacy_reviewed_report_outcomes", {
      p_org_id: orgId,
      p_property_id: propertyId,
      p_package_ids: legacyPackageIds,
    });
    if (legacyError && !["PGRST202", "42883"].includes(legacyError.code)) throw legacyError;
    for (const row of legacyOutcomes || []) {
      legacySources.add(row.package_id);
      if (row.shot_id) {
        const shots = legacyShotsByPackage.get(row.package_id) || [];
        shots.push(row.shot_id);
        legacyShotsByPackage.set(row.package_id, shots);
      }
    }
  }
  const reviewableCandidates = candidates.filter((row) =>
    reviewableSnapshotIds.has(row.snapshot_id) || legacySources.has(row.id));
  if (!reviewableCandidates.length) return [];
  const { data: files, error: filesError } = await service.from("report_package_files")
    .select("package_id,report_type")
    .eq("org_id", orgId)
    .eq("property_id", propertyId)
    .in("package_id", reviewableCandidates.map((row) => row.id))
    .in("report_type", REQUIRED_REPORT_TYPES)
    .is("deleted_at", null)
    .is("storage_deleted_at", null);
  if (filesError) throw filesError;
  const available = new Map();
  for (const file of files || []) {
    const types = available.get(file.package_id) || new Set();
    types.add(file.report_type);
    available.set(file.package_id, types);
  }
  const seenSessions = new Set();
  return reviewableCandidates.filter((row) => {
    if (seenSessions.has(row.session_id)) return false;
    if (!REQUIRED_REPORT_TYPES.every((type) => available.get(row.id)?.has(type))) return false;
    seenSessions.add(row.session_id);
    return true;
  }).slice(0, 50).map((row) => ({
    ...row,
    pendingSubmissionIds: (snapshotById.get(row.snapshot_id)?.field_resolution_submissions || [])
      .filter((submission) => submission?.status === "pending_review" && submission?.activity_id)
      .map((submission) => submission.activity_id),
    legacyShotIds: legacyShotsByPackage.get(row.id) || [],
  }));
}

async function activeRequest(service, orgId, propertyId, sourcePackageId) {
  const { data, error } = await service.from("reviewed_report_requests")
    .select("*")
    .eq("org_id", orgId)
    .eq("property_id", propertyId)
    .eq("source_package_id", sourcePackageId)
    .in("status", ["queued", "generating"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function requestBody(req) {
  if (typeof req.body === "string") return JSON.parse(req.body);
  return req.body || {};
}

export function createReviewedReportsHandler({
  authenticate = authenticateRequest,
  serviceClient = createServiceClient,
  propertyAccess = loadUserPortalPropertyAccess,
  dispatch = dispatchReviewedReportRequest,
  loadSources = sourcePackages,
} = {}) {
  return async function handler(req, res) {
    if (!methodAllowed(req, res, ["GET", "POST", "OPTIONS"])) return;
    try {
      const auth = await authenticate(req);
      if (auth.error) return sendJson(res, 401, { error: auth.error });
      const service = serviceClient();
      const access = await propertyAccess(service, auth.user);
      const requestId = getQueryValue(req, "requestId");
      if (req.method === "GET" && requestId) {
        if (!isUuid(requestId)) return sendJson(res, 400, { error: "Invalid request." });
        const { data: request, error } = await service.from("reviewed_report_requests")
          .select("*").eq("id", requestId).maybeSingle();
        if (error) throw error;
        if (!request || !portalAccessCanReviewCompletion(access, request.org_id, request.property_id)) {
          return sendJson(res, 404, { error: "Reviewed report request not found." });
        }
        const dispatchState = request.status === "queued" ? await dispatch(service, request.id) : null;
        return sendJson(res, 200, { request: publicRequest(request), dispatch: dispatchState });
      }

      let body = {};
      if (req.method === "POST") {
        try { body = requestBody(req); }
        catch { return sendJson(res, 400, { error: "Invalid JSON body." }); }
      }
      const orgId = body.orgId || getQueryValue(req, "orgId");
      const propertyId = body.propertyId || getQueryValue(req, "propertyId");
      if (!isUuid(orgId) || !isUuid(propertyId)) {
        return sendJson(res, 400, { error: "Select a property and organization." });
      }
      if (!portalAccessCanReviewCompletion(access, orgId, propertyId)) {
        return sendJson(res, 403, { error: "Review access is required to generate reviewed reports." });
      }
      const { data: property, error: propertyError } = await service.from("properties")
        .select("id").eq("id", propertyId).eq("org_id", orgId)
        .is("deleted_at", null).maybeSingle();
      if (propertyError) throw propertyError;
      if (!property) return sendJson(res, 404, { error: "Property not found." });

      const sources = await loadSources(service, orgId, propertyId);
      if (req.method === "GET") {
        const sourceIds = sources.map((row) => row.id);
        const { data: requests, error } = sourceIds.length
          ? await service.from("reviewed_report_requests")
            .select("*")
            .eq("org_id", orgId)
            .eq("property_id", propertyId)
            .in("source_package_id", sourceIds)
            .order("requested_at", { ascending: false })
            .limit(100)
          : { data: [], error: null };
        if (error) throw error;
        const latestBySource = new Map();
        for (const row of requests || []) {
          if (!latestBySource.has(row.source_package_id)) latestBySource.set(row.source_package_id, publicRequest(row));
        }
        return sendJson(res, 200, { sources: sources.map((row) => ({
          id: row.id,
          sessionId: row.session_id,
          sessionCompletedAt: row.session_completed_at,
          completedAt: row.completed_at,
          pendingSubmissionIds: row.pendingSubmissionIds || [],
          legacyShotIds: row.legacyShotIds || [],
          latestRequest: latestBySource.get(row.id) || null,
        })) });
      }

      const sourcePackageId = body.sourcePackageId;
      if (!isUuid(sourcePackageId) || !sources.some((row) => row.id === sourcePackageId)) {
        return sendJson(res, 400, { error: "Choose a ready report package for this property." });
      }
      const existing = await activeRequest(service, orgId, propertyId, sourcePackageId);
      if (existing) {
        if (existing.requested_by !== auth.user.id) {
          return sendJson(res, 409, { error: "Reviewed reports are already being generated for this visit. Check Reports shortly." });
        }
        if (existing.status === "queued") await dispatch(service, existing.id);
        return sendJson(res, 202, { request: publicRequest(existing) });
      }
      const { data: request, error } = await service.from("reviewed_report_requests")
        .insert({ org_id: orgId, property_id: propertyId, requested_by: auth.user.id, source_package_id: sourcePackageId })
        .select("*").single();
      if (error) throw error;
      const dispatchState = await dispatch(service, request.id);
      return sendJson(res, 202, { request: publicRequest(request), dispatch: dispatchState });
    } catch (error) {
      const schemaMissing = error?.code === "42P01" || error?.code === "PGRST205";
      const reviewIncomplete = error?.code === "23514";
      const alreadyRunning = error?.code === "23505";
      return sendJson(res, schemaMissing || alreadyRunning ? 409 : reviewIncomplete ? 400 : 500, {
        error: schemaMissing
          ? "Reviewed reports are not available yet. The server update is still pending."
          : reviewIncomplete
            ? "Approve or reject every field resolution from this visit before generating reviewed reports."
            : alreadyRunning
              ? "Reviewed reports are already being generated for this visit. Check Reports shortly."
          : "Unable to prepare reviewed reports.",
      });
    }
  };
}

export default createReviewedReportsHandler();
