import {
  ORIGINALS_BUCKET,
  SIGNED_URL_SECONDS,
  authenticateRequest,
  createServiceClient,
  enrichPhotoRowWithSnapshotMetadata,
  friendlyOriginalDownloadFilename,
  getQueryValue,
  loadSnapshotPhotoMetadata,
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
      .select("id,org_id,property_id,session_id,snapshot_id,status")
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

    const service = createServiceClient();
    const { data: shotRow, error: shotError } = await service
      .from("shots")
      .select(
        "id,org_id,property_id,session_id,building,elevation,detail_type,angle_index,shot_key,storage_bucket,storage_path,upload_state,deleted_at,captured_at,is_flagged,reason,priority"
      )
      .eq("id", photoId)
      .eq("org_id", reportPackage.org_id)
      .eq("session_id", reportPackage.session_id)
      .or(`property_id.eq.${reportPackage.property_id},property_id.is.null`)
      .eq("storage_bucket", ORIGINALS_BUCKET)
      .eq("upload_state", "uploaded")
      .is("deleted_at", null)
      .maybeSingle();

    if (shotError) {
      return sendJson(res, 500, { error: "Unable to prepare photo download." });
    }
    const safeShotRow = shotRow
      ? { ...shotRow, property_id: shotRow.property_id || reportPackage.property_id }
      : null;
    if (!safeShotRow || !originalPathIsExpected(safeShotRow)) {
      return sendJson(res, 404, { error: "Original photo not found." });
    }

    const snapshotMetadata = await loadSnapshotPhotoMetadata(service, reportPackage);
    const enrichedShotRow = enrichPhotoRowWithSnapshotMetadata(safeShotRow, snapshotMetadata);
    const filename = friendlyOriginalDownloadFilename(enrichedShotRow);
    const { data, error } = await service.storage
      .from(ORIGINALS_BUCKET)
      .createSignedUrl(safeShotRow.storage_path, SIGNED_URL_SECONDS, {
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
