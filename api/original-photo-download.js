import {
  ORIGINALS_BUCKET,
  SIGNED_URL_SECONDS,
  authenticateRequest,
  createServiceClient,
  friendlyOriginalDownloadFilename,
  getQueryValue,
  methodAllowed,
  originalPathIsExpected,
  sendJson,
} from "./_reportPortalShared.js";

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ["GET", "OPTIONS"])) return;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });

    const packageId = getQueryValue(req, "packageId");
    const photoId = getQueryValue(req, "photoId");
    if (!packageId || !photoId) {
      return sendJson(res, 400, { error: "Missing photo id." });
    }

    const { data: reportPackage, error: packageError } = await auth.client
      .from("report_packages")
      .select("id,org_id,property_id,session_id,status")
      .eq("id", packageId)
      .eq("status", "ready")
      .is("deleted_at", null)
      .maybeSingle();

    if (packageError) {
      return sendJson(res, 500, { error: "Unable to prepare photo download." });
    }
    if (!reportPackage) {
      return sendJson(res, 404, { error: "Original photo not found." });
    }

    const { data: shotRow, error: shotError } = await auth.client
      .from("shots")
      .select(
        "id,org_id,property_id,session_id,building,elevation,detail_type,angle_index,storage_bucket,storage_path,upload_state,deleted_at"
      )
      .eq("id", photoId)
      .eq("org_id", reportPackage.org_id)
      .eq("property_id", reportPackage.property_id)
      .eq("session_id", reportPackage.session_id)
      .eq("storage_bucket", ORIGINALS_BUCKET)
      .eq("upload_state", "uploaded")
      .is("deleted_at", null)
      .maybeSingle();

    if (shotError) {
      return sendJson(res, 500, { error: "Unable to prepare photo download." });
    }
    if (!shotRow || !originalPathIsExpected(shotRow)) {
      return sendJson(res, 404, { error: "Original photo not found." });
    }

    const filename = friendlyOriginalDownloadFilename(shotRow);
    const service = createServiceClient();
    const { data, error } = await service.storage
      .from(ORIGINALS_BUCKET)
      .createSignedUrl(shotRow.storage_path, SIGNED_URL_SECONDS, {
        download: filename,
      });

    if (error || !data?.signedUrl) {
      return sendJson(res, 500, { error: "Unable to prepare photo download." });
    }

    return sendJson(res, 200, {
      downloadUrl: data.signedUrl,
      expiresInSeconds: SIGNED_URL_SECONDS,
      filename,
    });
  } catch {
    return sendJson(res, 500, { error: "Unable to prepare photo download." });
  }
}
