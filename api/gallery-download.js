import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  ORIGINALS_BUCKET,
  authenticateRequest,
  createServiceClient,
  enrichPhotoRowWithSnapshotMetadata,
  friendlyOriginalDownloadFilename,
  loadSnapshotPhotoMetadata,
  loadUserPortalPropertyAccess,
  methodAllowed,
  originalPathIsExpected,
  sendJson,
} from "./_reportPortalShared.js";
import { buildZip, uniqueFilename } from "./original-photos-download.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PHOTOS = 250;

export function normalizeGallerySelection(body) {
  const propertyId = String(body?.propertyId || "").trim();
  const raw = body?.photos;
  if (!UUID.test(propertyId) || !Array.isArray(raw) || raw.length < 1 || raw.length > MAX_PHOTOS) return null;
  const seen = new Set();
  const photos = [];
  for (const item of raw) {
    const packageId = String(item?.packageId || "").trim();
    const photoId = String(item?.photoId || "").trim();
    if (!UUID.test(packageId) || !UUID.test(photoId)) return null;
    const key = `${packageId}:${photoId}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    photos.push({ packageId, photoId });
  }
  return photos.length ? { propertyId, photos } : null;
}

function filenameDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "Undated";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function safeFilename(value) {
  return String(value || "").replace(/[\/\\:*?"<>|\x00-\x1F]+/g, " ").replace(/\s+/g, " ").trim();
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { methodAllowed(req, res, ["POST", "OPTIONS"]); return; }
  if (!methodAllowed(req, res, ["POST", "OPTIONS"])) return;
  let selection;
  try {
    selection = normalizeGallerySelection(typeof req.body === "string" ? JSON.parse(req.body) : req.body);
  } catch {
    selection = null;
  }
  if (!selection) return sendJson(res, 400, { error: `Select 1 to ${MAX_PHOTOS} photos from one property.` });

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });
    const service = createServiceClient();
    const access = await loadUserPortalPropertyAccess(service, auth.user);
    const { data: property, error: propertyError } = await service
      .from("properties")
      .select("id,org_id,name")
      .eq("id", selection.propertyId)
      .is("deleted_at", null)
      .maybeSingle();
    if (propertyError) return sendJson(res, 500, { error: "Unable to prepare gallery download." });
    if (!property || !access.canAccessProperty(property.org_id, property.id)) {
      return sendJson(res, 404, { error: "Property not found." });
    }

    const packageIds = [...new Set(selection.photos.map((item) => item.packageId))];
    const { data: packageRows, error: packagesError } = await service
      .from("report_packages")
      .select("id,org_id,property_id,session_id,snapshot_id,status")
      .in("id", packageIds)
      .eq("org_id", property.org_id)
      .eq("property_id", property.id)
      .eq("status", "ready")
      .is("deleted_at", null);
    if (packagesError) return sendJson(res, 500, { error: "Unable to prepare gallery download." });
    const packagesById = new Map((packageRows || []).map((row) => [row.id, row]));
    if (packagesById.size !== packageIds.length) return sendJson(res, 404, { error: "Selected report not found." });

    const photoIds = [...new Set(selection.photos.map((item) => item.photoId))];
    const { data: shotRows, error: shotsError } = await service
      .from("shots")
      .select("id,org_id,property_id,session_id,building,elevation,detail_type,angle_index,shot_key,storage_bucket,storage_path,upload_state,deleted_at,captured_at,is_flagged,reason,priority")
      .in("id", photoIds)
      .eq("org_id", property.org_id)
      .eq("storage_bucket", ORIGINALS_BUCKET)
      .eq("upload_state", "uploaded")
      .is("deleted_at", null)
      .not("storage_path", "is", null);
    if (shotsError) return sendJson(res, 500, { error: "Unable to prepare gallery download." });
    const shotsById = new Map((shotRows || []).map((row) => [row.id, row]));
    if (shotsById.size !== photoIds.length) return sendJson(res, 404, { error: "Selected photo not found." });

    const snapshots = new Map();
    const entries = [];
    const usedNames = new Set();
    for (const item of selection.photos) {
      const reportPackage = packagesById.get(item.packageId);
      const shot = shotsById.get(item.photoId);
      if (!reportPackage || !shot || shot.session_id !== reportPackage.session_id ||
          (shot.property_id && shot.property_id !== property.id)) {
        return sendJson(res, 404, { error: "Selected photo not found." });
      }
      const safeShot = { ...shot, property_id: shot.property_id || property.id };
      if (!originalPathIsExpected(safeShot)) return sendJson(res, 404, { error: "Selected photo not found." });
      if (!snapshots.has(reportPackage.id)) snapshots.set(reportPackage.id, await loadSnapshotPhotoMetadata(service, reportPackage));
      const enrichedShot = enrichPhotoRowWithSnapshotMetadata(safeShot, snapshots.get(reportPackage.id));
      const filename = uniqueFilename(
        `${filenameDate(shot.captured_at)} - ${safeFilename(friendlyOriginalDownloadFilename(enrichedShot))}`,
        usedNames
      );
      const { data, error } = await service.storage.from(ORIGINALS_BUCKET).download(shot.storage_path);
      if (error || !data) return sendJson(res, 500, { error: "Unable to prepare gallery download." });
      entries.push({ filename, data: Buffer.from(await data.arrayBuffer()) });
    }

    const zip = buildZip(entries);
    const propertyName = safeFilename(property.name) || "Property";
    const downloadName = `${propertyName} - Gallery Photos.zip`.replace(/[^\x20-\x7E]/g, "_");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
    res.status(200);
    await pipeline(Readable.from((function* chunks() {
      for (let offset = 0; offset < zip.length; offset += 64 * 1024) {
        yield zip.subarray(offset, offset + 64 * 1024);
      }
    })()), res);
    return;
  } catch {
    return sendJson(res, 500, { error: "Unable to prepare gallery download." });
  }
}
