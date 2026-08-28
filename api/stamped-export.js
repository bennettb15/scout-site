import {
  DELIVERABLES_BUCKET,
  ORIGINALS_BUCKET,
  authenticateRequest,
  createServiceClient,
  expectedStampedZipPath,
  getQueryValue,
  methodAllowed,
  originalPathIsExpected,
  sendJson,
  stampedPhotoFilename,
} from "./_reportPortalShared.js";
import { createHash } from "node:crypto";

const MEDIA_PREPARER_VERSION = "phase2a-shadow-media-prep-2-local-date";
const STAMPED_ZIP_EXPORT_VERSION = "stamped-zip-export-2-friendly-filename";

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function stampedZipCacheKey(client, reportPackage) {
  const { data, error } = await client
    .from("session_snapshots")
    .select("raw_session_json_sha256,snapshot_payload_sha256")
    .eq("id", reportPackage.snapshot_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const notFound = new Error("Report snapshot not found.");
    notFound.statusCode = 404;
    throw notFound;
  }

  const parts = [
    "stamped_jpg_zip",
    String(reportPackage.session_id).toLowerCase(),
    String(reportPackage.snapshot_id).toLowerCase(),
    MEDIA_PREPARER_VERSION,
    STAMPED_ZIP_EXPORT_VERSION,
    String(data.raw_session_json_sha256 || ""),
    String(data.snapshot_payload_sha256 || ""),
  ];
  return `stamped-jpg-zip:${sha256Text(parts.join("|"))}`;
}

