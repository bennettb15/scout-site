import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import {
  DELIVERABLES_BUCKET,
  ORIGINALS_BUCKET,
  SIGNED_URL_SECONDS,
  authenticateRequest,
  createServiceClient,
  enrichPhotoRowWithSnapshotMetadata,
  expectedOriginalJpgPreviewPath,
  friendlyOriginalDownloadFilename,
  friendlyPhotoDisplayName,
  getQueryValue,
  loadSnapshotPhotoMetadata,
  methodAllowed,
  originalIsBrowserPreviewable,
  originalNeedsJpgPreviewDerivative,
  originalPathIsExpected,
  sendJson,
  sortPhotoRowsBySnapshot,
  stampedPhotoFilename,
} from "./_reportPortalShared.js";
import {
  ensureUserProfile,
  isApprovedAdminEmail,
  readJsonBody,
  validateUuid,
} from "./_portalAdminShared.js";

const MAX_ROWS = 250;
const MAX_PREVIEW_URLS = 60;
const MAX_PDF_PREVIEW_URLS = 250;
const MAX_ACTIVITY_ROWS = 1000;
const MAX_NOTE_LENGTH = 1000;
const ALL_VALUE = "all";
const PDF_REPORT_TITLE = "Punch List Report";
const PDF_VERSION_MARKER = "Punchlist PDF v5 caption sidebar polish";
const SCOUT_NAVY = "#1C2742";
const ISSUE_PHOTO_SLOT_X = 12;
const ISSUE_PHOTO_SLOT_WIDTH = 430;
const ISSUE_PHOTO_SLOT_HEIGHT = 236;
const ISSUE_SIDEBAR_TEXT_GAP = 12;
const ISSUE_PAGE_RIGHT = 594;
const PRIORITY_ORDER = ["critical", "high", "medium", "low"];
const PRIORITY_BORDER_COLORS = {
  critical: "#dc2626",
  high: "#f97316",
  medium: "#facc15",
  low: "#0ea5e9",
};
const PUNCHLIST_COORDINATION_NOTE =
  "This punch list is provided as a coordination aid for visible open items documented in the selected portal context. Field teams should verify scope, responsibility, sequencing, and completion requirements before work proceeds.";
const SCOUT_ONLY_LOGO_PATH = path.join(process.cwd(), "public", "Scout Only Logo Navy Dark NEW.png");
const NOTE_WRITER_ROLES = ["viewer", "field"];
const WORKFLOW_EDITOR_ROLES = ["viewer", "field"];
const WORKFLOW_ACTIVITY_FIELD_BY_TYPE = {
  priority_changed: "priority",
  status_changed: "status",
  due_date_changed: "dueDate",
  trade_changed: "trade",
};
const WORKFLOW_ACTIVITY_TYPE_BY_FIELD = {
  priority: "priority_changed",
  status: "status_changed",
  dueDate: "due_date_changed",
  trade: "trade_changed",
};
const MAX_TRADE_NAME_LENGTH = 60;
const FIELD_REVIEW_ELEVATION_ORDER = ["front", "north", "east", "south", "west", "rear"];
const NATURAL_COLLATOR = new Intl.Collator("en-US", {
  numeric: true,
  sensitivity: "base",
});

function compactText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function keyValue(value) {
  return compactText(value)?.toLowerCase() || "";
}

function sortableText(value) {
  return compactText(value) || "";
}

