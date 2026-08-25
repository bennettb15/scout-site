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
