import { createClient } from "@supabase/supabase-js";

export const DELIVERABLES_BUCKET = "scoutcapture-deliverables";
export const ORIGINALS_BUCKET = "scoutcapture-originals";
export const SIGNED_URL_SECONDS = 600;

export function sendJson(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  return res.status(status).json(body);
}

export function methodAllowed(req, res, methods) {
  res.setHeader("Allow", methods.join(", "));
  if (req.method === "OPTIONS") {
    return sendJson(res, 204, {});
  }
  if (!methods.includes(req.method)) {
    sendJson(res, 405, { error: "Method not allowed" });
    return false;
  }
  return true;
}

export function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function getSupabaseUrl() {
  return (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ""
  ).replace(/\/$/, "");
}

function getAnonKey() {
  return (
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ""
  );
}

export function createUserClient(accessToken) {
  const url = getSupabaseUrl();
  const anonKey = getAnonKey();
  if (!url || !anonKey) {
    throw new Error("Public Supabase server configuration is missing.");
  }
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export function createServiceClient() {
  const url = getSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceKey) {
    throw new Error("Server Supabase signing configuration is missing.");
  }
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function authenticateRequest(req) {
  const token = getBearerToken(req);
  if (!token) {
    return { error: "Authentication required." };
  }

  const client = createUserClient(token);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user?.id) {
    return { error: "Authentication required." };
  }

  return { client, user: data.user };
}

export function getQueryValue(req, name) {
  if (req.query && typeof req.query[name] === "string") {
    return req.query[name];
  }
  const host = req.headers.host || "localhost";
  const parsed = new URL(req.url || "/", `http://${host}`);
  return parsed.searchParams.get(name) || "";
}

export function expectedPdfPath(fileRow) {
  return [
    "orgs",
    fileRow.org_id,
    "properties",
    fileRow.property_id,
    "sessions",
    fileRow.session_id,
    "packages",
    fileRow.package_id,
    "pdfs",
    `${fileRow.report_type}.pdf`,
  ]
    .map((part) => String(part).toLowerCase())
    .join("/");
}

export function expectedStampedZipPath(exportRow) {
  return [
    "orgs",
    exportRow.org_id,
    "properties",
    exportRow.property_id,
    "sessions",
    exportRow.session_id,
    "exports",
    "stamped-jpg",
    `${exportRow.id}.zip`,
  ]
    .map((part) => String(part).toLowerCase())
    .join("/");
}

export function expectedOriginalJpgPreviewPath(shotRow) {
  return [
    "orgs",
    shotRow.org_id,
    "properties",
    shotRow.property_id,
    "sessions",
    shotRow.session_id,
    "previews",
    "original-jpg",
    `${shotRow.id}.jpg`,
  ]
    .map((part) => String(part).toLowerCase())
    .join("/");
}

export function expectedOriginalPath(shotRow) {
  return [
    "sessions",
    shotRow.session_id,
    "shots",
    shotRow.id,
    originalFilename(shotRow),
  ]
    .map((part, index) => (index < 4 ? String(part).toLowerCase() : String(part)))
    .join("/");
}