export function publicExport(row) {
  if (!row) return null;
  const expired = row.expires_at ? new Date(row.expires_at).getTime() <= Date.now() : false;
  return {
    id: row.id,
    status: expired && row.status === "ready" ? "expired" : row.status,
    filename: row.filename,
    byteSize: row.byte_size,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export function parsePhotoIds(req) {
  const raw = getQueryValue(req, "photoIds");
  return [
    ...new Set(
      String(raw || "")
        .split(",")
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

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

function snapshotResolvedInSession(shot, issuesById) {
  if (
    boolValue(
      shot?.isResolvedInSession ||
        shot?.is_resolved_in_session ||
        shot?.resolvedInSession ||
        shot?.resolved_in_session
    )
  ) {
    return true;
  }
  const issue = issuesById.get(snapshotIssueId(shot));
  const status = textValue(shot?.issueStatus || shot?.issue_status || issue?.status || issue?.issueStatus);
  return String(status || "").toLowerCase() === "resolved";
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
      shot_key: textValue(shot?.shotKey || shot?.shot_key),
      captured_at: snapshotCapturedAt(shot),
      is_flagged: boolValue(shot?.isFlagged || shot?.is_flagged || shot?.flagged),
      is_resolved_in_session: snapshotResolvedInSession(shot, issuesById),
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

function enrichShotRow(row, snapshotMetadata) {
  const metadata = metadataForRow(row, snapshotMetadata);
  if (!metadata) return row;
  return {
    ...row,
    building: metadata.building || row.building,
    elevation: metadata.elevation || row.elevation,
    detail_type: metadata.detail_type || row.detail_type,
    angle_index: metadata.angle_index || row.angle_index,
    shot_key: metadata.shot_key || row.shot_key,
    captured_at: metadata.captured_at || row.captured_at,
    is_flagged: metadata.is_flagged,
    is_resolved_in_session: metadata.is_resolved_in_session || row.is_resolved_in_session,
    reason: metadata.reason || row.reason,
    priority: metadata.priority || row.priority || null,
    snapshot_order: metadata.snapshot_order,
  };
}

function assertFoundSelectedPhotoIds(rows, photoIds) {
  const safeRows = (rows || []).filter(originalPathIsExpected);
  const found = new Set(safeRows.map((row) => String(row.id).toLowerCase()));
  if (found.size !== photoIds.length || photoIds.some((id) => !found.has(id))) {
    const error = new Error("Selected photos are not available.");
    error.statusCode = 404;
    throw error;
  }
  return safeRows;
}

export async function latestExportForPackage(client, reportPackage) {
  const { data, error } = await client
    .from("temporary_exports")
    .select("id,status,filename,byte_size,expires_at,created_at")
    .eq("artifact_type", "stamped_jpg_zip")
    .like("cache_key", "stamped-jpg-zip:%")
    .eq("org_id", reportPackage.org_id)
    .eq("property_id", reportPackage.property_id)
    .eq("session_id", reportPackage.session_id)
    .eq("snapshot_id", reportPackage.snapshot_id)
    .is("deleted_at", null)
    .order("requested_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

export async function readyStampedExportForPackage(client, reportPackage) {
  const { data, error } = await client
    .from("temporary_exports")
    .select(
      "id,org_id,property_id,session_id,snapshot_id,status,filename,byte_size,expires_at,created_at,storage_bucket,storage_path,mime_type"
    )
    .eq("artifact_type", "stamped_jpg_zip")
    .like("cache_key", "stamped-jpg-zip:%")
    .eq("org_id", reportPackage.org_id)
    .eq("property_id", reportPackage.property_id)
    .eq("session_id", reportPackage.session_id)
    .eq("snapshot_id", reportPackage.snapshot_id)
    .eq("status", "ready")
    .gt("expires_at", new Date().toISOString())
    .is("deleted_at", null)
    .order("requested_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = data?.[0] || null;
  if (
    !row ||
    row.storage_bucket !== DELIVERABLES_BUCKET ||
    row.mime_type !== "application/zip" ||
    row.storage_path !== expectedStampedZipPath(row)
  ) {
    return null;
  }
  return row;
}

async function inFlightStampedExportForPackage(client, reportPackage, cacheKey) {
  const { data, error } = await client
    .from("temporary_exports")
    .select("id,status,filename,byte_size,expires_at,created_at,requested_at")
    .eq("artifact_type", "stamped_jpg_zip")
    .eq("cache_key", cacheKey)
    .eq("org_id", reportPackage.org_id)
    .eq("property_id", reportPackage.property_id)
    .eq("session_id", reportPackage.session_id)
    .eq("snapshot_id", reportPackage.snapshot_id)
    .in("status", ["queued", "generating"])
    .is("deleted_at", null)
    .order("requested_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

async function enqueueStampedExport(client, reportPackage, cacheKey) {
  const row = {
    org_id: reportPackage.org_id,
    property_id: reportPackage.property_id,
    session_id: reportPackage.session_id,
    snapshot_id: reportPackage.snapshot_id,
    artifact_type: "stamped_jpg_zip",
    status: "queued",
    cache_key: cacheKey,
    storage_bucket: DELIVERABLES_BUCKET,
    mime_type: "application/zip",
  };
  const { data, error } = await client
    .from("temporary_exports")
    .insert(row)
    .select("id,status,filename,byte_size,expires_at,created_at,requested_at")
    .single();

  if (!error) return data;
  if (error.code === "23505") {
    const existing = await inFlightStampedExportForPackage(client, reportPackage, cacheKey);
    if (existing) return existing;
  }
  throw error;
}

export async function validateSelectedPhotoIds(_auth, reportPackage, photoIds) {
  if (photoIds.length === 0) return [];
  const { data, error } = await createServiceClient()
    .from("shots")
    .select("id,session_id,property_id,storage_path")
    .in("id", photoIds)
    .eq("org_id", reportPackage.org_id)
    .eq("session_id", reportPackage.session_id)
    .or(`property_id.eq.${reportPackage.property_id},property_id.is.null`)
    .eq("storage_bucket", ORIGINALS_BUCKET)
    .eq("upload_state", "uploaded")
    .is("deleted_at", null)
    .not("storage_path", "is", null);

  if (error) throw error;
  assertFoundSelectedPhotoIds(data, photoIds);
  return photoIds;
}

export async function loadShotRowsForPhotoIds(_auth, reportPackage, photoIds) {
  if (photoIds.length === 0) return [];
  const service = createServiceClient();
  const { data, error } = await service
    .from("shots")
    .select(
      "id,org_id,property_id,session_id,building,elevation,detail_type,angle_index,shot_key,is_flagged,issue_status,reason,priority,storage_bucket,storage_path,upload_state,deleted_at,position,captured_at"
    )
    .in("id", photoIds)
    .eq("org_id", reportPackage.org_id)
    .eq("session_id", reportPackage.session_id)
    .or(`property_id.eq.${reportPackage.property_id},property_id.is.null`)
    .eq("storage_bucket", ORIGINALS_BUCKET)
    .eq("upload_state", "uploaded")
    .is("deleted_at", null)
    .not("storage_path", "is", null)
    .order("position", { ascending: true, nullsFirst: false })
    .order("captured_at", { ascending: true });

  if (error) throw error;
  const safeRows = assertFoundSelectedPhotoIds(data, photoIds).map((row) => ({
    ...row,
    property_id: row.property_id || reportPackage.property_id,
    is_resolved_in_session: String(row.issue_status || "").toLowerCase() === "resolved",
  }));
  const snapshotMetadata = await loadSnapshotPhotoMetadata(service, reportPackage);
  return safeRows.map((row) => enrichShotRow(row, snapshotMetadata));
}

export function stampedFilenameFromShot(shotRow) {
  return stampedPhotoFilename(shotRow);
}

export async function loadReadyReportPackage(auth, packageId) {
  const { data: reportPackage, error: packageError } = await auth.client
    .from("report_packages")
    .select("id,org_id,property_id,session_id,snapshot_id,status")
    .eq("id", packageId)
    .is("deleted_at", null)
    .maybeSingle();

  if (packageError) {
    const error = new Error("Unable to load stamped export.");
    error.statusCode = 500;
    throw error;
  }
  if (!reportPackage || reportPackage.status !== "ready") {
    const error = new Error("Report package not found.");
    error.statusCode = 404;
    throw error;
  }
  return reportPackage;
}

export async function prepareStampedExportForPhotos(auth, reportPackage, photoIds = []) {
  const service = createServiceClient();
  await validateSelectedPhotoIds(auth, reportPackage, photoIds);
  const exportRow = await readyStampedExportForPackage(service, reportPackage);
  if (exportRow) return exportRow;

  const cacheKey = await stampedZipCacheKey(service, reportPackage);
  const existing = await inFlightStampedExportForPackage(service, reportPackage, cacheKey);
  if (existing) return existing;
  return enqueueStampedExport(service, reportPackage, cacheKey);
}

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST", "OPTIONS"])) return;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });

    const packageId = getQueryValue(req, "packageId");
    const selectedPhotoIds = parsePhotoIds(req);
    if (!packageId) {
      return sendJson(res, 400, { error: "Missing package id." });
    }

    const reportPackage = await loadReadyReportPackage(auth, packageId);

    const service = createServiceClient();
    let exportRow = null;
    if (req.method === "POST") {
      exportRow = await prepareStampedExportForPhotos(auth, reportPackage, selectedPhotoIds);
    } else {
      exportRow = await latestExportForPackage(service, reportPackage);
    }
    return sendJson(res, 200, { export: publicExport(exportRow) });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      error:
        error.statusCode === 404
          ? error.message
          : "Unable to prepare stamped export.",
    });
  }
}