function readableSortText(value) {
  return sortableText(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compareNatural(left, right) {
  const leftText = sortableText(left);
  const rightText = sortableText(right);
  if (leftText && !rightText) return -1;
  if (!leftText && rightText) return 1;
  return NATURAL_COLLATOR.compare(leftText, rightText);
}

function compareNumber(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const leftValue = Number.isFinite(leftNumber) ? leftNumber : Number.POSITIVE_INFINITY;
  const rightValue = Number.isFinite(rightNumber) ? rightNumber : Number.POSITIVE_INFINITY;
  return leftValue - rightValue;
}

function propertySortText(property) {
  if (!property) return "";
  const cityState = [property.city, property.state].filter(Boolean).join(", ");
  return [property.name, property.addressLine1, cityState, property.postalCode]
    .map(sortableText)
    .filter(Boolean)
    .join(" ");
}

function compareElevation(left, right) {
  const leftText = keyValue(left);
  const rightText = keyValue(right);
  const leftIndex = FIELD_REVIEW_ELEVATION_ORDER.indexOf(leftText);
  const rightIndex = FIELD_REVIEW_ELEVATION_ORDER.indexOf(rightText);
  const leftKnown = leftIndex >= 0;
  const rightKnown = rightIndex >= 0;
  if (leftKnown && rightKnown && leftIndex !== rightIndex) return leftIndex - rightIndex;
  if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
  return compareNatural(leftText, rightText);
}

function compareShotOrder(left, right) {
  const shotKeyCompare = compareNatural(left.shotKey, right.shotKey);
  if (shotKeyCompare !== 0) return shotKeyCompare;
  const angleCompare = compareNumber(left.angleIndex, right.angleIndex);
  if (angleCompare !== 0) return angleCompare;
  return compareNatural(left.shotId || left.id, right.shotId || right.id);
}

function compareFieldReviewOrder(left, right) {
  const propertyCompare = compareNatural(propertySortText(left.property), propertySortText(right.property));
  if (propertyCompare !== 0) return propertyCompare;
  const buildingCompare = compareNatural(left.building, right.building);
  if (buildingCompare !== 0) return buildingCompare;
  const elevationCompare = compareElevation(left.elevation, right.elevation);
  if (elevationCompare !== 0) return elevationCompare;
  const detailCompare = compareNatural(readableSortText(left.detailType), readableSortText(right.detailType));
  if (detailCompare !== 0) return detailCompare;
  const shotCompare = compareShotOrder(left, right);
  if (shotCompare !== 0) return shotCompare;
  return compareNatural(left.capturedAt || left.updatedAt, right.capturedAt || right.updatedAt);
}

function compareCoverShotOrder(left, right) {
  const rankCompare = coverShotRank(left) - coverShotRank(right);
  if (rankCompare !== 0) return rankCompare;
  const stableCompare = compareNumber(left.__coverOrder, right.__coverOrder);
  if (stableCompare !== 0) return stableCompare;
  return compareFieldReviewOrder(
    publicShotRowSortProxy(left),
    publicShotRowSortProxy(right)
  );
}

function publicShotRowSortProxy(row) {
  return {
    id: row.id,
    shotId: row.id,
    property: { id: row.property_id },
    building: row.building,
    elevation: row.elevation,
    detailType: row.detail_type,
    angleIndex: row.angle_index,
    shotKey: row.shot_key,
    capturedAt: row.captured_at || row.created_at,
    updatedAt: row.updated_at,
  };
}

function coverShotRank(row) {
  const detail = keyValue(row?.detail_type).replace(/\s+/g, "_");
  if (detail === "overview") return 0;
  if (detail === "elevation") return 1;
  const text = [row?.detail_type, row?.shot_key, row?.logical_shot_identity, row?.reason]
    .map(readableSortText)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (text.includes("overview")) return 0;
  if (text.includes("elevation")) return 1;
  return 2;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizedStatus(value) {
  const text = keyValue(value);
  if (text === "resolved" || text === "closed") return "resolved";
  return "active";
}

function normalizedPriority(value) {
  const text = keyValue(value);
  if (["low", "medium", "high", "critical"].includes(text)) return text;
  return "medium";
}

function tradeKeyFromName(value) {
  return keyValue(value)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizedTrade(value) {
  return tradeKeyFromName(value) || "general";
}

function normalizedDateOnly(value) {
  const text = compactText(value);
  if (!text) return null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return text;
}

function scopeId(req, name) {
  const value = compactText(getQueryValue(req, name));
  if (!value || value.toLowerCase() === ALL_VALUE) return "";
  return value;
}

function applyScope(query, scope) {
  let scopedQuery = query;
  if (scope.orgId) scopedQuery = scopedQuery.eq("org_id", scope.orgId);
  if (scope.propertyId) scopedQuery = scopedQuery.eq("property_id", scope.propertyId);
  return scopedQuery;
}

function toOrg(row) {
  if (!row) return null;
  return { id: row.id, name: row.name };
}

function toProperty(row) {
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    addressLine1: row.address_line1,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
  };
}

function toSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function safeObservationSelect() {
  return [
    "id",
    "org_id",
    "property_id",
    "session_id",
    "shot_id",
    "category",
    "status",
    "title",
    "detail",
    "first_seen_at",
    "last_seen_at",
    "resolved_at",
    "priority",
    "trade",
    "created_at",
    "updated_at",
    "deleted_at",
  ].join(",");
}

function shotSelect() {
  return [
    "id",
    "org_id",
    "property_id",
    "session_id",
    "building",
    "elevation",
    "detail_type",
    "angle_index",
    "shot_key",
    "logical_shot_identity",
    "captured_at",
    "created_at",
    "updated_at",
    "storage_bucket",
    "storage_path",
    "byte_size",
    "upload_state",
    "is_flagged",
    "issue_id",
    "issue_status",
    "trade",
    "reason",
    "priority",
    "image_width",
    "image_height",
    "position",
    "deleted_at",
  ].join(",");
}

async function safeRows(query) {
  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

async function maybeServiceClient() {
  try {
    return createServiceClient();
  } catch {
    return null;
  }
}

async function deliverableObjectExists(service, path) {
  const parts = String(path || "").split("/").filter(Boolean);
  const filename = parts.pop();
  if (!service || !filename || parts.length === 0) return false;

  const { data, error } = await service.storage
    .from(DELIVERABLES_BUCKET)
    .list(parts.join("/"), { limit: 1, search: filename });

  if (error || !Array.isArray(data)) return false;
  return data.some((item) => item?.name === filename);
}

async function signedPreviewUrlForPhoto(service, row) {
  if (!service || row.storage_bucket !== ORIGINALS_BUCKET || !originalPathIsExpected(row)) {
    return null;
  }

  if (originalIsBrowserPreviewable(row)) {
    const { data } = await service.storage
      .from(ORIGINALS_BUCKET)
      .createSignedUrl(row.storage_path, SIGNED_URL_SECONDS);
    return data?.signedUrl || null;
  }

  if (!originalNeedsJpgPreviewDerivative(row)) return null;

  const previewPath = expectedOriginalJpgPreviewPath(row);
  if (!(await deliverableObjectExists(service, previewPath))) return null;

  const { data } = await service.storage
    .from(DELIVERABLES_BUCKET)
    .createSignedUrl(previewPath, SIGNED_URL_SECONDS);
  return data?.signedUrl || null;
}

function packageTimestamp(row) {
  return row?.session_completed_at || row?.completed_at || "";
}

function latestPackageBySession(packageRows) {
  const bySession = new Map();
  for (const row of packageRows) {
    const current = bySession.get(row.session_id);
    if (!current || String(packageTimestamp(row)).localeCompare(String(packageTimestamp(current))) > 0) {
      bySession.set(row.session_id, row);
    }
  }
  return bySession;
}

function locationKeyFromShot(row) {
  if (
    !compactText(row?.building) &&
    !compactText(row?.elevation) &&
    !compactText(row?.detail_type) &&
    row?.angle_index == null
  ) {
    return "";
  }
  return [
    keyValue(row?.property_id),
    keyValue(row?.building),
    keyValue(row?.elevation),
    keyValue(row?.detail_type),
    String(row?.angle_index ?? ""),
  ].join("|");
}

function addDedupKeys(set, row) {
  if (row?.shotId) set.add(`shot:${keyValue(row.shotId)}`);
  if (row?.issueId) set.add(`issue:${keyValue(row.issueId)}`);
  if (row?.locationKey) set.add(`loc:${row.locationKey}`);
}

function publicPreview(row, previewUrl, reportPackage) {
  const canDownloadOriginal = Boolean(reportPackage?.id && row?.id && originalPathIsExpected(row));
  return {
    displayName: row ? friendlyPhotoDisplayName(row) : null,
    previewUrl,
    previewExpiresInSeconds: previewUrl ? SIGNED_URL_SECONDS : null,
    originalDownload: canDownloadOriginal
      ? {
          available: true,
          apiPath: `/api/original-photo-download?packageId=${encodeURIComponent(
            reportPackage.id
          )}&photoId=${encodeURIComponent(row.id)}`,
          filename: friendlyOriginalDownloadFilename(row),
        }
      : { available: false },
    stampedFilename: row ? stampedPhotoFilename(row) : null,
  };
}

async function publicCoverPhoto({
  candidateShots,
  packageBySession,
  orgById,
  propertyById,
  sessionById,
  previewForShot,
}) {
  const orderedCandidates = candidateShots
    .map((shot, index) => ({ ...shot, __coverOrder: index }))
    .sort(compareCoverShotOrder);
  const shot = orderedCandidates[0] || null;
  if (!shot) return null;

  const reportPackage = packageBySession.get(shot.session_id) || null;
  return {
    shotId: shot.id,
    previewUrl: await previewForShot(shot),
    org: orgById.get(shot.org_id) || null,
    property: propertyById.get(shot.property_id || reportPackage?.property_id) || null,
    session: sessionById.get(shot.session_id) || null,
  };
}

function publicActivityRow(row, options = {}) {
  if (!row) return null;
  const canDelete = Boolean(options.canDelete);
  const canEdit = Boolean(options.canEdit);
  return {
    id: row.id,
    activityType: row.activity_type,
    fromValue: row.from_value || null,
    toValue: row.to_value || null,
    note: compactText(row.note),
    createdBy: row.created_by || null,
    createdAt: row.created_at,
    canEdit,
    canDelete,
    permissions: {
      canEdit,
      canDelete,
    },
  };
}

function activityRowsForObservation(activityByObservationId, observationId) {
  return activityByObservationId.get(observationId) || [];
}

function workflowStateFromActivity(rows) {
  const state = {};
  for (const row of rows || []) {
    const field = WORKFLOW_ACTIVITY_FIELD_BY_TYPE[row?.activity_type];
    if (!field || Object.prototype.hasOwnProperty.call(state, field)) continue;
    if (field === "priority") {
      state[field] = normalizedPriority(row.to_value);
    } else if (field === "status") {
      state[field] = normalizedStatus(row.to_value);
    } else if (field === "dueDate") {
      state[field] = normalizedDateOnly(row.to_value);
    } else if (field === "trade") {
      state[field] = normalizedTrade(row.to_value);
    }
  }
  return state;
}

function baseWorkflowState({ observation, update, shot }) {
  return {
    priority: normalizedPriority(observation?.priority || update?.priority || shot?.priority),
    status: normalizedStatus(update?.status || observation?.status || shot?.issue_status),
    dueDate: null,
    trade: normalizedTrade(observation?.trade || update?.trade || shot?.trade),
  };
}

function workflowOverride(workflowState, field, fallback) {
  if (workflowState && Object.prototype.hasOwnProperty.call(workflowState, field)) {
    return workflowState[field];
  }
  return fallback;
}

function rowTitle(...values) {
  return values.map(compactText).find(Boolean) || "Flagged observation";
}

function publicObservationRow({
  observation,
  update,
  activity,
  canAddNote,
  canEditWorkflow,
  workflowState,
  shot,
  org,
  property,
  session,
  reportPackage,
  previewUrl,
}) {
  const baseState = baseWorkflowState({ observation, update, shot });
  const status = workflowOverride(workflowState, "status", baseState.status);
  const title = rowTitle(observation.title, update?.message, shot?.reason, observation.detail);
  const noteEditable = Boolean(canAddNote);
  const workflowEditable = Boolean(canEditWorkflow);
  return {
    id: `observation:${observation.id}`,
    source: "observation",
    observationId: observation.id,
    canAddNote: noteEditable,
    canEditWorkflow: workflowEditable,
    isEditable: noteEditable || workflowEditable,
    issueId: shot?.issue_id || null,
    org,
    property,
    session,
    shotId: shot?.id || observation.shot_id || null,
    packageId: reportPackage?.id || null,
    status,
    priority: workflowOverride(workflowState, "priority", baseState.priority),
    trade: workflowOverride(workflowState, "trade", baseState.trade),
    dueDate: workflowOverride(workflowState, "dueDate", baseState.dueDate),
    title,
    reason: compactText(observation.detail || update?.note || shot?.reason) || title,
    building: compactText(shot?.building),
    elevation: compactText(shot?.elevation),
    detailType: compactText(shot?.detail_type),
    angleIndex: shot?.angle_index ?? null,
    shotKey: compactText(shot?.shot_key),
    capturedAt: update?.captured_at || shot?.captured_at || observation.first_seen_at || observation.created_at,
    updatedAt: update?.updated_at || observation.updated_at,
    resolvedAt: observation.resolved_at || (status === "resolved" ? update?.updated_at || observation.updated_at : null),
    locationKey: shot ? locationKeyFromShot({ ...shot, property_id: observation.property_id }) : "",
    preview: publicPreview(shot, previewUrl, reportPackage),
    activity,
    permissions: {
      canAddNote: noteEditable,
      canEditWorkflow: workflowEditable,
    },
  };
}

function publicShotRow({ shot, org, property, session, reportPackage, previewUrl, canAddNote, canEditWorkflow }) {
  const status = normalizedStatus(shot.issue_status);
  const title = rowTitle(shot.reason);
  const noteEditable = Boolean(canAddNote);
  const workflowEditable = Boolean(canEditWorkflow);
  return {
    id: `shot:${shot.id}`,
    source: "flagged_shot",
    observationId: null,
    canAddNote: noteEditable,
    canEditWorkflow: workflowEditable,
    isEditable: noteEditable || workflowEditable,
    issueId: shot.issue_id || null,
    org,
    property,
    session,
    shotId: shot.id,
    packageId: reportPackage?.id || null,
    status,
    priority: normalizedPriority(shot.priority),
    trade: normalizedTrade(shot.trade),
    dueDate: null,
    title,
    reason: compactText(shot.reason) || title,
    building: compactText(shot.building),
    elevation: compactText(shot.elevation),
    detailType: compactText(shot.detail_type),
    angleIndex: shot.angle_index ?? null,
    shotKey: compactText(shot.shot_key),
    capturedAt: shot.captured_at || shot.created_at,
    updatedAt: shot.updated_at || shot.captured_at || shot.created_at,
    resolvedAt: status === "resolved" ? shot.updated_at || shot.captured_at || shot.created_at : null,
    locationKey: locationKeyFromShot(shot),
    preview: publicPreview(shot, previewUrl, reportPackage),
    activity: [],
    permissions: {
      canAddNote: noteEditable,
      canEditWorkflow: workflowEditable,
    },
  };
}

async function loadNoteWriterMembership(auth, orgId) {
  const { data, error } = await auth.client
    .from("org_memberships")
    .select("id,role,access_scope,deleted_at")
    .eq("org_id", orgId)
    .eq("user_id", auth.user.id)
    .in("role", NOTE_WRITER_ROLES)
    .is("deleted_at", null);

  if (error) return null;
  return (data || []).find((row) => (row.access_scope || "org") === "org") || null;
}

async function noteWriterOrgIdSet(auth, orgIds) {
  const ids = unique(orgIds).filter(Boolean);
  if (ids.length === 0) return new Set();
  if (isApprovedAdminEmail(auth.user?.email)) return new Set(ids);

  const { data, error } = await auth.client
    .from("org_memberships")
    .select("org_id,role,access_scope,deleted_at")
    .in("org_id", ids)
    .eq("user_id", auth.user.id)
    .in("role", NOTE_WRITER_ROLES)
    .is("deleted_at", null);

  if (error) return new Set();
  return new Set(
    (data || [])
      .filter((row) => (row.access_scope || "org") === "org")
      .map((row) => row.org_id)
  );
}

async function loadWorkflowEditorMembership(auth, orgId) {
  const { data, error } = await auth.client
    .from("org_memberships")
    .select("id,role,access_scope,deleted_at")
    .eq("org_id", orgId)
    .eq("user_id", auth.user.id)
    .in("role", WORKFLOW_EDITOR_ROLES)
    .is("deleted_at", null);

  if (error) return null;
  return (data || []).find((row) => (row.access_scope || "org") === "org") || null;
}

async function workflowEditorOrgIdSet(auth, orgIds) {
  const ids = unique(orgIds).filter(Boolean);
  if (ids.length === 0) return new Set();
  if (isApprovedAdminEmail(auth.user?.email)) return new Set(ids);

  const { data, error } = await auth.client
    .from("org_memberships")
    .select("org_id,role,access_scope,deleted_at")
    .in("org_id", ids)
    .eq("user_id", auth.user.id)
    .in("role", WORKFLOW_EDITOR_ROLES)
    .is("deleted_at", null);

  if (error) return new Set();
  return new Set(
    (data || [])
      .filter((row) => (row.access_scope || "org") === "org")
      .map((row) => row.org_id)
  );
}

function validateNoteText(value) {
  const note = compactText(value);
  if (!note) {
    const error = new Error("Note text is required.");
    error.statusCode = 400;
    throw error;
  }
  if (note.length > MAX_NOTE_LENGTH) {
    const error = new Error(`Notes must be ${MAX_NOTE_LENGTH} characters or fewer.`);
    error.statusCode = 400;
    throw error;
  }
  return note;
}

function workflowFieldName(value) {
  const text = String(value || "").trim();
  if (text === "dueDate" || text === "due_date") return "dueDate";
  if (["priority", "status", "trade"].includes(text)) return text;
  return "";
}

function validateWorkflowValue(field, value) {
  if (field === "priority") {
    const priority = keyValue(value);
    if (["critical", "high", "medium", "low"].includes(priority)) return priority;
    const error = new Error("Priority must be Critical, High, Medium, or Low.");
    error.statusCode = 400;
    throw error;
  }

  if (field === "status") {
    const status = keyValue(value);
    if (["active", "resolved"].includes(status)) return status;
    const error = new Error("Status must be Active or Resolved.");
    error.statusCode = 400;
    throw error;
  }

  if (field === "dueDate") {
    if (value == null || compactText(value) === "") return null;
    const dueDate = normalizedDateOnly(value);
    if (dueDate) return dueDate;
    const error = new Error("Due date must be a valid date.");
    error.statusCode = 400;
    throw error;
  }

  if (field === "trade") {
    const trade = normalizedTrade(value);
    if (/^[a-z0-9][a-z0-9 _/-]{0,60}$/.test(trade)) return trade;
    const error = new Error("Trade is not valid.");
    error.statusCode = 400;
    throw error;
  }

  const error = new Error("Editable punch list field is required.");
  error.statusCode = 400;
  throw error;
}

function workflowActivityErrorMessage(error, field) {
  const message = String(error?.message || "");
  if (
    field === "dueDate" &&
    (error?.code === "23514" ||
      message.includes("punchlist_activity_type_check") ||
      message.includes("due_date_changed"))
  ) {
    return "Due date activity is not enabled yet. Apply supabase/migrations/202608260002_punchlist_activity_due_date.sql.";
  }
  return "Unable to update workflow field. Punch list activity may need to be configured.";
}

function isFlaggedShot(row) {
  return Boolean(row?.is_flagged || row?.issue_id || compactText(row?.issue_status));
}

function promotedObservationStatus(shot) {
  return normalizedStatus(shot?.issue_status) === "resolved" ? "resolved" : "active";
}

async function loadReadyReportPackageForShot(auth, shot, packageId) {
  let query = auth.client
    .from("report_packages")
    .select("id,org_id,property_id,session_id,snapshot_id,status,session_completed_at,completed_at")
    .eq("org_id", shot.org_id)
    .eq("session_id", shot.session_id)
    .eq("status", "ready")
    .is("deleted_at", null)
    .order("session_completed_at", { ascending: false })
    .limit(1);

  if (packageId) {
    query = query.eq("id", packageId);
  }

  if (shot.property_id) {
    query = query.eq("property_id", shot.property_id);
  }

  const { data, error } = await query.maybeSingle();
  if (error) return null;
  return data || null;
}

async function loadAccessibleFallbackShot(auth, service, shotId, packageId) {
  const { data: rawShot, error: shotError } = await auth.client
    .from("shots")
    .select(shotSelect())
    .eq("id", shotId)
    .is("deleted_at", null)
    .maybeSingle();

  if (shotError || !rawShot) return null;

  const reportPackage = await loadReadyReportPackageForShot(auth, rawShot, packageId);
  if (!reportPackage) return null;

  const snapshotMetadata = await loadSnapshotPhotoMetadata(service, reportPackage);
  const shot = enrichPhotoRowWithSnapshotMetadata(rawShot, snapshotMetadata);
  const propertyId = shot.property_id || reportPackage.property_id;
  if (!propertyId || reportPackage.org_id !== shot.org_id || reportPackage.session_id !== shot.session_id) {
    return null;
  }
  if (!isFlaggedShot(shot)) return null;

  return {
    ...shot,
    property_id: propertyId,
  };
}

async function findExistingObservationForShot(service, shot) {
  const { data, error } = await service
    .from("observations")
    .select(safeObservationSelect())
    .eq("org_id", shot.org_id)
    .eq("shot_id", shot.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data || null;
}

async function createObservationForFallbackShot(service, auth, shot) {
  const status = promotedObservationStatus(shot);
  const seenAt = shot.captured_at || shot.created_at || null;
  const resolvedAt = status === "resolved" ? shot.updated_at || seenAt : null;
  const title = rowTitle(shot.reason);
  const { data, error } = await service
    .from("observations")
    .insert({
      org_id: shot.org_id,
      property_id: shot.property_id,
      session_id: shot.session_id,
      shot_id: shot.id,
      category: "condition",
      status,
      title,
      detail: compactText(shot.reason) || title,
      first_seen_session_id: shot.session_id,
      last_update_session_id: shot.session_id,
      resolved_session_id: status === "resolved" ? shot.session_id : null,
      first_seen_at: seenAt,
      last_seen_at: seenAt,
      resolved_at: resolvedAt,
      priority: compactText(shot.priority),
      trade: compactText(shot.trade),
      updated_by: auth.user.id,
      deleted_at: null,
    })
    .select(safeObservationSelect())
    .single();

  if (error) {
    throw new Error("Unable to prepare punch list item for notes.");
  }
  return data;
}

async function canWritePunchListNotes(auth, orgId) {
  if (isApprovedAdminEmail(auth.user?.email)) return true;
  return Boolean(await loadNoteWriterMembership(auth, orgId));
}

async function canEditPunchListWorkflow(auth, orgId) {
  if (isApprovedAdminEmail(auth.user?.email)) return true;
  return Boolean(await loadWorkflowEditorMembership(auth, orgId));
}

async function resolveNoteObservation(auth, service, { observationId, shotId, packageId }) {
  if (observationId) {
    const { data: observation, error: observationError } = await auth.client
      .from("observations")
      .select(safeObservationSelect())
      .eq("id", observationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (observationError) {
      const error = new Error("Unable to load punch list item.");
      error.statusCode = 500;
      throw error;
    }
    if (!observation) {
      const error = new Error("Punch list item not found.");
      error.statusCode = 404;
      throw error;
    }
    if (!(await canWritePunchListNotes(auth, observation.org_id))) {
      const error = new Error("Client Viewer or Field User access is required to add notes.");
      error.statusCode = 403;
      throw error;
    }
    return observation;
  }

  if (!shotId) {
    const error = new Error("Valid observation or shot ID is required.");
    error.statusCode = 400;
    throw error;
  }

  const shot = await loadAccessibleFallbackShot(auth, service, shotId, packageId);
  if (!shot) {
    const error = new Error("Punch list photo not found.");
    error.statusCode = 404;
    throw error;
  }
  if (!(await canWritePunchListNotes(auth, shot.org_id))) {
    const error = new Error("Client Viewer or Field User access is required to add notes.");
    error.statusCode = 403;
    throw error;
  }

  const existing = await findExistingObservationForShot(service, shot);
  return existing || createObservationForFallbackShot(service, auth, shot);
}

async function resolveWorkflowObservation(auth, service, { observationId, shotId, packageId }) {
  if (observationId) {
    const { data: observation, error: observationError } = await auth.client
      .from("observations")
      .select(safeObservationSelect())
      .eq("id", observationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (observationError) {
      const error = new Error("Unable to load punch list item.");
      error.statusCode = 500;
      throw error;
    }
    if (!observation) {
      const error = new Error("Punch list item not found.");
      error.statusCode = 404;
      throw error;
    }
    if (!(await canEditPunchListWorkflow(auth, observation.org_id))) {
      const error = new Error("Client Viewer or Field User access is required to edit workflow fields.");
      error.statusCode = 403;
      throw error;
    }
    return observation;
  }

  if (!shotId) {
    const error = new Error("Valid observation or shot ID is required.");
    error.statusCode = 400;
    throw error;
  }

  const shot = await loadAccessibleFallbackShot(auth, service, shotId, packageId);
  if (!shot) {
    const error = new Error("Punch list photo not found.");
    error.statusCode = 404;
    throw error;
  }
  if (!(await canEditPunchListWorkflow(auth, shot.org_id))) {
    const error = new Error("Client Viewer or Field User access is required to edit workflow fields.");
    error.statusCode = 403;
    throw error;
  }

  const existing = await findExistingObservationForShot(service, shot);
  return existing || createObservationForFallbackShot(service, auth, shot);
}

async function workflowStateForObservation(service, observationId) {
  const { data, error } = await service
    .from("punchlist_activity")
    .select("activity_type,to_value,created_at,deleted_at")
    .eq("observation_id", observationId)
    .in("activity_type", Object.keys(WORKFLOW_ACTIVITY_FIELD_BY_TYPE))
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return {};
  return workflowStateFromActivity(data || []);
}

function workflowValueForField({ observation, workflowState }, field) {
  const baseState = baseWorkflowState({ observation, update: null, shot: null });
  return workflowOverride(workflowState, field, baseState[field]) || null;
}

function publicTradeOption(row) {
  if (!row) return null;
  const key = compactText(row.trade_key) || normalizedTrade(row.name);
  if (!key) return null;
  return {
    id: key,
    key,
    name: compactText(row.name) || key,
    label: compactText(row.name) || key,
    isActive: row.is_active !== false,
  };
}

async function loadTradeOptions() {
  const service = await maybeServiceClient();
  if (!service) return [];
  const { data, error } = await service
    .from("punchlist_trade_options")
    .select("id,name,trade_key,is_active,deleted_at")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) return [];
  return (data || []).map(publicTradeOption).filter(Boolean);
}

async function canAddTradeOption(auth) {
  if (isApprovedAdminEmail(auth.user?.email)) return true;
  const { data, error } = await auth.client
    .from("org_memberships")
    .select("id,role,access_scope,deleted_at")
    .eq("user_id", auth.user.id)
    .eq("role", "field")
    .eq("access_scope", "org")
    .is("deleted_at", null)
    .limit(1);

  if (error) return false;
  return (data || []).length > 0;
}

async function tradeOptionExists(service, tradeKey) {
  const key = normalizedTrade(tradeKey);
  if (!key) return false;
  const { data, error } = await service
    .from("punchlist_trade_options")
    .select("id")
    .eq("trade_key", key)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return false;
  return Boolean(data);
}

function validateTradeName(value) {
  const name = String(value || "").replace(/\s+/g, " ").trim();
  if (!name) {
    const error = new Error("Trade name is required.");
    error.statusCode = 400;
    throw error;
  }
  if (name.length > MAX_TRADE_NAME_LENGTH) {
    const error = new Error(`Trade names must be ${MAX_TRADE_NAME_LENGTH} characters or fewer.`);
    error.statusCode = 400;
    throw error;
  }
  const key = tradeKeyFromName(name);
  if (!key) {
    const error = new Error("Trade name is not valid.");
    error.statusCode = 400;
    throw error;
  }
  return { name, key };
}

async function handleAddNote(req, res) {
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const observationId = validateUuid(body.observationId);
  const shotId = validateUuid(body.shotId);
  const packageId = validateUuid(body.packageId);
  if (!observationId && !shotId) {
    return sendJson(res, 400, { error: "Valid observation or shot ID is required." });
  }

  let note = "";
  try {
    note = validateNoteText(body.note);
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { error: error.message });
  }

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });

    const service = createServiceClient();
    await ensureUserProfile(service, auth.user, auth.user.id);
    const observation = await resolveNoteObservation(auth, service, { observationId, shotId, packageId });

    const { data: activity, error: activityError } = await service
      .from("punchlist_activity")
      .insert({
        org_id: observation.org_id,
        property_id: observation.property_id,
        observation_id: observation.id,
        shot_id: observation.shot_id || null,
        activity_type: "note_added",
        from_value: null,
        to_value: null,
        note,
        created_by: auth.user.id,
        deleted_at: null,
      })
      .select("id,activity_type,from_value,to_value,note,created_by,created_at")
      .single();

    if (activityError) {
      return sendJson(res, 500, {
        error: "Unable to add note. Punch list activity may need to be configured.",
      });
    }

    return sendJson(res, 200, {
      activity: publicActivityRow(activity, { canEdit: true, canDelete: true }),
      observationId: observation.id,
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { error: error.message || "Unable to add note." });
  }
}

async function handleAddTradeOption(req, res) {
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  let trade;
  try {
    trade = validateTradeName(body.name || body.trade || body.value);
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { error: error.message });
  }

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });
    if (!(await canAddTradeOption(auth))) {
      return sendJson(res, 403, { error: "Field User access is required to add trades." });
    }

    const service = createServiceClient();
    await ensureUserProfile(service, auth.user, auth.user.id);

    const { data: existing, error: existingError } = await service
      .from("punchlist_trade_options")
      .select("id,name,trade_key,is_active,deleted_at")
      .eq("trade_key", trade.key)
      .is("deleted_at", null)
      .maybeSingle();

    if (existingError) {
      return sendJson(res, 500, { error: "Unable to check trade options." });
    }
    if (existing) {
      return sendJson(res, 200, {
        tradeOption: publicTradeOption(existing),
        created: false,
      });
    }

    const { data: inserted, error: insertError } = await service
      .from("punchlist_trade_options")
      .insert({
        name: trade.name,
        trade_key: trade.key,
        is_active: true,
        created_by: auth.user.id,
        deleted_at: null,
      })
      .select("id,name,trade_key,is_active,deleted_at")
      .single();

    if (insertError) {
      return sendJson(res, 500, { error: "Unable to add trade option." });
    }

    return sendJson(res, 200, {
      tradeOption: publicTradeOption(inserted),
      created: true,
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      error: error.message || "Unable to add trade option.",
    });
  }
}

