import {
  ORIGINALS_BUCKET,
  authenticateRequest,
  createServiceClient,
  loadUserPortalPropertyAccess,
  loadSnapshotPhotoMetadata,
  methodAllowed,
  originalPathIsExpected,
  publicReportTypeLabel,
  sendJson,
} from "./_reportPortalShared.js";
import {
  allowedPropertyIdsForPortalAccess,
} from "../api-lib/portalPropertyAccess.js";
import {
  actorIdsFromVisibleAttributionRows,
  capturedByEmailForReportPackage,
  profileEmailMap,
  reportPackageActorId,
  reportSessionActorId,
} from "../api-lib/auditAttribution.js";

const REPORT_PACKAGE_BASE_SELECT =
  "id,org_id,property_id,session_id,snapshot_id,status,session_completed_at,completed_at,weather_summary";
const REPORT_OPTIONAL_AUDIT_COLUMNS = [
  "completed_by",
  "completed_by_user_id",
  "completed_by_email",
  "uploaded_by",
  "uploaded_by_user_id",
  "uploaded_by_email",
  "captured_by_email",
  "created_by",
  "created_by_user_id",
  "created_by_email",
  "user_id",
  "user_email",
  "account_email",
];

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

function toOrg(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function requestMode(req) {
  if (typeof req.query?.mode === "string") return req.query.mode;
  try {
    return new URL(req.url || "", "https://scout.local").searchParams.get("mode") || "";
  } catch {
    return "";
  }
}

function idsMatch(left, right) {
  return String(left || "").toLowerCase() === String(right || "").toLowerCase();
}

function shotBelongsToPackage(shotRow, packageRow) {
  return (
    idsMatch(shotRow.org_id, packageRow.org_id) &&
    idsMatch(shotRow.session_id, packageRow.session_id) &&
    (!shotRow.property_id || idsMatch(shotRow.property_id, packageRow.property_id))
  );
}

async function loadReadyPackageRows(service) {
  const { data, error } = await service
    .from("report_packages")
    .select(REPORT_PACKAGE_BASE_SELECT)
    .eq("status", "ready")
    .is("deleted_at", null)
    .order("session_completed_at", { ascending: false })
    .limit(500);
  if (error) return { data, error };
  const rows = data || [];
  await mergeOptionalColumns(service, "report_packages", rows, REPORT_OPTIONAL_AUDIT_COLUMNS);
  return { data: rows, error: null };
}

async function loadProfileEmailMap(service, userIds) {
  const ids = unique(userIds);
  if (ids.length === 0) return new Map();
  try {
    const { data, error } = await service
      .from("users_profile")
      .select("id,email,deleted_at")
      .in("id", ids)
      .is("deleted_at", null);
    if (error) return new Map();
    return profileEmailMap(data || []);
  } catch {
    return new Map();
  }
}

async function mergeOptionalColumns(service, table, rows, columns) {
  const ids = unique(rows.map((row) => row.id));
  if (!service || ids.length === 0) return rows;
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const column of columns) {
    try {
      const { data, error } = await service
        .from(table)
        .select(`id,${column}`)
        .in("id", ids);
      if (error) continue;
      for (const row of data || []) {
        if (byId.has(row.id) && Object.prototype.hasOwnProperty.call(row, column)) {
          byId.get(row.id)[column] = row[column];
        }
      }
    } catch {
      // Optional audit columns vary across environments; absence must not block Reports.
    }
  }
  return rows;
}

