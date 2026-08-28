import {
  DELIVERABLES_BUCKET,
  ORIGINALS_BUCKET,
  SIGNED_URL_SECONDS,
  authenticateRequest,
  createServiceClient,
  expectedOriginalJpgPreviewPath,
  friendlyOriginalDownloadFilename,
  friendlyPhotoDisplayName,
  getQueryValue,
  enrichPhotoRowWithSnapshotMetadata,
  loadSnapshotPhotoMetadata as loadSharedSnapshotPhotoMetadata,
  methodAllowed,
  originalIsBrowserPreviewable,
  originalMimeType,
  originalNeedsJpgPreviewDerivative,
  originalPathIsExpected,
  sendJson,
  sortPhotoRowsBySnapshot,
  stampedPhotoFilename,
} from "./_reportPortalShared.js";

async function deliverableObjectExists(service, path) {
  const parts = String(path || "").split("/").filter(Boolean);
  const filename = parts.pop();
  if (!filename || parts.length === 0) return false;

  const { data, error } = await service.storage
    .from(DELIVERABLES_BUCKET)
    .list(parts.join("/"), { limit: 1, search: filename });

  if (error || !Array.isArray(data)) return false;
  return data.some((item) => item?.name === filename);
}

async function signedPreviewUrlForPhoto(service, row) {
  if (originalIsBrowserPreviewable(row)) {
    const { data } = await service.storage
      .from(ORIGINALS_BUCKET)
      .createSignedUrl(row.storage_path, SIGNED_URL_SECONDS);
    return data?.signedUrl || null;
  }

  if (!originalNeedsJpgPreviewDerivative(row)) {
    return null;
  }

  const previewPath = expectedOriginalJpgPreviewPath(row);
  if (!(await deliverableObjectExists(service, previewPath))) {
    return null;
  }

  const { data } = await service.storage
    .from(DELIVERABLES_BUCKET)
    .createSignedUrl(previewPath, SIGNED_URL_SECONDS);
  return data?.signedUrl || null;
}

function publicPhoto(row, previewUrl = null) {
  const flaggedReason = String(row.reason || "").trim() || null;
  const normalizedIssueStatus = String(row.issue_status || "").trim().toLowerCase();
  const isResolvedInSession =
    Boolean(row.is_resolved_in_session) ||
    normalizedIssueStatus === "resolved" ||
    normalizedIssueStatus === "closed";
  const issueStatus = isResolvedInSession ? "resolved" : String(row.issue_status || "").trim() || null;
  return {
    id: row.id,
    displayName: friendlyPhotoDisplayName(row),
    downloadFilename: friendlyOriginalDownloadFilename(row),
    capturedAt: row.captured_at,
    byteSize: row.byte_size,
    mimeType: originalMimeType(row),
    isFlagged: Boolean(row.is_flagged),
    isResolved: isResolvedInSession,
    isResolvedInSession,
    is_resolved_in_session: isResolvedInSession,
    issueStatus,
    issue_status: issueStatus,
    flaggedReason,
    flagReason: flaggedReason,
    reason: flaggedReason,
    priority: String(row.priority || "").trim() || null,
    stampedFilename: stampedPhotoFilename(row),
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    canPreviewInBrowser: Boolean(previewUrl),
    previewUrl,
    previewExpiresInSeconds: previewUrl ? SIGNED_URL_SECONDS : null,
  };
}

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ["GET", "OPTIONS"])) return;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });

    const packageId = getQueryValue(req, "packageId");
    if (!packageId) {
      return sendJson(res, 400, { error: "Missing package id." });
    }

    const { data: reportPackage, error: packageError } = await auth.client
      .from("report_packages")
      .select("id,org_id,property_id,session_id,snapshot_id,status")
      .eq("id", packageId)
      .eq("status", "ready")
      .is("deleted_at", null)
      .maybeSingle();

    if (packageError) {
      return sendJson(res, 500, { error: "Unable to load original photos." });
    }
    if (!reportPackage) {
      return sendJson(res, 404, { error: "Report package not found." });
    }

    const service = createServiceClient();
    const { data: rows, error: shotsError } = await service
      .from("shots")
      .select(
        "id,org_id,property_id,session_id,building,elevation,detail_type,angle_index,captured_at,position,storage_bucket,storage_path,byte_size,upload_state,is_flagged,issue_id,issue_status,reason,priority,image_width,image_height"
      )
      .eq("org_id", reportPackage.org_id)
      .eq("session_id", reportPackage.session_id)
      .or(`property_id.eq.${reportPackage.property_id},property_id.is.null`)
      .eq("storage_bucket", ORIGINALS_BUCKET)
      .eq("upload_state", "uploaded")
      .is("deleted_at", null)
      .not("storage_path", "is", null)
      .order("position", { ascending: true, nullsFirst: false })
      .order("captured_at", { ascending: true });

    if (shotsError) {
      return sendJson(res, 500, { error: "Unable to load original photos." });
    }

    const safeRows = (rows || [])
      .filter(originalPathIsExpected)
      .map((row) => ({ ...row, property_id: row.property_id || reportPackage.property_id }));
    const snapshotMetadata = await loadSharedSnapshotPhotoMetadata(service, reportPackage);
    const enrichedRows = sortPhotoRowsBySnapshot(
      safeRows.map((row) => enrichPhotoRowWithSnapshotMetadata(row, snapshotMetadata))
    );
    const photos = await Promise.all(
      enrichedRows.map(async (row) => publicPhoto(row, await signedPreviewUrlForPhoto(service, row)))
    );

    return sendJson(res, 200, { photos });
  } catch {
    return sendJson(res, 500, { error: "Unable to load original photos." });
  }
}
