import { inflateRawSync } from "node:zlib";

import {
  DELIVERABLES_BUCKET,
  authenticateRequest,
  createServiceClient,
  friendlyOriginalDownloadFilename,
  getQueryValue,
  methodAllowed,
  sendJson,
} from "./_reportPortalShared.js";
import {
  loadReadyReportPackage,
  prepareStampedExportForPhotos,
  validateSelectedPhotoIds,
} from "./stamped-export.js";

function stampedFilenameFromOriginal(shotRow) {
  const originalName = friendlyOriginalDownloadFilename(shotRow);
  const stem = originalName.replace(/\.[^.]+$/, "");
  return `${stem}${shotRow.is_flagged ? "_Flagged" : ""}.jpg`;
}

function zipEntries(buffer) {
  const entries = [];
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const filenameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + filenameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if ((flags & 0x08) !== 0 || dataEnd > buffer.length) {
      throw new Error("Unsupported stamped ZIP format.");
    }
    const filename = buffer.slice(nameStart, nameStart + filenameLength).toString("utf8");
    const compressed = buffer.slice(dataStart, dataEnd);
    let data;
    if (method === 0) {
      data = compressed;
    } else if (method === 8) {
      data = inflateRawSync(compressed);
    } else {
      throw new Error("Unsupported stamped ZIP compression.");
    }
    entries.push({ filename, data });
    offset = dataEnd;
  }
  return entries;
}

function isJpeg(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  );
}

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ["GET", "OPTIONS"])) return;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });

    const packageId = getQueryValue(req, "packageId");
    const photoId = getQueryValue(req, "photoId").trim().toLowerCase();
    if (!packageId || !photoId) {
      return sendJson(res, 400, { error: "Missing photo id." });
    }

    const reportPackage = await loadReadyReportPackage(auth, packageId);
    await validateSelectedPhotoIds(auth, reportPackage, [photoId]);

    const { data: shotRow, error: shotError } = await auth.client
      .from("shots")
      .select(
        "id,org_id,property_id,session_id,building,elevation,detail_type,angle_index,is_flagged,storage_bucket,storage_path,upload_state,deleted_at"
      )
      .eq("id", photoId)
      .eq("org_id", reportPackage.org_id)
      .eq("property_id", reportPackage.property_id)
      .eq("session_id", reportPackage.session_id)
      .eq("storage_bucket", "scoutcapture-originals")
      .eq("upload_state", "uploaded")
      .is("deleted_at", null)
      .maybeSingle();
    if (shotError) {
      return sendJson(res, 500, { error: "Unable to prepare stamped photo download." });
    }
    if (!shotRow) {
      return sendJson(res, 404, { error: "Stamped photo not found." });
    }

    const exportRow = await prepareStampedExportForPhotos(auth, reportPackage, [photoId]);
    if (
      !exportRow ||
      exportRow.status !== "ready" ||
      exportRow.storage_bucket !== DELIVERABLES_BUCKET ||
      exportRow.mime_type !== "application/zip" ||
      !exportRow.storage_path
    ) {
      return sendJson(res, 404, { error: "Stamped photo not found." });
    }

    const service = createServiceClient();
    const { data, error } = await service.storage
      .from(DELIVERABLES_BUCKET)
      .download(exportRow.storage_path);
    if (error || !data) {
      return sendJson(res, 500, { error: "Unable to prepare stamped photo download." });
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const entries = zipEntries(buffer).filter((entry) => entry.filename.toLowerCase().endsWith(".jpg"));
    if (entries.length !== 1 || !isJpeg(entries[0].data)) {
      return sendJson(res, 500, { error: "Unable to prepare stamped photo download." });
    }

    const filename = entries[0].filename || stampedFilenameFromOriginal(shotRow);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(entries[0].data.length));
    res.status(200).end(entries[0].data);
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      error:
        error.statusCode === 404
          ? error.message
          : "Unable to prepare stamped photo download.",
    });
  }
}