async function handleUpdateNote(req, res, body = null) {
  if (!body) {
    try {
      body = await readJsonBody(req);
    } catch {
      return sendJson(res, 400, { error: "Invalid JSON body." });
    }
  }

  const noteId = validateUuid(body.noteId || body.activityId);
  if (!noteId) {
    return sendJson(res, 400, { error: "Valid note ID is required." });
  }

  let note = "";
  try {
    note = validateNoteText(body.note);
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { error: error.message });
  }

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });

    const { data: activity, error: activityError } = await auth.client
      .from("punchlist_activity")
      .select("id,org_id,property_id,observation_id,shot_id,activity_type,from_value,to_value,note,created_by,created_at,deleted_at")
      .eq("id", noteId)
      .is("deleted_at", null)
      .maybeSingle();

    if (activityError) {
      return sendJson(res, 500, { error: "Unable to load note." });
    }
    if (!activity) {
      return sendJson(res, 404, { error: "Note not found." });
    }
    if (activity.activity_type !== "note_added") {
      return sendJson(res, 400, { error: "Only notes can be edited." });
    }

    const adminAllowed = isApprovedAdminEmail(auth.user?.email);
    const ownNoteWriterNote =
      activity.created_by === auth.user.id && (await loadNoteWriterMembership(auth, activity.org_id));
    if (!adminAllowed && !ownNoteWriterNote) {
      return sendJson(res, 403, { error: "You can only edit your own notes." });
    }

    if (compactText(activity.note) === note) {
      return sendJson(res, 200, {
        updated: true,
        unchanged: true,
        activity: publicActivityRow(activity, {
          canEdit: true,
          canDelete: adminAllowed || Boolean(ownNoteWriterNote),
        }),
      });
    }

    const service = createServiceClient();
    const { data: updatedActivity, error: updateError } = await service
      .from("punchlist_activity")
      .update({
        note,
        from_value: activity.from_value || activity.note || null,
        to_value: note,
      })
      .eq("id", activity.id)
      .is("deleted_at", null)
      .select("id,activity_type,from_value,to_value,note,created_by,created_at")
      .single();

    if (updateError) {
      return sendJson(res, 500, { error: "Unable to edit note." });
    }

    return sendJson(res, 200, {
      updated: true,
      activity: publicActivityRow(updatedActivity, {
        canEdit: true,
        canDelete: adminAllowed || Boolean(ownNoteWriterNote),
      }),
    });
  } catch {
    return sendJson(res, 500, { error: "Unable to edit note." });
  }
}

