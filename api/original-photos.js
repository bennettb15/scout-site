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
  methodAllowed,
  originalIsBrowserPreviewable,
  originalMimeType,
  originalNeedsJpgPreviewDerivative,
  originalPathIsExpected,
  sendJson,
} from "./_reportPortalShared.js";

function textValue(value) {
  const text = String(value || "").trim();
  return text || null;
}

function idValue(value) {
  return textValue(value)?.toLowerCase() || "";
}

function boolValue(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = textValue(value)?.toLowerCase();
  return ["true", "1", "yes", "y"].includes(text || "");
}

function safeAngleIndex(value) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function snapshotShotId(shot) {
  return idValue(shot?.shotID || shot?.shotId || shot?.id || shot?.uuid);
}

function snapshotIssueId(shot) {
  return idValue(
    shot?.issueID ||
      shot?.issueId ||
      shot?.flaggedIssueID ||
      shot?.flaggedIssueId ||
      shot?.activeIssueID ||
      shot?.activeIssueId
  );
}

function snapshotStoragePath(shot) {
  return textValue(shot?.storagePath || shot?.storage_path);
}

function snapshotOriginalFilename(shot) {
  return textValue(shot?.originalFilename || shot?.original_filename);
}

function snapshotCapturedAt(shot) {
  return textValue(shot?.createdAt || shot?.capturedAt || shot?.captured_at);
}

function issueReason(issue) {
  return textValue(issue?.currentReason || issue?.reason || issue?.detailNote || issue?.noteText);
}

function flaggedReasonFromSnapshot(shot, issuesById) {
  const direct = textValue(shot?.flaggedReason || shot?.reason || shot?.noteText);
  if (direct) return direct;
  const issue = issuesById.get(snapshotIssueId(shot));
  return issueReason(issue);
}

function buildSnapshotPhotoMetadata(rawSession) {
  const shots = Array.isArray(rawSession?.shots) ? rawSession.shots : [];
  const issues = Array.isArray(rawSession?.issues)
    ? rawSession.issues
    : Array.isArray(rawSession?.flaggedIssues)
      ? rawSession.flaggedIssues
      : [];
  const issuesById = new Map(
    issues
      .map((issue) => [idValue(issue?.id || issue?.issueID || issue?.issueId), issue])
      .filter(([id]) => id)
  );
  const byShotId = new Map();
  const byStoragePath = new Map();
  const byFilename = new Map();

  shots.forEach((shot, index) => {
    const shotId = snapshotShotId(shot);
    const storagePath = snapshotStoragePath(shot);
    const filename = snapshotOriginalFilename(shot);
    const metadata = {
      building: textValue(shot?.building),
      elevation: textValue(shot?.elevation || shot?.targetElevation),
      detail_type: textValue(shot?.detailType || shot?.detail_type || shot?.type),
      angle_index: safeAngleIndex(shot?.angleIndex || shot?.angle_index),
      captured_at: snapshotCapturedAt(shot),
      is_flagged: boolValue(shot?.isFlagged || shot?.is_flagged || shot?.flagged),
      reason: flaggedReasonFromSnapshot(shot, issuesById),
      priority: textValue(shot?.priority),
      snapshot_order: index,
    };
    if (shotId) byShotId.set(shotId, metadata);
    if (storagePath) byStoragePath.set(storagePath.toLowerCase(), metadata);
    if (filename) byFilename.set(filename.toLowerCase(), metadata);
  });

  return { byShotId, byStoragePath, byFilename };
}

