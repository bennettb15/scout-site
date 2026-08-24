import {
  DELIVERABLES_BUCKET,
  authenticateRequest,
  createServiceClient,
  getQueryValue,
  methodAllowed,
  sendJson,
} from "./_reportPortalShared.js";
import { isJpeg, zipEntries } from "./_zipUtils.js";
import {
  loadShotRowsForPhotoIds,
  loadReadyReportPackage,
  readyStampedExportForPackage,
  stampedFilenameFromShot,
} from "./stamped-export.js";

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
    const [shotRow] = await loadShotRowsForPhotoIds(auth, reportPackage, [photoId]);
    const service = createServiceClient();
    const exportRow = await readyStampedExportForPackage(service, reportPackage);
    if (
      !exportRow ||
      exportRow.status !== "ready" ||
      exportRow.storage_bucket !== DELIVERABLES_BUCKET ||
      exportRow.mime_type !== "application/zip" ||
      !exportRow.storage_path
    ) {
      return sendJson(res, 404, { error: "Stamped photos are not prepared yet." });
    }

    const { data, error } = await service.storage
      .from(DELIVERABLES_BUCKET)
      .download(exportRow.storage_path);
    if (error || !data) {
      return sendJson(res, 500, { error: "Unable to prepare stamped photo download." });
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const expectedFilename = stampedFilenameFromShot(shotRow);
    const entry = zipEntries(buffer).find(
      (candidate) => candidate.filename.toLowerCase() === expectedFilename.toLowerCase()
    );
    if (!entry || !isJpeg(entry.data)) {
      return sendJson(res, 500, { error: "Unable to prepare stamped photo download." });
    }

    const filename = entry.filename || expectedFilename;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(entry.data.length));
    res.status(200).end(entry.data);
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      error:
        error.statusCode === 404
          ? error.message
          : "Unable to prepare stamped photo download.",
    });
  }
}