async function handleReportOrgs(req, res) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });

    const service = createServiceClient();
    const portalAccess = await loadUserPortalPropertyAccess(service, auth.user);
    const [{ data, error }, { data: propertyRows, error: propertiesError }] = await Promise.all([
      service
        .from("orgs")
        .select("id,name")
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      service
        .from("properties")
        .select("id,org_id,name,address_line1,city,state,postal_code")
        .is("deleted_at", null)
        .order("name", { ascending: true }),
    ]);

    if (error || propertiesError) {
      return sendJson(res, 500, { error: "Unable to load organizations." });
    }

    const orgRows = portalAccess.orgWideOrgIds === null
      ? data || []
      : (data || []).filter(
          (row) =>
            portalAccess.orgWideOrgIds.has(row.id) ||
            portalAccess.rows.some((access) => access.org_id === row.id)
        );
    const currentPropertyIdsByOrg = new Map();
    for (const property of propertyRows || []) {
      const rows = currentPropertyIdsByOrg.get(property.org_id) || [];
      rows.push(property.id);
      currentPropertyIdsByOrg.set(property.org_id, rows);
    }
    const allowedPropertyIdsByOrg = new Map();
    for (const row of orgRows) {
      allowedPropertyIdsByOrg.set(
        row.id,
        allowedPropertyIdsForPortalAccess(
          portalAccess,
          row.id,
          currentPropertyIdsByOrg.get(row.id) || []
        )
      );
    }
    const propertiesByOrgId = new Map();
    for (const property of propertyRows || []) {
      const allowedPropertyIds = allowedPropertyIdsByOrg.get(property.org_id) || new Set();
      if (!allowedPropertyIds.has(property.id)) continue;
      const rows = propertiesByOrgId.get(property.org_id) || [];
      rows.push(toProperty(property));
      propertiesByOrgId.set(property.org_id, rows);
    }

    return sendJson(res, 200, {
      orgs: orgRows.map((row) => ({
        id: row.id,
        name: row.name,
        properties: propertiesByOrgId.get(row.id) || [],
      })),
    });
  } catch {
    return sendJson(res, 500, { error: "Unable to load organizations." });
  }
}

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ["GET", "OPTIONS"])) return;
  if (requestMode(req) === "orgs") return handleReportOrgs(req, res);

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });

    const service = createServiceClient();
    const portalAccess = await loadUserPortalPropertyAccess(service, auth.user);
    const { data: rawPackageRows, error: packagesError } = await loadReadyPackageRows(service);

    if (packagesError) {
      return sendJson(res, 500, { error: "Unable to load report packages." });
    }
    const candidatePropertyIds = unique((rawPackageRows || []).map((row) => row.property_id));
    const { data: propertyRows, error: propertiesError } = candidatePropertyIds.length
      ? await service
          .from("properties")
          .select("id,org_id,name,address_line1,city,state,postal_code")
          .in("id", candidatePropertyIds)
          .is("deleted_at", null)
      : { data: [], error: null };

    if (propertiesError) {
      return sendJson(res, 500, { error: "Unable to load report context." });
    }

    const currentPropertyIdsByOrg = new Map();
    for (const property of propertyRows || []) {
      const rows = currentPropertyIdsByOrg.get(property.org_id) || [];
      rows.push(property.id);
      currentPropertyIdsByOrg.set(property.org_id, rows);
    }
    const allowedPropertyIdsByOrg = new Map();

    const packageRows = (rawPackageRows || [])
      .filter((row) => {
        if (!allowedPropertyIdsByOrg.has(row.org_id)) {
          allowedPropertyIdsByOrg.set(
            row.org_id,
            allowedPropertyIdsForPortalAccess(
              portalAccess,
              row.org_id,
              currentPropertyIdsByOrg.get(row.org_id) || []
            )
          );
        }
        return allowedPropertyIdsByOrg.get(row.org_id).has(row.property_id);
      })
      .slice(0, 50);

    const packageIds = packageRows.map((row) => row.id);
    if (packageIds.length === 0) {
      return sendJson(res, 200, { packages: [] });
    }

    const { data: fileRows, error: filesError } = await service
      .from("report_package_files")
      .select(
        "id,package_id,report_type,filename,mime_type,byte_size,page_count,created_at"
      )
      .in("package_id", packageIds)
      .eq("mime_type", "application/pdf")
      .is("deleted_at", null)
      .is("storage_deleted_at", null)
      .order("report_type", { ascending: true });

    if (filesError) {
      return sendJson(res, 500, { error: "Unable to load report files." });
    }

    const sessionIds = unique(packageRows.map((row) => row.session_id));
    const orgIds = unique(packageRows.map((row) => row.org_id));

    const [
      { data: orgRows, error: orgsError },
      { data: sessionRows, error: sessionsError },
      { data: exportRows, error: exportsError },
      { data: shotRows, error: shotsError },
    ] =
      await Promise.all([
        service
          .from("orgs")
          .select("id,name")
          .in("id", orgIds)
          .is("deleted_at", null),
        service
          .from("sessions")
          .select("id,title,started_at,completed_at")
          .in("id", sessionIds)
          .is("deleted_at", null),
        service
          .from("temporary_exports")
          .select("id,org_id,property_id,session_id,snapshot_id,status,filename,byte_size,expires_at,created_at")
          .eq("artifact_type", "stamped_jpg_zip")
          .like("cache_key", "stamped-jpg-zip:%")
          .in("session_id", sessionIds)
          .is("deleted_at", null)
          .order("requested_at", { ascending: false }),
        service
          .from("shots")
          .select("id,org_id,property_id,session_id,storage_path")
          .in("session_id", sessionIds)
          .eq("storage_bucket", ORIGINALS_BUCKET)
          .eq("upload_state", "uploaded")
          .is("deleted_at", null)
          .not("storage_path", "is", null),
      ]);

    if (orgsError || sessionsError || exportsError || shotsError) {
      return sendJson(res, 500, { error: "Unable to load report context." });
    }
    await mergeOptionalColumns(service, "sessions", sessionRows || [], REPORT_OPTIONAL_AUDIT_COLUMNS);

    const orgsById = new Map(orgRows.map((row) => [row.id, toOrg(row)]));
    const propertiesById = new Map(propertyRows.map((row) => [row.id, toProperty(row)]));
    const sessionsById = new Map(sessionRows.map((row) => [row.id, toSession(row)]));
    const profileEmailById = await loadProfileEmailMap(
      service,
      actorIdsFromVisibleAttributionRows([
        ...packageRows.map((row) => ({ created_by: reportPackageActorId(row) })),
        ...(sessionRows || []).map((row) => ({ created_by: reportSessionActorId(row) })),
      ])
    );
    const snapshotMetadataByPackageId = new Map();
    for (const packageRow of packageRows) {
      const metadata = await loadSnapshotPhotoMetadata(service, packageRow);
      if (metadata) snapshotMetadataByPackageId.set(packageRow.id, metadata);
    }
    const photoCountsByPackageId = new Map(packageRows.map((row) => [row.id, 0]));
    const safeShotRows = (shotRows || []).filter(originalPathIsExpected);
    for (const packageRow of packageRows) {
      photoCountsByPackageId.set(
        packageRow.id,
        safeShotRows.filter((shotRow) => shotBelongsToPackage(shotRow, packageRow)).length
      );
    }
    const filesByPackageId = new Map();
    for (const row of fileRows) {
      const files = filesByPackageId.get(row.package_id) || [];
      files.push({
        id: row.id,
        reportType: row.report_type,
        label: publicReportTypeLabel(row.report_type),
        filename: row.filename,
        byteSize: row.byte_size,
        pageCount: row.page_count,
        createdAt: row.created_at,
      });
      filesByPackageId.set(row.package_id, files);
    }
    const exportByPackageKey = new Map();
    for (const row of exportRows) {
      const key = `${row.org_id}:${row.property_id}:${row.session_id}:${row.snapshot_id}`;
      if (!exportByPackageKey.has(key)) {
        const expired = row.expires_at ? new Date(row.expires_at).getTime() <= Date.now() : false;
        exportByPackageKey.set(key, {
          id: row.id,
          status: expired && row.status === "ready" ? "expired" : row.status,
          filename: row.filename,
          byteSize: row.byte_size,
          expiresAt: row.expires_at,
          createdAt: row.created_at,
        });
      }
    }

    const packages = packageRows.map((row) => {
      const snapshotMetadata = snapshotMetadataByPackageId.get(row.id) || null;
      const sessionRow = sessionRows.find((item) => item.id === row.session_id) || null;
      return {
        id: row.id,
        status: row.status,
        org: orgsById.get(row.org_id) || null,
        property: propertiesById.get(row.property_id) || null,
        session: sessionsById.get(row.session_id) || null,
        sessionCompletedAt: row.session_completed_at,
        completedAt: row.completed_at,
        weatherSummary: row.weather_summary,
        capturedByEmail: capturedByEmailForReportPackage({
          packageRow: row,
          sessionRow,
          snapshotMetadata,
          profileEmailById,
        }),
        originalPhotoCount: photoCountsByPackageId.get(row.id) || 0,
        files: filesByPackageId.get(row.id) || [],
        stampedExport:
          exportByPackageKey.get(`${row.org_id}:${row.property_id}:${row.session_id}:${row.snapshot_id}`) ||
          null,
      };
    });

    return sendJson(res, 200, { packages });
  } catch {
    return sendJson(res, 500, { error: "Unable to load report packages." });
  }
}