async function handleUpdateWorkflowField(req, res, body = null) {
  if (!body) {
    try {
      body = await readJsonBody(req);
    } catch {
      return sendJson(res, 400, { error: "Invalid JSON body." });
    }
  }

  const observationId = validateUuid(body.observationId);
  const shotId = validateUuid(body.shotId);
  const packageId = validateUuid(body.packageId);
  const field = workflowFieldName(body.field);
  if (!observationId && !shotId) {
    return sendJson(res, 400, { error: "Valid observation or shot ID is required." });
  }
  if (!field) {
    return sendJson(res, 400, { error: "Editable punch list field is required." });
  }

  let nextValue;
  try {
    nextValue = validateWorkflowValue(field, body.value);
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { error: error.message });
  }

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });

    const service = createServiceClient();
    await ensureUserProfile(service, auth.user, auth.user.id);
    const observation = await resolveWorkflowObservation(auth, service, { observationId, shotId, packageId });
    const workflowState = await workflowStateForObservation(service, observation.id);
    const currentValue = workflowValueForField({ observation, workflowState }, field);
    if ((currentValue || null) === (nextValue || null)) {
      return sendJson(res, 200, {
        updated: true,
        unchanged: true,
        observationId: observation.id,
      });
    }
    if (field === "trade" && !(await tradeOptionExists(service, nextValue))) {
      return sendJson(res, 400, { error: "Trade must be an active punch list trade option." });
    }

    const activityType = WORKFLOW_ACTIVITY_TYPE_BY_FIELD[field];
    const { data: activity, error: activityError } = await service
      .from("punchlist_activity")
      .insert({
        org_id: observation.org_id,
        property_id: observation.property_id,
        observation_id: observation.id,
        shot_id: observation.shot_id || null,
        activity_type: activityType,
        from_value: currentValue || null,
        to_value: nextValue || null,
        note: null,
        created_by: auth.user.id,
        deleted_at: null,
      })
      .select("id,activity_type,from_value,to_value,note,created_by,created_at")
      .single();

    if (activityError) {
      return sendJson(res, 500, {
        error: workflowActivityErrorMessage(activityError, field),
      });
    }

    return sendJson(res, 200, {
      updated: true,
      activity: publicActivityRow(activity),
      observationId: observation.id,
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      error: error.message || "Unable to update workflow field.",
    });
  }
}

