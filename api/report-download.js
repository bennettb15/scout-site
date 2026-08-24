import {
  DELIVERABLES_BUCKET,
  SIGNED_URL_SECONDS,
  authenticateRequest,
  createServiceClient,
  expectedPdfPath,
  getQueryValue,
  methodAllowed,
  sendJson,
} from "./_reportPortalShared.js";

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ["GET", "OPTIONS"])) return;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });

    const fileId = getQueryValue(req, "fileId");
    if (!fileId) {
      return sendJson(res, 400, { error: "Missing file id." });
    }

    const { client } = auth;
    const { data: fileRow, error: fileError } = await client
      .from("report_package_files")
      .select(
        "id,package_id,org_id,property_id,session_id,report_type,storage_bucket,storage_path,filename,mime_type,byte_size,page_count,storage_deleted_at"
      )
      .eq("id", fileId)
      .is("deleted_at", null)
      .maybeSingle();

    if (fileError) {
      return sendJson(res, 500, { error: "Unable to prepare download." });
    }
    if (!fileRow) {
      return sendJson(res, 404, { error: "Report file not found." });
    }

    const { data: packageRow, error: packageError } = await client
      .from("report_packages")
      .select("id,status")
      .eq("id", fileRow.package_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (packageError) {
      return sendJson(res, 500, { error: "Unable to prepare download." });
    }
    if (!packageRow || packageRow.status !== "ready") {
      return sendJson(res, 404, { error: "Report file not found." });
    }

    if (
      fileRow.storage_bucket !== DELIVERABLES_BUCKET ||
      fileRow.mime_type !== "application/pdf" ||
      fileRow.storage_deleted_at ||
      fileRow.storage_path !== expectedPdfPath(fileRow)
    ) {
      return sendJson(res, 404, { error: "Report file not found." });
    }

    const service = createServiceClient();
    const { data, error } = await service.storage
      .from(DELIVERABLES_BUCKET)
      .createSignedUrl(fileRow.storage_path, SIGNED_URL_SECONDS, {
        download: fileRow.filename,
      });

    if (error || !data?.signedUrl) {
      return sendJson(res, 500, { error: "Unable to prepare download." });
    }

    return sendJson(res, 200, {
      downloadUrl: data.signedUrl,
      expiresInSeconds: SIGNED_URL_SECONDS,
      filename: fileRow.filename,
    });
  } catch {
    return sendJson(res, 500, { error: "Unable to prepare download." });
  }
}
