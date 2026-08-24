import {
  DELIVERABLES_BUCKET,
  authenticateRequest,
  createServiceClient,
  expectedStampedZipPath,
  getQueryValue,
  methodAllowed,
  sendJson,
} from "./_reportPortalShared.js";

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ["GET", "OPTIONS"])) return;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });

    const exportId = getQueryValue(req, "exportId");
    if (!exportId) {
      return sendJson(res, 400, { error: "Missing export id." });
    }

    const { data: exportRow, error } = await auth.client
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
    if (
      !exportRow ||
      exportRow.status !== "ready" ||
      !exportRow.expires_at ||
      new Date(exportRow.expires_at).getTime() <= Date.now() ||
      exportRow.storage_bucket !== DELIVERABLES_BUCKET ||
      exportRow.mime_type !== "application/zip" ||
      exportRow.storage_path !== expectedStampedZipPath(exportRow)
    ) {
      return sendJson(res, 404, { error: "Stamped export not found." });
    }

    const service = createServiceClient();
    const { data, error: downloadError } = await service.storage
      .from(DELIVERABLES_BUCKET)
      .download(exportRow.storage_path);

    if (downloadError || !data) {
      return sendJson(res, 500, { error: "Unable to prepare export download." });
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    if (
      buffer.length < 4 ||
      buffer[0] !== 0x50 ||
      buffer[1] !== 0x4b ||
      buffer[2] !== 0x03 ||
      buffer[3] !== 0x04
    ) {
      return sendJson(res, 500, { error: "Unable to prepare export download." });
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${exportRow.filename}"`);
    res.setHeader("Content-Length", String(buffer.length));
    return res.status(200).end(buffer);
  } catch {
    return sendJson(res, 500, { error: "Unable to prepare export download." });
  }
}