async function handleDeleteNote(req, res) {
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const noteId = validateUuid(body.noteId || body.activityId);
  if (!noteId) {
    return sendJson(res, 400, { error: "Valid note ID is required." });
  }

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });

    const { data: activity, error: activityError } = await auth.client
      .from("punchlist_activity")
      .select("id,org_id,property_id,observation_id,shot_id,activity_type,created_by,deleted_at")
      .eq("id", noteId)
      .is("deleted_at", null)
      .maybeSingle();

    if (activityError) {
      return sendJson(res, 500, { error: "Unable to load note." });
    }
    if (!activity) {
      return sendJson(res, 404, { error: "Note not found." });
    }
    if (activity.activity_type !== "note_added") {
      return sendJson(res, 400, { error: "Only notes can be deleted." });
    }

    const adminAllowed = isApprovedAdminEmail(auth.user?.email);
    const ownNoteWriterNote =
      activity.created_by === auth.user.id && (await loadNoteWriterMembership(auth, activity.org_id));
    if (!adminAllowed && !ownNoteWriterNote) {
      return sendJson(res, 403, { error: "You can only delete your own notes." });
    }

    const service = createServiceClient();
    const { error: updateError } = await service
      .from("punchlist_activity")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", activity.id)
      .is("deleted_at", null);

    if (updateError) {
      return sendJson(res, 500, { error: "Unable to delete note." });
    }

    return sendJson(res, 200, { deleted: true, noteId: activity.id });
  } catch {
    return sendJson(res, 500, { error: "Unable to delete note." });
  }
}

async function loadPunchListRows(auth, scope, { maxPreviewUrls = MAX_PREVIEW_URLS, includeCoverPhoto = false } = {}) {
  const { client } = auth;
  const packageRows = await safeRows(
    applyScope(
      client
        .from("report_packages")
        .select("id,org_id,property_id,session_id,snapshot_id,status,session_completed_at,completed_at")
        .eq("status", "ready")
        .is("deleted_at", null),
      scope
    )
      .order("session_completed_at", { ascending: false })
      .limit(100)
  );

  const observations = await safeRows(
    applyScope(
      client
        .from("observations")
        .select(safeObservationSelect())
        .is("deleted_at", null),
      scope
    )
      .order("updated_at", { ascending: false })
      .limit(MAX_ROWS)
  );

  const observationIds = observations.map((row) => row.id);
  const observationUpdates = observationIds.length
    ? await safeRows(
        client
          .from("observation_updates")
          .select("id,org_id,property_id,observation_id,session_id,shot_id,update_type,status,message,note,priority,trade,captured_at,created_at,updated_at,deleted_at")
          .in("observation_id", observationIds)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(MAX_ROWS * 3)
      )
    : [];
  const punchListActivity = observationIds.length
    ? await safeRows(
        client
          .from("punchlist_activity")
          .select("id,org_id,property_id,observation_id,shot_id,activity_type,from_value,to_value,note,created_by,created_at,deleted_at")
          .in("observation_id", observationIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(MAX_ACTIVITY_ROWS)
      )
    : [];

  const packageBySession = latestPackageBySession(packageRows);
  const sessionIds = unique([
    ...packageRows.map((row) => row.session_id),
    ...observations.map((row) => row.session_id),
    ...observationUpdates.map((row) => row.session_id),
  ]);
  const shotIds = unique([
    ...observations.map((row) => row.shot_id),
    ...observationUpdates.map((row) => row.shot_id),
  ]);

  const [packageSessionShots, observationShots] = await Promise.all([
    sessionIds.length
      ? safeRows(
          client
            .from("shots")
            .select(shotSelect())
            .in("session_id", sessionIds)
            .eq("storage_bucket", ORIGINALS_BUCKET)
            .eq("upload_state", "uploaded")
            .is("deleted_at", null)
            .not("storage_path", "is", null)
            .order("position", { ascending: true, nullsFirst: false })
            .order("captured_at", { ascending: true })
            .limit(5000)
        )
      : [],
    shotIds.length
      ? safeRows(
          client
            .from("shots")
            .select(shotSelect())
            .in("id", shotIds)
            .is("deleted_at", null)
            .limit(shotIds.length)
        )
      : [],
  ]);

  const service = await maybeServiceClient();
  const snapshotMetadataByPackageId = new Map();
  if (service) {
    for (const reportPackage of packageRows) {
      const metadata = await loadSnapshotPhotoMetadata(service, reportPackage);
      if (metadata) snapshotMetadataByPackageId.set(reportPackage.id, metadata);
    }
  }

  const shotsById = new Map();
  const shotsBySession = new Map();
  for (const rawShot of [...packageSessionShots, ...observationShots]) {
    const reportPackage = packageBySession.get(rawShot.session_id);
    const snapshotMetadata = reportPackage
      ? snapshotMetadataByPackageId.get(reportPackage.id)
      : null;
    const row = enrichPhotoRowWithSnapshotMetadata(rawShot, snapshotMetadata);
    if (!row.property_id && reportPackage?.property_id) {
      row.property_id = reportPackage.property_id;
    }
    if (!originalPathIsExpected(row)) continue;
    shotsById.set(row.id, row);
    const rows = shotsBySession.get(row.session_id) || [];
    rows.push(row);
    shotsBySession.set(row.session_id, rows);
  }

  const orgIds = unique([
    ...packageRows.map((row) => row.org_id),
    ...observations.map((row) => row.org_id),
    ...Array.from(shotsById.values()).map((row) => row.org_id),
  ]);
  const propertyIds = unique([
    ...packageRows.map((row) => row.property_id),
    ...observations.map((row) => row.property_id),
    ...Array.from(shotsById.values()).map((row) => row.property_id),
  ]);

  const [{ data: orgRows }, { data: propertyRows }, { data: sessionRows }] =
    await Promise.all([
      orgIds.length
        ? client.from("orgs").select("id,name").in("id", orgIds).is("deleted_at", null)
        : { data: [] },
      propertyIds.length
        ? client
            .from("properties")
            .select("id,org_id,name,address_line1,city,state,postal_code")
            .in("id", propertyIds)
            .is("deleted_at", null)
        : { data: [] },
      sessionIds.length
        ? client
            .from("sessions")
            .select("id,org_id,property_id,title,started_at,completed_at")
            .in("id", sessionIds)
            .is("deleted_at", null)
        : { data: [] },
    ]);

  const orgById = new Map((orgRows || []).map((row) => [row.id, toOrg(row)]));
  const propertyById = new Map((propertyRows || []).map((row) => [row.id, toProperty(row)]));
  const sessionById = new Map((sessionRows || []).map((row) => [row.id, toSession(row)]));
  const noteWriterOrgIds = await noteWriterOrgIdSet(auth, orgIds);
  const workflowEditorOrgIds = await workflowEditorOrgIdSet(auth, orgIds);
  const adminAllowed = isApprovedAdminEmail(auth.user?.email);
  const latestUpdateByObservationId = new Map();
  for (const update of observationUpdates) {
    if (!latestUpdateByObservationId.has(update.observation_id)) {
      latestUpdateByObservationId.set(update.observation_id, update);
    }
  }
  const activityByObservationId = new Map();
  const workflowActivityByObservationId = new Map();
  for (const activityRow of punchListActivity) {
    const workflowField = WORKFLOW_ACTIVITY_FIELD_BY_TYPE[activityRow.activity_type];
    if (workflowField) {
      const rows = workflowActivityByObservationId.get(activityRow.observation_id) || [];
      rows.push(activityRow);
      workflowActivityByObservationId.set(activityRow.observation_id, rows);
      continue;
    }
    if (activityRow.activity_type !== "note_added") continue;
    const ownNoteWriterNote =
      noteWriterOrgIds.has(activityRow.org_id) && activityRow.created_by === auth.user.id;
    const publicRow = publicActivityRow(activityRow, {
      canEdit: adminAllowed || ownNoteWriterNote,
      canDelete: adminAllowed || ownNoteWriterNote,
    });
    if (!publicRow?.note) continue;
    const rows = activityByObservationId.get(activityRow.observation_id) || [];
    rows.push(publicRow);
    activityByObservationId.set(activityRow.observation_id, rows);
  }

  const previewCache = new Map();
  async function previewForShot(shot) {
    if (!shot) return null;
    if (previewCache.has(shot.id)) return previewCache.get(shot.id);
    if (previewCache.size >= maxPreviewUrls) return null;
    const previewUrl = await signedPreviewUrlForPhoto(service, shot);
    previewCache.set(shot.id, previewUrl);
    return previewUrl;
  }

  const candidateShots = [];
  for (const reportPackage of packageRows) {
    const sessionShots = shotsBySession.get(reportPackage.session_id) || [];
    candidateShots.push(...sortPhotoRowsBySnapshot(sessionShots));
  }

  const coverPhoto = includeCoverPhoto
    ? await publicCoverPhoto({
        candidateShots,
        packageBySession,
        orgById,
        propertyById,
        sessionById,
        previewForShot,
      })
    : null;

  const rows = [];
  const dedupKeys = new Set();
  for (const observation of observations) {
    const shot = observation.shot_id ? shotsById.get(observation.shot_id) : null;
    const reportPackage = packageBySession.get(observation.session_id) || null;
    const row = publicObservationRow({
      observation,
      update: latestUpdateByObservationId.get(observation.id) || null,
      activity: activityRowsForObservation(activityByObservationId, observation.id),
      canAddNote: noteWriterOrgIds.has(observation.org_id),
      canEditWorkflow: workflowEditorOrgIds.has(observation.org_id),
      workflowState: workflowStateFromActivity(
        activityRowsForObservation(workflowActivityByObservationId, observation.id)
      ),
      shot,
      org: orgById.get(observation.org_id) || null,
      property: propertyById.get(observation.property_id || shot?.property_id) || null,
      session: sessionById.get(observation.session_id) || null,
      reportPackage,
      previewUrl: await previewForShot(shot),
    });
    addDedupKeys(dedupKeys, row);
    rows.push(row);
  }

  for (const shot of candidateShots) {
    const isFlagged = Boolean(shot.is_flagged || shot.issue_id || compactText(shot.issue_status));
    if (!isFlagged) continue;
    const candidate = {
      shotId: shot.id,
      issueId: shot.issue_id,
      locationKey: locationKeyFromShot(shot),
    };
    const duplicate =
      (candidate.shotId && dedupKeys.has(`shot:${keyValue(candidate.shotId)}`)) ||
      (candidate.issueId && dedupKeys.has(`issue:${keyValue(candidate.issueId)}`)) ||
      (candidate.locationKey && dedupKeys.has(`loc:${candidate.locationKey}`));
    if (duplicate) continue;

    const reportPackage = packageBySession.get(shot.session_id) || null;
    const row = publicShotRow({
      shot,
      org: orgById.get(shot.org_id) || null,
      property: propertyById.get(shot.property_id || reportPackage?.property_id) || null,
      session: sessionById.get(shot.session_id) || null,
      reportPackage,
      previewUrl: await previewForShot(shot),
      canAddNote: noteWriterOrgIds.has(shot.org_id),
      canEditWorkflow: workflowEditorOrgIds.has(shot.org_id),
    });
    addDedupKeys(dedupKeys, row);
    rows.push(row);
    if (rows.length >= MAX_ROWS) break;
  }

  rows.sort(compareFieldReviewOrder);
  const limitedRows = rows.slice(0, MAX_ROWS);
  return includeCoverPhoto ? { rows: limitedRows, coverPhoto } : limitedRows;
}

function priorityRank(value) {
  const index = PRIORITY_ORDER.indexOf(normalizedPriority(value));
  return index >= 0 ? index : PRIORITY_ORDER.length;
}

function comparePunchReportRows(left, right) {
  const priorityCompare = priorityRank(left.priority) - priorityRank(right.priority);
  if (priorityCompare !== 0) return priorityCompare;
  return compareFieldReviewOrder(left, right);
}

function formatPdfDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatPdfTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function clockMinutes(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getHours() * 60 + date.getMinutes();
}

function formatPdfDateTime(value) {
  const date = formatPdfDate(value);
  const time = formatPdfTime(value);
  return [date, time].filter(Boolean).join(" ");
}

function formatPdfLongDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const dateText = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
  const timeText = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${dateText} · ${timeText}`;
}

function localDateOnly(value) {
  const text = compactText(value);
  if (!text) return null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function todayDateOnlyString() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatPdfDueDate(value) {
  const date = localDateOnly(value);
  if (!date || Number.isNaN(date.getTime())) return "Not set";
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
  return String(value) < todayDateOnlyString() ? `${formatted} (Overdue)` : formatted;
}

function titleCaseWords(value) {
  return compactText(value)
    ?.replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (word.toLowerCase() === "hvac") return "HVAC";
      return `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join(" ") || "";
}