async function loadSnapshotPhotoMetadata(service, reportPackage) {
  if (!reportPackage.snapshot_id) return null;
  const { data: snapshot, error } = await service
    .from("session_snapshots")
    .select(
      "id,org_id,property_id,session_id,snapshot_kind,session_status,is_sealed,payload_storage_bucket,payload_storage_path,deleted_at"
    )
    .eq("id", reportPackage.snapshot_id)
    .eq("org_id", reportPackage.org_id)
    .eq("property_id", reportPackage.property_id)
    .eq("session_id", reportPackage.session_id)
    .eq("snapshot_kind", "completed")
    .eq("session_status", "completed")
    .eq("is_sealed", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !snapshot?.payload_storage_bucket || !snapshot?.payload_storage_path) {
    return null;
  }

  const { data: object, error: downloadError } = await service.storage
    .from(snapshot.payload_storage_bucket)
    .download(snapshot.payload_storage_path);

  if (downloadError || !object) return null;

  try {
    const payload = JSON.parse(await object.text());
    if (
      idValue(payload.orgID || payload.orgId) !== idValue(reportPackage.org_id) ||
      idValue(payload.propertyID || payload.propertyId) !== idValue(reportPackage.property_id) ||
      idValue(payload.sessionID || payload.sessionId) !== idValue(reportPackage.session_id)
    ) {
      return null;
    }
    const raw =
      typeof payload.rawSessionJSON === "string"
        ? JSON.parse(payload.rawSessionJSON || "{}")
        : payload.rawSessionJSON;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return null;
    }
    return buildSnapshotPhotoMetadata(raw);
  } catch {
    return null;
  }
}

function filenameFromPath(path) {
  return textValue(
    String(path || "")
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean)
      .pop()
  );
}

function metadataForRow(row, snapshotMetadata) {
  if (!snapshotMetadata) return null;
  return (
    snapshotMetadata.byShotId.get(idValue(row.id)) ||
    snapshotMetadata.byStoragePath.get(String(row.storage_path || "").toLowerCase()) ||
    snapshotMetadata.byFilename.get(String(filenameFromPath(row.storage_path) || "").toLowerCase()) ||
    null
  );
}

function enrichPhotoRow(row, snapshotMetadata) {
  const metadata = metadataForRow(row, snapshotMetadata);
  if (!metadata) return row;
  return {
    ...row,
    building: metadata.building || row.building,
    elevation: metadata.elevation || row.elevation,
    detail_type: metadata.detail_type || row.detail_type,
    angle_index: metadata.angle_index || row.angle_index,
    captured_at: metadata.captured_at || row.captured_at,
    is_flagged: metadata.is_flagged,
    reason: metadata.reason || row.reason,
    priority: metadata.priority || row.priority || null,
    snapshot_order: metadata.snapshot_order,
  };
}

function sortPhotoRows(rows) {
  return [...rows].sort((a, b) => {
    const aOrder = Number.isFinite(a.snapshot_order) ? a.snapshot_order : Number.POSITIVE_INFINITY;
    const bOrder = Number.isFinite(b.snapshot_order) ? b.snapshot_order : Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aPosition = Number.isFinite(Number(a.position)) ? Number(a.position) : Number.POSITIVE_INFINITY;
    const bPosition = Number.isFinite(Number(b.position)) ? Number(b.position) : Number.POSITIVE_INFINITY;
    if (aPosition !== bPosition) return aPosition - bPosition;
    return String(a.captured_at || "").localeCompare(String(b.captured_at || ""));
  });
}

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
  return {
    id: row.id,
    displayName: friendlyPhotoDisplayName(row),
    downloadFilename: friendlyOriginalDownloadFilename(row),
    capturedAt: row.captured_at,
    byteSize: row.byte_size,
    mimeType: originalMimeType(row),
    isFlagged: Boolean(row.is_flagged),
    flaggedReason: String(row.reason || "").trim() || null,
    priority: String(row.priority || "").trim() || null,
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

    const { data: rows, error: shotsError } = await auth.client
      .from("shots")
      .select(
        "id,org_id,property_id,session_id,building,elevation,detail_type,angle_index,captured_at,position,storage_bucket,storage_path,byte_size,upload_state,is_flagged,reason,priority,image_width,image_height"
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
    const service = createServiceClient();
    const snapshotMetadata = await loadSnapshotPhotoMetadata(service, reportPackage);
    const enrichedRows = sortPhotoRows(safeRows.map((row) => enrichPhotoRow(row, snapshotMetadata)));
    const photos = await Promise.all(
      enrichedRows.map(async (row) => publicPhoto(row, await signedPreviewUrlForPhoto(service, row)))
    );

    return sendJson(res, 200, { photos });
  } catch {
    return sendJson(res, 500, { error: "Unable to load original photos." });
  }
}