export function originalPathIsExpected(shotRow) {
  const path = String(shotRow.storage_path || "");
  const prefix = `sessions/${String(shotRow.session_id).toLowerCase()}/shots/${String(shotRow.id).toLowerCase()}/`;
  return path.startsWith(prefix) && path.length > prefix.length;
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

function normalizedOperationalStatus(value) {
  const text = textValue(value)
    ?.replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
  if (text === "resolved" || text === "closed") return "resolved";
  if (text === "active" || text === "open" || text === "reopened") return "active";
  return "";
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
      shot?.activeIssueId ||
      shot?.resolvedIssueID ||
      shot?.resolvedIssueId
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

function snapshotCaptureKind(shot) {
  return textValue(shot?.captureKind || shot?.capture_kind || shot?.kind)
    ?.replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase();
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

function issueOperationalStatus(issue) {
  return normalizedOperationalStatus(issue?.issueStatus || issue?.issue_status || issue?.status);
}

function snapshotIssueOperationalStatus(shot, issuesById) {
  const shotStatus = normalizedOperationalStatus(shot?.issueStatus || shot?.issue_status);
  if (shotStatus === "active") return "active";
  if (
    textValue(shot?.activeIssueID || shot?.activeIssueId || shot?.active_issue_id)
  ) {
    return "active";
  }

  const issue = issuesById.get(snapshotIssueId(shot));
  const issueStatus = issueOperationalStatus(issue);
  if (issueStatus === "active") return "active";

  if (
    boolValue(
      shot?.isResolvedInSession ||
        shot?.is_resolved_in_session ||
        shot?.resolvedInSession ||
        shot?.resolved_in_session
    )
  ) {
    return "resolved";
  }
  if (snapshotCaptureKind(shot) === "resolved_capture") {
    return "resolved";
  }
  if (shotStatus === "resolved") return "resolved";
  if (
    textValue(shot?.resolvedIssueID || shot?.resolvedIssueId || shot?.resolved_issue_id)
  ) {
    return "resolved";
  }
  if (issueStatus === "resolved") return "resolved";

  return "";
}

function snapshotResolvedInSession(shot, issuesById) {
  return snapshotIssueOperationalStatus(shot, issuesById) === "resolved";
}

function issueReopenedInSession(issue, sessionId) {
  const events = Array.isArray(issue?.historyEvents)
    ? issue.historyEvents
    : Array.isArray(issue?.history_events)
      ? issue.history_events
      : [];
  return events.some((event) => {
    const type = textValue(event?.type || event?.kind || event?.activityType || event?.activity_type)
      ?.replace(/([a-z])([A-Z])/g, "$1_$2")
      .replace(/[\s-]+/g, "_")
      .toLowerCase();
    if (type !== "reopened" && type !== "reopen") return false;

    const eventSessionId = idValue(event?.sessionId || event?.sessionID || event?.session_id);
    if (sessionId && eventSessionId && eventSessionId !== sessionId) return false;

    const details = event?.details && typeof event.details === "object" ? event.details : {};
    const afterStatus = normalizedOperationalStatus(
      event?.afterValue || event?.after_value || details.afterValue || details.after_value
    );
    return !afterStatus || afterStatus === "active";
  });
}

export function buildSnapshotPhotoMetadata(rawSession) {
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
  const sessionId = idValue(rawSession?.sessionID || rawSession?.sessionId || rawSession?.id);
  const byShotId = new Map();
  const byStoragePath = new Map();
  const byFilename = new Map();
  const rows = [];

  shots.forEach((shot, index) => {
    const shotId = snapshotShotId(shot);
    const issueId = snapshotIssueId(shot);
    const issue = issuesById.get(issueId);
    const issueStatus = snapshotIssueOperationalStatus(shot, issuesById);
    const storagePath = snapshotStoragePath(shot);
    const filename = snapshotOriginalFilename(shot);
    const metadata = {
      shot_id: shotId || null,
      issue_id: issueId || null,
      issue_status: issueStatus || null,
      has_issue_state_signal: Boolean(issueStatus),
      snapshot_reopened_in_session: Boolean(issueStatus === "active" && issueReopenedInSession(issue, sessionId)),
      storage_path: storagePath,
      original_filename: filename,
      building: textValue(shot?.building),
      elevation: textValue(shot?.elevation || shot?.targetElevation),
      detail_type: textValue(shot?.detailType || shot?.detail_type || shot?.type),
      angle_index: safeAngleIndex(shot?.angleIndex || shot?.angle_index),
      shot_key: textValue(shot?.shotKey || shot?.shot_key),
      captured_at: snapshotCapturedAt(shot),
      is_flagged: boolValue(shot?.isFlagged || shot?.is_flagged || shot?.flagged),
      is_resolved_in_session: issueStatus === "resolved" || (!issueStatus && snapshotResolvedInSession(shot, issuesById)),
      reason: flaggedReasonFromSnapshot(shot, issuesById),
      priority: textValue(shot?.priority),
      snapshot_order: index,
    };
    if (shotId) byShotId.set(shotId, metadata);
    if (storagePath) byStoragePath.set(storagePath.toLowerCase(), metadata);
    if (filename) byFilename.set(filename.toLowerCase(), metadata);
    rows.push(metadata);
  });

  return { byShotId, byStoragePath, byFilename, rows };
}

export async function loadSnapshotPhotoMetadata(service, reportPackage) {
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

export function enrichPhotoRowWithSnapshotMetadata(row, snapshotMetadata) {
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
    is_resolved_in_session: metadata.has_issue_state_signal
      ? metadata.is_resolved_in_session
      : metadata.is_resolved_in_session || row.is_resolved_in_session,
    issue_status: metadata.issue_status || row.issue_status,
    snapshot_issue_status: metadata.issue_status || null,
    snapshot_reopened_in_session: Boolean(metadata.snapshot_reopened_in_session),
    reason: metadata.reason || row.reason,
    priority: metadata.priority || row.priority || null,
    snapshot_order: metadata.snapshot_order,
  };
}

export function sortPhotoRowsBySnapshot(rows) {
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

export function originalFilename(shotRow) {
  return String(shotRow.storage_path || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .pop() || `${shotRow.id}.heic`;
}

function displayText(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

export function friendlyPhotoDisplayName(shotRow) {
  return [
    displayText(shotRow.building, "B1"),
    displayText(shotRow.elevation, "Unknown"),
    displayText(shotRow.detail_type, "General Elevation"),
    `Angle ${Number(shotRow.angle_index || 1)}`,
  ].join(" | ");
}

function safeFilenamePart(value) {
  const text = String(value || "").trim() || "Photo";
  return text.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "Photo";
}

export function friendlyOriginalDownloadFilename(shotRow) {
  const extension = originalFilename(shotRow).split(".").pop() || "HEIC";
  return [
    safeFilenamePart(displayText(shotRow.building, "B1")),
    safeFilenamePart(displayText(shotRow.elevation, "Unknown")),
    safeFilenamePart(displayText(shotRow.detail_type, "General Elevation")),
    `A${Number(shotRow.angle_index || 1)}`,
  ].join("_") + `.${extension.toUpperCase()}`;
}

function safeStampedFilenamePart(value) {
  const raw = String(value || "").trim();
  const forbidden = new Set('/\\:*?"<>|');
  const chars = [];
  for (const ch of raw) {
    if (ch.charCodeAt(0) < 32 || forbidden.has(ch) || ch === " ") {
      chars.push("_");
    } else {
      chars.push(ch);
    }
  }
  return chars.join("").replace(/_+/g, "_").replace(/^_+|_+$/g, "") || "Item";
}

function safeStampedAngle(value) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) ? number : 0;
}

function stampedDetailId(shotRow) {
  const shotKey = String(shotRow.shot_key || shotRow.shotKey || "").trim().toUpperCase();
  if (/^A\d+$/.test(shotKey)) return shotKey;
  return `A${safeStampedAngle(shotRow.angle_index)}`;
}

export function stampedPhotoFilename(shotRow) {
  const base = [
    safeStampedFilenamePart(shotRow.building),
    safeStampedFilenamePart(shotRow.elevation),
    safeStampedFilenamePart(shotRow.detail_type || "Shot"),
    safeStampedFilenamePart(stampedDetailId(shotRow)),
  ].join("_");
  const suffix = shotRow.is_flagged || shotRow.is_resolved_in_session ? "_Flagged" : "";
  return `${base}${suffix}.jpg`;
}

export function originalMimeType(shotRow) {
  const extension = originalFilename(shotRow).split(".").pop()?.toLowerCase();
  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "heif":
      return "image/heif";
    case "heic":
    default:
      return "image/heic";
  }
}

export function originalIsBrowserPreviewable(shotRow) {
  return ["image/jpeg", "image/png"].includes(originalMimeType(shotRow));
}

export function originalNeedsJpgPreviewDerivative(shotRow) {
  return ["image/heic", "image/heif"].includes(originalMimeType(shotRow));
}

export function publicReportTypeLabel(reportType) {
  switch (reportType) {
    case "property_report":
      return "Property Report";
    case "flagged_observations":
      return "Flagged Observations";
    case "flagged_comparison":
      return "Flagged Comparison";
    default:
      return "Report";
  }
}