function tradeLabelFromOptions(value, tradeOptions) {
  const key = normalizedTrade(value);
  const option = tradeOptions.find((item) => item.key === key || item.id === key);
  return option?.label || option?.name || titleCaseWords(key) || "General";
}

function propertyName(row) {
  return compactText(row?.property?.name) || "Property";
}

function propertyAddress(row) {
  const property = row?.property;
  if (!property) return "";
  const cityState = [property.city, property.state].filter(Boolean).join(", ");
  return [property.addressLine1, cityState, property.postalCode].filter(Boolean).join(" ");
}

function locationCode(row) {
  if (!row) return "";
  const angle = row.angleIndex ? `A${row.angleIndex}` : "";
  const line = [row.building, row.elevation, row.detailType, angle]
    .map((value) => compactText(value)?.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" | ")
    .toUpperCase();
  return line || compactText(row.shotKey)?.toUpperCase() || row.shotId?.slice(0, 8).toUpperCase() || "ISSUE";
}

function safeFilenamePart(value) {
  return (compactText(value) || "Punch_List")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "Punch_List";
}

function pdfFilenameTimestamp(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("-");
}

function punchListReportFilename(rows) {
  const first = rows[0] || {};
  const property = propertyName(first);
  return `${safeFilenamePart(property)}_Punch_List_Report_${pdfFilenameTimestamp()}.pdf`;
}

function validatePdfScope(body) {
  const orgId = validateUuid(body.orgId);
  const propertyId =
    body.propertyId && String(body.propertyId).toLowerCase() !== ALL_VALUE
      ? validateUuid(body.propertyId)
      : "";

  if (!orgId) {
    const error = new Error("Valid organization is required.");
    error.statusCode = 400;
    throw error;
  }
  if (body.propertyId && String(body.propertyId).toLowerCase() !== ALL_VALUE && !propertyId) {
    const error = new Error("Valid property is required.");
    error.statusCode = 400;
    throw error;
  }
  return { orgId, propertyId };
}

function validateSelectedTrades(value, tradeOptions) {
  if (!Array.isArray(value)) {
    const error = new Error("At least one trade is required.");
    error.statusCode = 400;
    throw error;
  }
  const activeTradeKeys = new Set(tradeOptions.map((option) => option.key).filter(Boolean));
  const selected = unique(value.map(normalizedTrade)).filter(Boolean);
  if (selected.length === 0) {
    const error = new Error("At least one trade is required.");
    error.statusCode = 400;
    throw error;
  }
  if (selected.length > activeTradeKeys.size) {
    const error = new Error("Too many trades selected.");
    error.statusCode = 400;
    throw error;
  }
  const invalid = selected.find((trade) => !activeTradeKeys.has(trade));
  if (invalid) {
    const error = new Error("Selected trades must be active punch list trade options.");
    error.statusCode = 400;
    throw error;
  }
  return selected;
}

