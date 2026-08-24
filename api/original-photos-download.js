import { deflateRawSync } from "node:zlib";

import {
  ORIGINALS_BUCKET,
  authenticateRequest,
  createServiceClient,
  friendlyOriginalDownloadFilename,
  getQueryValue,
  methodAllowed,
  originalPathIsExpected,
  sendJson,
} from "./_reportPortalShared.js";

function parsePhotoIds(req) {
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

function dosTimestamp(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uniqueFilename(filename, used) {
  let candidate = filename;
  const extensionIndex = filename.lastIndexOf(".");
  const stem = extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
  const extension = extensionIndex > 0 ? filename.slice(extensionIndex) : "";
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${stem}_${suffix}${extension}`;
    suffix += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function sanitizeFilenamePart(value) {
  const text = String(value || "").trim();
  const cleaned = text.replace(/[\/\\:*?"<>|\x00-\x1F]+/g, " ");
  return cleaned.replace(/\s+/g, " ").trim();
}

function filenameDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "Unknown Date";
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.month}-${byType.day}-${byType.year}`;
}

function originalZipFilename(reportPackage, propertyRow) {
  const bits = [
    sanitizeFilenamePart(propertyRow?.name) || "ScoutCapture",
    sanitizeFilenamePart(propertyRow?.address_line1),
    "Original Photos",
    filenameDate(reportPackage.session_completed_at || reportPackage.completed_at || reportPackage.created_at),
  ].filter(Boolean);
  return `${bits.join(" - ")}.zip`;
}

function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosTime, dosDate } = dosTimestamp();

  for (const entry of entries) {
    const name = Buffer.from(entry.filename, "utf8");
    const data = Buffer.from(entry.data);
    const compressed = deflateRawSync(data);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ["GET", "OPTIONS"])) return;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });

    const packageId = getQueryValue(req, "packageId");
    const photoIds = parsePhotoIds(req);
    if (!packageId || photoIds.length < 2) {
      return sendJson(res, 400, { error: "Select at least two original photos." });
    }

    const { data: reportPackage, error: packageError } = await auth.client
      .from("report_packages")
      .select("id,org_id,property_id,session_id,status,session_completed_at,completed_at,created_at")
      .eq("id", packageId)
      .eq("status", "ready")
      .is("deleted_at", null)
      .maybeSingle();

    if (packageError) {
      return sendJson(res, 500, { error: "Unable to prepare original photos download." });
    }
    if (!reportPackage) {
      return sendJson(res, 404, { error: "Original photos not found." });
    }

    const { data: propertyRow, error: propertyError } = await auth.client
      .from("properties")
      .select("id,org_id,name,address_line1")
      .eq("id", reportPackage.property_id)
      .eq("org_id", reportPackage.org_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (propertyError) {
      return sendJson(res, 500, { error: "Unable to prepare original photos download." });
    }

    const { data: rows, error: shotsError } = await auth.client
      .from("shots")
      .select(
        "id,org_id,property_id,session_id,building,elevation,detail_type,angle_index,storage_bucket,storage_path,upload_state,deleted_at,position,captured_at"
      )
      .in("id", photoIds)
      .eq("org_id", reportPackage.org_id)
      .eq("property_id", reportPackage.property_id)
      .eq("session_id", reportPackage.session_id)
      .eq("storage_bucket", ORIGINALS_BUCKET)
      .eq("upload_state", "uploaded")
      .is("deleted_at", null)
      .not("storage_path", "is", null)
      .order("position", { ascending: true, nullsFirst: false })
      .order("captured_at", { ascending: true });

    if (shotsError) {
      return sendJson(res, 500, { error: "Unable to prepare original photos download." });
    }

    const found = new Set((rows || []).map((row) => String(row.id).toLowerCase()));
    if (
      found.size !== photoIds.length ||
      photoIds.some((id) => !found.has(id)) ||
      rows.some((row) => !originalPathIsExpected(row))
    ) {
      return sendJson(res, 404, { error: "Original photos not found." });
    }

    const service = createServiceClient();
    const used = new Set();
    const entries = [];
    for (const row of rows) {
      const { data, error } = await service.storage.from(ORIGINALS_BUCKET).download(row.storage_path);
      if (error || !data) {
        return sendJson(res, 500, { error: "Unable to prepare original photos download." });
      }
      entries.push({
        filename: uniqueFilename(friendlyOriginalDownloadFilename(row), used),
        data: Buffer.from(await data.arrayBuffer()),
      });
    }

    const buffer = buildZip(entries);
    const filename = originalZipFilename(reportPackage, propertyRow);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).end(buffer);
  } catch {
    return sendJson(res, 500, { error: "Unable to prepare original photos download." });
  }
}
