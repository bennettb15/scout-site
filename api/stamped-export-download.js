import {
  DELIVERABLES_BUCKET,
  authenticateRequest,
  createServiceClient,
  expectedStampedZipPath,
  getQueryValue,
  methodAllowed,
  sendJson,
} from "./_reportPortalShared.js";
import { buildZip, isZip, zipEntries } from "./_zipUtils.js";
import {
  loadReadyReportPackage,
  loadShotRowsForPhotoIds,
  parsePhotoIds,
  readyStampedExportForPackage,
  stampedFilenameFromShot,
} from "./stamped-export.js";

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ["GET", "OPTIONS"])) return;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });

    const exportId = getQueryValue(req, "exportId");
    const packageId = getQueryValue(req, "packageId");
    const photoIds = parsePhotoIds(req);
    let exportRow = null;
    let reportPackage = null;

    if (packageId) {
      reportPackage = await loadReadyReportPackage(auth, packageId);
      const service = createServiceClient();
      exportRow = await readyStampedExportForPackage(service, reportPackage);
    } else if (exportId) {
      const { data, error } = await auth.client
        .from("temporary_exports")
        .select(
          "id,org_id,property_id,session_id,snapshot_id,status,storage_bucket,storage_path,filename,mime_type,expires_at,deleted_at"
        )
        .eq("id", exportId)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) {
        return sendJson(res, 500, { error: "Unable to prepare export download." });
      }
      exportRow = data;
    } else {
      return sendJson(res, 400, { error: "Missing export id." });
    }
    if (photoIds.length > 0 && !packageId) {
      return sendJson(res, 400, { error: "Missing package id." });
    }

    if (
      !exportRow ||
      exportRow.status !== "ready" ||
      !exportRow.expires_at ||
      new Date(exportRow.expires_at).getTime() <= Date.now() ||
      exportRow.storage_bucket !== DELIVERABLES_BUCKET ||
      exportRow.mime_type !== "application/zip" ||
      exportRow.storage_path !== expectedStampedZipPath(exportRow)
    ) {
      return sendJson(res, 404, { error: "Stamped photos are not prepared yet." });
    }

    const service = createServiceClient();
    const { data, error: downloadError } = await service.storage
      .from(DELIVERABLES_BUCKET)
      .download(exportRow.storage_path);

    if (downloadError || !data) {
      return sendJson(res, 500, { error: "Unable to prepare export download." });
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    if (!isZip(buffer)) {
      return sendJson(res, 500, { error: "Unable to prepare export download." });
    }

    let outputBuffer = buffer;
    if (photoIds.length > 0) {
      if (!reportPackage) {
        reportPackage = await loadReadyReportPackage(auth, packageId);
      }
      const shotRows = await loadShotRowsForPhotoIds(auth, reportPackage, photoIds);
      const expectedNames = new Set(
        shotRows.map((row) => stampedFilenameFromShot(row).toLowerCase())
      );
      const selectedEntries = zipEntries(buffer)
        .filter((entry) => expectedNames.has(entry.filename.toLowerCase()))
        .map((entry) => ({ filename: entry.filename, data: entry.data }));

      if (selectedEntries.length !== expectedNames.size) {
        return sendJson(res, 404, { error: "Stamped photos not found." });
      }
      outputBuffer = buildZip(selectedEntries);
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${exportRow.filename}"`);
    res.setHeader("Content-Length", String(outputBuffer.length));
    return res.status(200).end(outputBuffer);
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      error:
        error.statusCode === 404
          ? error.message
          : "Unable to prepare export download.",
    });
  }
}