async function imageBufferFromUrl(url) {
  if (!url || typeof fetch !== "function") return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const type = response.headers.get("content-type") || "";
    if (!type.includes("image/jpeg") && !type.includes("image/png")) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

function collectPdf(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function scoutLogoPath() {
  if (fs.existsSync(SCOUT_ONLY_LOGO_PATH)) return SCOUT_ONLY_LOGO_PATH;
  const error = new Error(`Required Scout logo asset missing. Looked in: ${SCOUT_ONLY_LOGO_PATH}`);
  error.statusCode = 500;
  throw error;
}

function drawScoutLogo(doc, x, y, width, height) {
  doc.image(scoutLogoPath(), x, y, { fit: [width, height], align: "center", valign: "center" });
}

function footerPropertyLine(row) {
  return [propertyName(row), propertyAddress(row)].map(singleLine).filter(Boolean).join(" · ");
}

function tradePageTitle(tradeLabel) {
  const label = singleLine(tradeLabel, "General");
  return `${label} Trade Items`;
}

function addReportPage(doc, pageTitle = PDF_REPORT_TITLE, footerRow = null) {
  doc.addPage({ size: "LETTER", margin: 42 });
  drawScoutLogo(doc, 221, 22, 170, 34);
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(SCOUT_NAVY)
    .text(pageTitle, 18, 18, { width: 220, height: 16 });
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor("#000000")
    .text(PUNCHLIST_COORDINATION_NOTE, 64, 724, { width: 484, height: 18, lineGap: 0.5 });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#111827")
    .text(footerPropertyLine(footerRow) || "Unknown property", 64, 748, { width: 380, height: 12 });
}

function drawLabelValue(doc, label, value, x, y, width) {
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#64748b").text(label.toUpperCase(), x, y, { width });
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor("#111827")
    .text(value || "None", x, y + 10, { width, height: 24 });
}

function issuePhotoFitRect(doc, imageBuffer, x, y, width, height) {
  if (imageBuffer) {
    try {
      const image = doc.openImage(imageBuffer);
      const fitted = aspectFitBox({ width: image.width, height: image.height }, { x, y, width, height });
      return {
        ...fitted,
        hasImage: true,
        isLandscape: image.width >= image.height,
      };
    } catch {
      return { x, y, width, height, hasImage: false, isLandscape: false };
    }
  }
  return { x, y, width, height, hasImage: false, isLandscape: false };
}

function drawIssuePhoto(doc, imageBuffer, x, y, width, height, options = {}) {
  const radius = options.radius ?? 0;
  const borderColor = options.borderColor || "#d8dee8";
  const backgroundColor = options.backgroundColor || "#f1f5f9";
  const { x: drawX, y: drawY, width: drawWidth, height: drawHeight } = issuePhotoFitRect(
    doc,
    imageBuffer,
    x,
    y,
    width,
    height
  );

  doc.save();
  if (imageBuffer) {
    try {
      if (radius > 0) {
        doc.roundedRect(drawX, drawY, drawWidth, drawHeight, radius).clip();
      } else {
        doc.rect(drawX, drawY, drawWidth, drawHeight).clip();
      }
      doc.image(imageBuffer, drawX, drawY, { width: drawWidth, height: drawHeight });
    } catch {
      doc.rect(x, y, width, height).fill(backgroundColor);
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#64748b")
        .text("Photo unavailable", x, y + height / 2 - 6, { width, align: "center" });
    }
  } else {
    doc.rect(x, y, width, height).fill(backgroundColor);
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#64748b")
      .text("Photo unavailable", x, y + height / 2 - 6, { width, align: "center" });
  }
  doc.restore();
  doc.lineWidth(options.borderWidth ?? 1).strokeColor(borderColor);
  if (radius > 0) {
    doc.roundedRect(drawX, drawY, drawWidth, drawHeight, radius).stroke();
  } else {
    doc.rect(drawX, drawY, drawWidth, drawHeight).stroke();
  }
}

function aspectFitBox(imageSize, container) {
  const imageWidth = Number(imageSize?.width);
  const imageHeight = Number(imageSize?.height);
  if (
    !Number.isFinite(imageWidth) ||
    !Number.isFinite(imageHeight) ||
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    container.width <= 0 ||
    container.height <= 0
  ) {
    return container;
  }

  const scale = Math.min(container.width / imageWidth, container.height / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: container.x + (container.width - width) / 2,
    y: container.y + (container.height - height) / 2,
    width,
    height,
  };
}

function singleLine(value, fallback = "") {
  return (compactText(value) || fallback).replace(/\s+/g, " ").trim();
}

function truncatedLine(value, maxLength = 130) {
  const text = singleLine(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function truncateTextForLines(doc, value, { width, maxLines, font = "Helvetica", fontSize = 8 }) {
  const text = singleLine(value);
  if (!text) return "";
  doc.font(font).fontSize(fontSize);
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (doc.widthOfString(candidate) <= width) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  const consumed = lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (consumed < words.length && lines.length > 0) {
    let last = lines[lines.length - 1];
    while (last.length > 0 && doc.widthOfString(`${last}...`) > width) {
      last = last.slice(0, -1).trim();
    }
    lines[lines.length - 1] = `${last || lines[lines.length - 1].slice(0, 1)}...`;
  }
  return lines.slice(0, maxLines).join("\n");
}

function noteSummary(row) {
  const notes = (Array.isArray(row.activity) ? row.activity : [])
    .filter((activity) => activity?.activityType === "note_added" && compactText(activity.note))
    .slice(0, 2)
    .map((note) => {
      const date = formatPdfDateTime(note.createdAt) || "Recent";
      return `${date}: ${singleLine(note.note)}`;
    });
  return notes.length ? notes.join("  |  ") : "No notes recorded.";
}

function priorityBorderColor(priority) {
  return PRIORITY_BORDER_COLORS[normalizedPriority(priority)] || PRIORITY_BORDER_COLORS.medium;
}

function drawCaptionFlagIcon(doc, x, y) {
  const scale = 0.55;
  doc.save();
  doc.translate(x - 2.6, y - 3.3).scale(scale);
  doc
    .path("M14.4 6 14 4H5v17h2v-7h5.6l.4 2h7V6z")
    .fillColor("#dc2626")
    .fill();
  doc.restore();
}

function drawPriorityCaptionLine(doc, row, x, y, width) {
  const priorityKey = normalizedPriority(row.priority);
  const priority = titleCaseWords(priorityKey);
  const title = singleLine(row.title);
  const fallbackReason = title && title.toLowerCase() !== "flagged observation" ? title : "No reason recorded";
  const reason = singleLine(row.reason, fallbackReason);
  const reasonText = truncatedLine(reason, 64);
  const dotSize = 7;
  const gap = 5;
  const flagWidth = 9;
  const separator = " · ";

  doc.font("Helvetica").fontSize(10);
  const priorityWidth = doc.widthOfString(priority);
  const separatorWidth = doc.widthOfString(separator);
  const reasonWidth = doc.widthOfString(reasonText);
  const totalWidth = dotSize + gap + priorityWidth + separatorWidth + flagWidth + gap + reasonWidth;
  let currentX = x + Math.max(0, (width - totalWidth) / 2);

  doc.circle(currentX + dotSize / 2, y + 3.8, dotSize / 2).fillColor(priorityBorderColor(priorityKey)).fill();
  currentX += dotSize + gap;
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#111827")
    .text(priority, currentX, y, { width: priorityWidth + 1, height: 14, lineBreak: false });
  currentX += priorityWidth;
  doc.text(separator, currentX, y, { width: separatorWidth + 1, height: 14, lineBreak: false });
  currentX += separatorWidth;
  drawCaptionFlagIcon(doc, currentX, y);
  currentX += flagWidth + gap;
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#dc2626")
    .text(reasonText, currentX, y, {
      width: Math.max(20, x + width - currentX),
      height: 14,
      lineBreak: false,
      ellipsis: true,
    });
}

function drawSidebarItem(doc, label, value, x, y, width, options = {}) {
  const fontSize = options.fontSize || 9.5;
  doc
    .font("Helvetica-Bold")
    .fontSize(fontSize)
    .fillColor("#000000")
    .text(label || "", x, y, { width, height: 11, lineBreak: false });
  doc
    .font(options.font || "Helvetica")
    .fontSize(fontSize)
    .fillColor(options.color || "#111827")
    .text(value || "None", x, y + 12, {
      width,
      height: options.height || 20,
      lineGap: options.lineGap ?? 1,
      ellipsis: true,
    });
}

function drawIssueSidebar(doc, row, tradeLabel, x, y, width, height) {
  const dueDate = formatPdfDueDate(row.dueDate);
  const notes = truncateTextForLines(doc, noteSummary(row), {
    width,
    maxLines: 7,
    font: "Helvetica",
    fontSize: 9.5,
  });

  doc.save();
  doc
    .lineWidth(0.5)
    .strokeColor("#cbd5e1")
    .moveTo(x - 6, y + 4)
    .lineTo(x - 6, y + height - 4)
    .stroke();
  doc.restore();

  drawSidebarItem(doc, "Trade", tradeLabel, x, y + 4, width, { height: 32 });
  drawSidebarItem(doc, "Due Date", dueDate, x, y + 52, width, { height: 36 });
  drawSidebarItem(doc, "Notes", notes, x, y + 101, width, {
    height: 118,
    lineGap: 1.15,
  });
}

function issuePageSidebarX(doc, rows, imageBuffers) {
  const landscapeRightEdges = rows
    .map((row) =>
      issuePhotoFitRect(
        doc,
        imageBuffers.get(row.id),
        ISSUE_PHOTO_SLOT_X,
        0,
        ISSUE_PHOTO_SLOT_WIDTH,
        ISSUE_PHOTO_SLOT_HEIGHT
      )
    )
    .filter((rect) => rect.hasImage && rect.isLandscape)
    .map((rect) => rect.x + rect.width);
  const referenceRight =
    landscapeRightEdges.length > 0
      ? Math.max(...landscapeRightEdges)
      : ISSUE_PHOTO_SLOT_X + ISSUE_PHOTO_SLOT_WIDTH;
  return Math.min(450, referenceRight + ISSUE_SIDEBAR_TEXT_GAP);
}

function drawIssueBlock(
  doc,
  row,
  tradeLabel,
  imageBuffer,
  y,
  sidebarX = ISSUE_PHOTO_SLOT_X + ISSUE_PHOTO_SLOT_WIDTH + ISSUE_SIDEBAR_TEXT_GAP
) {
  const sidebarWidth = Math.max(120, ISSUE_PAGE_RIGHT - sidebarX);
  const photoCaptionGap = 8;
  const captionY = y + ISSUE_PHOTO_SLOT_HEIGHT + photoCaptionGap;
  drawIssuePhoto(doc, imageBuffer, ISSUE_PHOTO_SLOT_X, y, ISSUE_PHOTO_SLOT_WIDTH, ISSUE_PHOTO_SLOT_HEIGHT, {
    radius: 12,
    borderColor: priorityBorderColor(row.priority),
    borderWidth: 2,
    backgroundColor: "#f2f2f2",
  });
  drawIssueSidebar(doc, row, tradeLabel, sidebarX, y, sidebarWidth, ISSUE_PHOTO_SLOT_HEIGHT);

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#111827")
    .text(locationCode(row), ISSUE_PHOTO_SLOT_X, captionY, {
      width: ISSUE_PHOTO_SLOT_WIDTH,
      align: "center",
      height: 14,
    });
  drawPriorityCaptionLine(doc, row, ISSUE_PHOTO_SLOT_X, captionY + 14, ISSUE_PHOTO_SLOT_WIDTH);
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor("#111827")
    .text(formatPdfLongDateTime(row.capturedAt || row.updatedAt) || "Unknown", ISSUE_PHOTO_SLOT_X, captionY + 29, {
      width: ISSUE_PHOTO_SLOT_WIDTH,
      align: "center",
      height: 14,
    });
}

function coverServiceWindow(rows, coverPhoto) {
  const contextSession = coverPhoto?.session || rows.find((row) => row.session)?.session || null;
  const candidates = contextSession?.startedAt || contextSession?.completedAt
    ? [contextSession.startedAt, contextSession.completedAt]
    : rows.map((row) => row.capturedAt);
  const dates = candidates
    .filter(Boolean)
    .map((value) => ({ raw: value, date: new Date(value) }))
    .filter((entry) => !Number.isNaN(entry.date.getTime()))
    .sort((left, right) => left.date.getTime() - right.date.getTime());
  const first = dates[0] || null;
  const last = dates[dates.length - 1] || null;
  if (!first) return { serviceDate: "", timeWindow: "" };

  const serviceDate = formatPdfDate(first.raw);
  if (!last || first.raw === last.raw) {
    return { serviceDate, timeWindow: formatPdfTime(first.raw) };
  }

  const firstClock = clockMinutes(first.raw);
  const lastClock = clockMinutes(last.raw);
  const firstDate = formatPdfDate(first.raw);
  const lastDate = formatPdfDate(last.raw);
  if (firstDate === lastDate && firstClock != null && lastClock != null && lastClock < firstClock) {
    return { serviceDate, timeWindow: formatPdfTime(first.raw) };
  }
  if (firstDate !== lastDate) {
    return {
      serviceDate,
      timeWindow: `${formatPdfTime(first.raw)} to ${formatPdfDateTime(last.raw)}`,
    };
  }
  return { serviceDate, timeWindow: `${formatPdfTime(first.raw)} to ${formatPdfTime(last.raw)}` };
}

function coverContext(rows, coverPhoto) {
  const first = rows[0] || {};
  return {
    property: coverPhoto?.property || first.property || null,
    org: coverPhoto?.org || first.org || null,
    session: coverPhoto?.session || first.session || null,
    packageId: first.packageId || null,
  };
}

function drawCoverMetadataRow(doc, label, value, y) {
  const lineX = 72;
  const lineWidth = 468;
  const labelText = label || "";
  const valueText = value || "None";
  doc.font("Helvetica-Bold").fontSize(11);
  const labelWidth = doc.widthOfString(labelText);
  doc.font("Helvetica").fontSize(11);
  const valueWidth = valueText ? doc.widthOfString(valueText) : 0;
  const totalWidth = Math.ceil(labelWidth + (valueText ? 4 : 0) + valueWidth);
  const startX = lineX + Math.max(0, (lineWidth - totalWidth) / 2);

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#000000")
    .text(labelText, startX, y, { width: labelWidth + 1, height: 16, lineBreak: false });
  if (valueText) {
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#000000")
      .text(valueText, startX + labelWidth + 4, y, { width: lineX + lineWidth - startX, height: 16, lineBreak: false });
  }
}

function drawCoverCenteredText(doc, value, y, options = {}) {
  doc
    .font(options.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(options.fontSize || 11)
    .fillColor(options.color || "#000000")
    .text(value || "", 72, y, {
      width: 468,
      height: options.height || 16,
      align: "center",
      lineBreak: false,
    });
}

function drawCoverPage(doc, rows, coverImageBuffer, coverPhoto) {
  const context = coverContext(rows, coverPhoto);
  const contextRow = { property: context.property, org: context.org, session: context.session };
  const { serviceDate, timeWindow } = coverServiceWindow(rows, coverPhoto);

  doc.addPage({ size: "LETTER", margin: 42 });
  drawScoutLogo(doc, 72, 80, 468, 80);

  drawIssuePhoto(doc, coverImageBuffer, 126, 178, 360, 182, {
    radius: 12,
    borderColor: "#d3dae5",
    borderWidth: 0.5,
    backgroundColor: "#ffffff",
  });
  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .fillColor("#000000")
    .text(PDF_REPORT_TITLE, 72, 386, { width: 468, align: "center", height: 28 });

  let y = 440;
  const coverRows = [
    ["Property Name:", propertyName(contextRow)],
    ["Property Address:", propertyAddress(contextRow)],
    ["Date of Service:", serviceDate],
    ["Time Window:", timeWindow],
    ["Organization:", context.org?.name || ""],
    ["Open Issues:", String(rows.length)],
    ["Report Reference ID:", context.packageId],
    ["Report Date:", formatPdfDate(new Date())],
  ];
  for (const [label, value] of coverRows) {
    drawCoverMetadataRow(doc, label, value, y);
    y += 18;
  }

  y += 12;
  drawCoverCenteredText(doc, "Prepared by:", y, { bold: true, fontSize: 11 });
  drawCoverCenteredText(doc, "SCOUT - Visual Documentation Services", y + 26, { fontSize: 11 });
  drawCoverCenteredText(doc, "Clear, time-stamped visual documentation of observable property conditions.", y + 46, {
    fontSize: 11,
  });
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor("#475569")
    .text(PUNCHLIST_COORDINATION_NOTE, 94, y + 70, { width: 424, height: 42, align: "center", lineGap: 2 });
}

async function buildPunchListPdf(rows, tradeOptions, coverPhoto = null) {
  const doc = new PDFDocument({ autoFirstPage: false, bufferPages: true, size: "LETTER", margin: 42 });
  doc.info.Title = PDF_REPORT_TITLE;
  doc.info.Subject = PDF_VERSION_MARKER;
  const result = collectPdf(doc);
  const imageBuffers = new Map();
  const coverImagePromise = imageBufferFromUrl(coverPhoto?.previewUrl);
  await Promise.all(
    rows.map(async (row) => {
      const buffer = await imageBufferFromUrl(row.preview?.previewUrl);
      if (buffer) imageBuffers.set(row.id, buffer);
    })
  );
  const coverImageBuffer = await coverImagePromise;

  drawCoverPage(doc, rows, coverImageBuffer || imageBuffers.get(rows[0]?.id) || null, coverPhoto);
  const rowsByTrade = new Map();
  for (const row of rows) {
    const tradeKey = normalizedTrade(row.trade);
    const group = rowsByTrade.get(tradeKey) || [];
    group.push(row);
    rowsByTrade.set(tradeKey, group);
  }

  const reportSidebarX = issuePageSidebarX(doc, rows, imageBuffers);
  for (const [tradeKey, tradeRows] of rowsByTrade.entries()) {
    const label = tradeLabelFromOptions(tradeKey, tradeOptions);
    for (let index = 0; index < tradeRows.length; index += 2) {
      const pageRows = tradeRows.slice(index, index + 2);
      addReportPage(doc, tradePageTitle(label), pageRows[0]);
      pageRows.forEach((row, offset) => {
        const blockY = offset === 0 ? 98 : 410;
        drawIssueBlock(doc, row, label, imageBuffers.get(row.id) || null, blockY, reportSidebarX);
      });
    }
  }

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor("#94a3b8")
      .text(PDF_VERSION_MARKER, 320, 748, { width: 170, height: 10, align: "right", lineBreak: false });
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#111827")
      .text(`Page ${index + 1}`, 500, 748, { width: 58, height: 12, align: "right", lineBreak: false });
  }

  doc.end();
  return result;
}

async function handleGeneratePdf(req, res) {
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });

    const scope = validatePdfScope(body);
    const tradeOptions = await loadTradeOptions();
    const selectedTrades = validateSelectedTrades(body.trades, tradeOptions);
    const selectedTradeSet = new Set(selectedTrades);
    const punchListData = await loadPunchListRows(auth, scope, {
      maxPreviewUrls: MAX_PDF_PREVIEW_URLS + 1,
      includeCoverPhoto: true,
    });
    const { rows, coverPhoto } = punchListData;
    const activeRows = rows.filter((row) => row.status !== "resolved");
    const openTradeSet = new Set(activeRows.map((row) => normalizedTrade(row.trade)));
    const reportTradeOrder = tradeOptions
      .map((option) => option.key)
      .filter((key) => selectedTradeSet.has(key) && openTradeSet.has(key));

    const reportRows = reportTradeOrder.flatMap((trade) =>
      activeRows
        .filter((row) => normalizedTrade(row.trade) === trade)
        .sort(comparePunchReportRows)
    );

    if (reportRows.length === 0) {
      return sendJson(res, 400, { error: "No open punch list issues found for the selected trades." });
    }

    const pdf = await buildPunchListPdf(reportRows, tradeOptions, coverPhoto);
    const filename = punchListReportFilename(reportRows);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(pdf);
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      error: error.message || "Unable to generate punch list PDF.",
    });
  }
}

