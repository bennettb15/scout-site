import {
  authenticateRequest,
  createServiceClient,
  methodAllowed,
  publicReportTypeLabel,
  sendJson,
} from "./_reportPortalShared.js";

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

async function handleReportOrgs(req, res) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });

    const { data, error } = await auth.client
      .from("orgs")
      .select("id,name")
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (error) {
      return sendJson(res, 500, { error: "Unable to load organizations." });
    }

    return sendJson(res, 200, {
      orgs: (data || []).map((row) => ({
        id: row.id,
        name: row.name,
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

    const { client } = auth;
    const service = createServiceClient();
    const { data: packageRows, error: packagesError } = await client
      .from("report_packages")
      .select(
        "id,org_id,property_id,session_id,snapshot_id,status,session_completed_at,completed_at,weather_summary"
      )
      .eq("status", "ready")
      .is("deleted_at", null)
      .order("session_completed_at", { ascending: false })
      .limit(50);

    if (packagesError) {
      return sendJson(res, 500, { error: "Unable to load report packages." });
    }

    const packageIds = packageRows.map((row) => row.id);
    if (packageIds.length === 0) {
      return sendJson(res, 200, { packages: [] });
    }

    const { data: fileRows, error: filesError } = await client
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

    const propertyIds = unique(packageRows.map((row) => row.property_id));
    const sessionIds = unique(packageRows.map((row) => row.session_id));
    const orgIds = unique(packageRows.map((row) => row.org_id));

    const [
      { data: orgRows, error: orgsError },
      { data: propertyRows, error: propertiesError },
      { data: sessionRows, error: sessionsError },
      { data: exportRows, error: exportsError },
      { data: shotRows, error: shotsError },
    ] =
      await Promise.all([
        client
          .from("orgs")
          .select("id,name")
          .in("id", orgIds)
          .is("deleted_at", null),
        client
          .from("properties")
          .select("id,org_id,name,address_line1,city,state,postal_code")
          .in("id", propertyIds)
          .is("deleted_at", null),
        client
          .from("sessions")
          .select("id,title,started_at,completed_at")
          .in("id", sessionIds)
          .is("deleted_at", null),
        client
          .from("temporary_exports")
          .select("id,org_id,property_id,session_id,snapshot_id,status,filename,byte_size,expires_at,created_at")
          .eq("artifact_type", "stamped_jpg_zip")
          .like("cache_key", "stamped-jpg-zip:%")
          .in("session_id", sessionIds)
          .is("deleted_at", null)
          .order("requested_at", { ascending: false }),
        service
          .from("shots")
          .select("id,session_id")
          .in("session_id", sessionIds)
          .eq("storage_bucket", "scoutcapture-originals")
          .eq("upload_state", "uploaded")
          .is("deleted_at", null)
          .not("storage_path", "is", null),
      ]);

    if (orgsError || propertiesError || sessionsError || exportsError || shotsError) {
      return sendJson(res, 500, { error: "Unable to load report context." });
    }

    const orgsById = new Map(orgRows.map((row) => [row.id, toOrg(row)]));
    const propertiesById = new Map(propertyRows.map((row) => [row.id, toProperty(row)]));
    const sessionsById = new Map(sessionRows.map((row) => [row.id, toSession(row)]));
    const photoCountsBySessionId = new Map();
    for (const row of shotRows) {
      photoCountsBySessionId.set(
        row.session_id,
        (photoCountsBySessionId.get(row.session_id) || 0) + 1
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

    const packages = packageRows.map((row) => ({
      id: row.id,
      status: row.status,
      org: orgsById.get(row.org_id) || null,
      property: propertiesById.get(row.property_id) || null,
      session: sessionsById.get(row.session_id) || null,
      sessionCompletedAt: row.session_completed_at,
      completedAt: row.completed_at,
      weatherSummary: row.weather_summary,
      originalPhotoCount: photoCountsBySessionId.get(row.session_id) || 0,
      files: filesByPackageId.get(row.id) || [],
      stampedExport:
        exportByPackageKey.get(`${row.org_id}:${row.property_id}:${row.session_id}:${row.snapshot_id}`) ||
        null,
    }));

    return sendJson(res, 200, { packages });
  } catch {
    return sendJson(res, 500, { error: "Unable to load report packages." });
  }
}
