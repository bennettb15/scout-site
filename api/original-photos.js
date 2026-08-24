import {
  ORIGINALS_BUCKET,
  SIGNED_URL_SECONDS,
  authenticateRequest,
  createServiceClient,
  friendlyOriginalDownloadFilename,
  friendlyPhotoDisplayName,
  getQueryValue,
  methodAllowed,
  originalIsBrowserPreviewable,
  originalMimeType,
  originalPathIsExpected,
  sendJson,
} from "./_reportPortalShared.js";

function publicPhoto(row, previewUrl = null) {
  return {
    id: row.id,
    displayName: friendlyPhotoDisplayName(row),
    downloadFilename: friendlyOriginalDownloadFilename(row),
    capturedAt: row.captured_at,
    byteSize: row.byte_size,
    mimeType: originalMimeType(row),
    isFlagged: Boolean(row.is_flagged),
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    canPreviewInBrowser: Boolean(previewUrl),
    previewUrl,
    previewExpiresInSeconds: previewUrl ? SIGNED_URL_SECONDS : null,
  };
}

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ["GET", "OPTIONS"])) return;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });

    const packageId = getQueryValue(req, "packageId");
    if (!packageId) {
      return sendJson(res, 400, { error: "Missing package id." });
    }

    const { data: reportPackage, error: packageError } = await auth.client
      .from("report_packages")
      .select("id,org_id,property_id,session_id,status")
      .eq("id", packageId)
      .eq("status", "ready")
      .is("deleted_at", null)
      .maybeSingle();

    if (packageError) {
      return sendJson(res, 500, { error: "Unable to load original photos." });
    }
    if (!reportPackage) {
      return sendJson(res, 404, { error: "Report package not found." });
    }

    const { data: rows, error: shotsError } = await auth.client
      .from("shots")
      .select(
        "id,org_id,property_id,session_id,building,elevation,detail_type,angle_index,captured_at,position,storage_bucket,storage_path,byte_size,upload_state,is_flagged,image_width,image_height"
      )
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
      return sendJson(res, 500, { error: "Unable to load original photos." });
    }

    const safeRows = rows.filter(originalPathIsExpected);
    const service = createServiceClient();
    const photos = await Promise.all(
      safeRows.map(async (row) => {
        if (!originalIsBrowserPreviewable(row)) {
          return publicPhoto(row);
        }
        const { data } = await service.storage
          .from(ORIGINALS_BUCKET)
          .createSignedUrl(row.storage_path, SIGNED_URL_SECONDS);
        return publicPhoto(row, data?.signedUrl || null);
      })
    );

    return sendJson(res, 200, { photos });
  } catch {
    return sendJson(res, 500, { error: "Unable to load original photos." });
  }
}