async function handleFilters(req, res) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });

    const { client } = auth;
    const [packageRows, observationRows] = await Promise.all([
      safeRows(
        client
          .from("report_packages")
          .select("org_id,property_id")
          .eq("status", "ready")
          .is("deleted_at", null)
          .order("session_completed_at", { ascending: false })
          .limit(1000)
      ),
      safeRows(
        client
          .from("observations")
          .select("org_id,property_id")
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(1000)
      ),
    ]);

    const orgIds = unique([
      ...packageRows.map((row) => row.org_id),
      ...observationRows.map((row) => row.org_id),
    ]);
    const propertyIds = unique([
      ...packageRows.map((row) => row.property_id),
      ...observationRows.map((row) => row.property_id),
    ]);

    const [{ data: orgRows }, { data: propertyRows }, tradeOptions, tradeOptionEditable] = await Promise.all([
      orgIds.length
        ? client
            .from("orgs")
            .select("id,name")
            .in("id", orgIds)
            .is("deleted_at", null)
            .order("name", { ascending: true })
        : { data: [] },
      propertyIds.length
        ? client
            .from("properties")
            .select("id,org_id,name,address_line1,city,state,postal_code")
            .in("id", propertyIds)
            .is("deleted_at", null)
            .order("name", { ascending: true })
        : { data: [] },
      loadTradeOptions(),
      canAddTradeOption(auth),
    ]);

    return sendJson(res, 200, {
      orgs: (orgRows || []).map(toOrg),
      properties: (propertyRows || []).map(toProperty),
      tradeOptions,
      permissions: {
        canAddTradeOption: Boolean(tradeOptionEditable),
      },
    });
  } catch {
    return sendJson(res, 500, { error: "Unable to load punch list filters." });
  }
}

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST", "PATCH", "DELETE", "OPTIONS"])) return;

  if (req.method === "POST") {
    if (getQueryValue(req, "mode") === "pdf") {
      return handleGeneratePdf(req, res);
    }
    if (getQueryValue(req, "mode") === "trade-options") {
      return handleAddTradeOption(req, res);
    }
    return handleAddNote(req, res);
  }
  if (req.method === "PATCH") {
    let body = {};
    try {
      body = await readJsonBody(req);
    } catch {
      return sendJson(res, 400, { error: "Invalid JSON body." });
    }
    if (body.noteId != null || body.activityId != null) {
      return handleUpdateNote(req, res, body);
    }
    return handleUpdateWorkflowField(req, res, body);
  }
  if (req.method === "DELETE") {
    return handleDeleteNote(req, res);
  }

  if (getQueryValue(req, "mode") === "filters") {
    return handleFilters(req, res);
  }

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });

    const rows = await loadPunchListRows(auth, {
      orgId: scopeId(req, "orgId"),
      propertyId: scopeId(req, "propertyId"),
    });

    return sendJson(res, 200, { rows });
  } catch {
    return sendJson(res, 500, { error: "Unable to load punch list." });
  }
}
