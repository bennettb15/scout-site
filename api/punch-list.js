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
const MAX_ACTIVITY_ROWS = 1000;
const MAX_NOTE_LENGTH = 1000;
const ALL_VALUE = "all";
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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizedStatus(value) {
  const text = keyValue(value);
  if (text === "resolved" || text === "closed") return "resolved";
  if (text === "resolved_pending_verification" || text === "pending") {
    return "resolved_pending_verification";
  }
  return "active";
}

function normalizedPriority(value) {
  const text = keyValue(value);
  if (["low", "medium", "high", "critical"].includes(text)) return text;
  return "medium";
}

function normalizedTrade(value) {
  return keyValue(value) || "general";
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

function publicActivityRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    activityType: row.activity_type,
    fromValue: row.from_value || null,
    toValue: row.to_value || null,
    note: compactText(row.note),
    createdBy: row.created_by || null,
    createdAt: row.created_at,
  };
}

function activityRowsForObservation(activityByObservationId, observationId) {
  return activityByObservationId.get(observationId) || [];
}

function rowTitle(...values) {
  return values.map(compactText).find(Boolean) || "Flagged observation";
}

function publicObservationRow({
  observation,
  update,
  activity,
  canAddNote,
  shot,
  org,
  property,
  session,
  reportPackage,
  previewUrl,
}) {
  const status = normalizedStatus(update?.status || observation.status || shot?.issue_status);
  const title = rowTitle(observation.title, update?.message, shot?.reason, observation.detail);
  return {
    id: `observation:${observation.id}`,
    source: "observation",
    observationId: observation.id,
    issueId: shot?.issue_id || null,
    org,
    property,
    session,
    shotId: shot?.id || observation.shot_id || null,
    packageId: reportPackage?.id || null,
    status,
    priority: normalizedPriority(observation.priority || update?.priority || shot?.priority),
    trade: normalizedTrade(observation.trade || update?.trade || shot?.trade),
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
      canAddNote: Boolean(canAddNote),
    },
  };
}

function publicShotRow({ shot, org, property, session, reportPackage, previewUrl }) {
  const status = normalizedStatus(shot.issue_status);
  const title = rowTitle(shot.reason);
  return {
    id: `shot:${shot.id}`,
    source: "flagged_shot",
    observationId: null,
    issueId: shot.issue_id || null,
    org,
    property,
    session,
    shotId: shot.id,
    packageId: reportPackage?.id || null,
    status,
    priority: normalizedPriority(shot.priority),
    trade: normalizedTrade(shot.trade),
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
      canAddNote: false,
    },
  };
}

async function loadFieldMembership(auth, orgId) {
  const { data, error } = await auth.client
    .from("org_memberships")
    .select("id,role,access_scope,deleted_at")
    .eq("org_id", orgId)
    .eq("user_id", auth.user.id)
    .eq("role", "field")
    .is("deleted_at", null);

  if (error) return null;
  return (data || []).find((row) => (row.access_scope || "org") === "org") || null;
}

async function editableOrgIdSet(auth, orgIds) {
  const ids = unique(orgIds).filter(Boolean);
  if (ids.length === 0) return new Set();
  if (isApprovedAdminEmail(auth.user?.email)) return new Set(ids);

  const { data, error } = await auth.client
    .from("org_memberships")
    .select("org_id,role,access_scope,deleted_at")
    .in("org_id", ids)
    .eq("user_id", auth.user.id)
    .eq("role", "field")
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

async function handleAddNote(req, res) {
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const observationId = validateUuid(body.observationId);
  if (!observationId) {
    return sendJson(res, 400, { error: "Valid observation ID is required." });
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

    const { data: observation, error: observationError } = await auth.client
      .from("observations")
      .select(safeObservationSelect())
      .eq("id", observationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (observationError) {
      return sendJson(res, 500, { error: "Unable to load punch list item." });
    }
    if (!observation) {
      return sendJson(res, 404, { error: "Punch list item not found." });
    }

    const adminAllowed = isApprovedAdminEmail(auth.user?.email);
    const fieldMembership = adminAllowed ? true : await loadFieldMembership(auth, observation.org_id);
    if (!adminAllowed && !fieldMembership) {
      return sendJson(res, 403, { error: "Field User access is required to add notes." });
    }

    const service = createServiceClient();
    await ensureUserProfile(service, auth.user, auth.user.id);

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
      activity: publicActivityRow(activity),
      observationId: observation.id,
    });
  } catch {
    return sendJson(res, 500, { error: "Unable to add note." });
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

    const [{ data: orgRows }, { data: propertyRows }] = await Promise.all([
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
    ]);

    return sendJson(res, 200, {
      orgs: (orgRows || []).map(toOrg),
      properties: (propertyRows || []).map(toProperty),
    });
  } catch {
    return sendJson(res, 500, { error: "Unable to load punch list filters." });
  }
}

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST", "OPTIONS"])) return;

  if (req.method === "POST") {
    return handleAddNote(req, res);
  }

  if (getQueryValue(req, "mode") === "filters") {
    return handleFilters(req, res);
  }

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });

    const { client } = auth;
    const scope = {
      orgId: scopeId(req, "orgId"),
      propertyId: scopeId(req, "propertyId"),
    };
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
    const latestUpdateByObservationId = new Map();
    for (const update of observationUpdates) {
      if (!latestUpdateByObservationId.has(update.observation_id)) {
        latestUpdateByObservationId.set(update.observation_id, update);
      }
    }
    const activityByObservationId = new Map();
    for (const activityRow of punchListActivity) {
      if (activityRow.activity_type !== "note_added") continue;
      const publicRow = publicActivityRow(activityRow);
      if (!publicRow?.note) continue;
      const rows = activityByObservationId.get(activityRow.observation_id) || [];
      rows.push(publicRow);
      activityByObservationId.set(activityRow.observation_id, rows);
    }
    const editableOrgIds = await editableOrgIdSet(auth, orgIds);

    const previewCache = new Map();
    async function previewForShot(shot) {
      if (!shot) return null;
      if (previewCache.has(shot.id)) return previewCache.get(shot.id);
      if (previewCache.size >= MAX_PREVIEW_URLS) return null;
      const previewUrl = await signedPreviewUrlForPhoto(service, shot);
      previewCache.set(shot.id, previewUrl);
      return previewUrl;
    }

    const rows = [];
    const dedupKeys = new Set();
    for (const observation of observations) {
      const shot = observation.shot_id ? shotsById.get(observation.shot_id) : null;
      const reportPackage = packageBySession.get(observation.session_id) || null;
      const row = publicObservationRow({
        observation,
        update: latestUpdateByObservationId.get(observation.id) || null,
        activity: activityRowsForObservation(activityByObservationId, observation.id),
        canAddNote: editableOrgIds.has(observation.org_id),
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

    const candidateShots = [];
    for (const reportPackage of packageRows) {
      const sessionShots = shotsBySession.get(reportPackage.session_id) || [];
      candidateShots.push(...sortPhotoRowsBySnapshot(sessionShots));
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
      });
      addDedupKeys(dedupKeys, row);
      rows.push(row);
      if (rows.length >= MAX_ROWS) break;
    }

    rows.sort(compareFieldReviewOrder);

    return sendJson(res, 200, { rows: rows.slice(0, MAX_ROWS) });
  } catch {
    return sendJson(res, 500, { error: "Unable to load punch list." });
  }
}
