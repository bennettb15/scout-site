import {
  DELIVERABLES_BUCKET,
  authenticateRequest,
  createServiceClient,
  expectedStampedZipPath,
  friendlyOriginalDownloadFilename,
  getQueryValue,
  methodAllowed,
  sendJson,
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

export async function validateSelectedPhotoIds(auth, reportPackage, photoIds) {
  if (photoIds.length === 0) return [];
  const { data, error } = await auth.client
    .from("shots")
    .select("id")
    .in("id", photoIds)
    .eq("org_id", reportPackage.org_id)
    .eq("property_id", reportPackage.property_id)
    .eq("session_id", reportPackage.session_id)
    .eq("storage_bucket", "scoutcapture-originals")
    .eq("upload_state", "uploaded")
    .is("deleted_at", null)
    .not("storage_path", "is", null);

  if (error) throw error;
  const found = new Set((data || []).map((row) => String(row.id).toLowerCase()));
  if (found.size !== photoIds.length || photoIds.some((id) => !found.has(id))) {
    const error = new Error("Selected photos are not available.");
    error.statusCode = 404;
    throw error;
  }
  return photoIds;
}

export async function loadShotRowsForPhotoIds(auth, reportPackage, photoIds) {
  if (photoIds.length === 0) return [];
  const { data, error } = await auth.client
    .from("shots")
    .select(
      "id,org_id,property_id,session_id,building,elevation,detail_type,angle_index,is_flagged,storage_bucket,storage_path,upload_state,deleted_at,position,captured_at"
    )
    .in("id", photoIds)
    .eq("org_id", reportPackage.org_id)
    .eq("property_id", reportPackage.property_id)
    .eq("session_id", reportPackage.session_id)
    .eq("storage_bucket", "scoutcapture-originals")
    .eq("upload_state", "uploaded")
    .is("deleted_at", null)
    .not("storage_path", "is", null)
    .order("position", { ascending: true, nullsFirst: false })
    .order("captured_at", { ascending: true });

  if (error) throw error;
  const found = new Set((data || []).map((row) => String(row.id).toLowerCase()));
  if (found.size !== photoIds.length || photoIds.some((id) => !found.has(id))) {
    const unavailable = new Error("Selected photos are not available.");
    unavailable.statusCode = 404;
    throw unavailable;
  }
  return data || [];
}

export function stampedFilenameFromShot(shotRow) {
  const originalName = friendlyOriginalDownloadFilename(shotRow);
  const stem = originalName.replace(/\.[^.]+$/, "");
  return `${stem}${shotRow.is_flagged ? "_Flagged" : ""}.jpg`;
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
