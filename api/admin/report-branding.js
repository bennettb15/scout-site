import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  loadOrg,
  readJsonBody,
  requirePortalAdmin,
  validateUuid,
} from "../_portalAdminShared.js";
import { sendJson } from "../_reportPortalShared.js";
import {
  MAX_REPORT_LOGO_BYTES,
  brandingEnabledForOrg,
  REPORT_BRANDING_BUCKET,
  validReportLogoPath,
} from "../../api-lib/reportBranding.js";

const MAX_SOURCE_BYTES = 3_000_000;
const SIGNED_PREVIEW_SECONDS = 3600;

function canManageBranding(context, orgId) {
  if (context.isPlatformAdmin) return true;
  return (context.managementMemberships || []).some((row) =>
    row.org_id === orgId &&
    (row.role === "owner" || (row.role === "manager" && row.access_scope === "org"))
  );
}

async function currentBranding(service, orgId) {
  const { data, error } = await service
    .from("org_report_branding")
    .select("logo_path,updated_at")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (data?.logo_path && !validReportLogoPath(orgId, data.logo_path)) {
    throw new Error("Invalid organization logo path.");
  }
  return data || null;
}

async function brandingResponse(service, orgId, branding) {
  if (!branding?.logo_path) return { orgId, logoUrl: null, updatedAt: null };
  const { data, error } = await service.storage
    .from(REPORT_BRANDING_BUCKET)
    .createSignedUrl(branding.logo_path, SIGNED_PREVIEW_SECONDS);
  if (error || !data?.signedUrl) throw error || new Error("Unable to preview logo.");
  return { orgId, logoUrl: data.signedUrl, updatedAt: branding.updated_at };
}

async function normalizedLogo(base64) {
  if (typeof base64 !== "string" || base64.length > Math.ceil(MAX_SOURCE_BYTES * 4 / 3) + 8 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw Object.assign(new Error("Choose a PNG, JPEG, or WebP logo under 3 MB."), { status: 400 });
  }
  const source = Buffer.from(base64, "base64");
  if (!source.length || source.length > MAX_SOURCE_BYTES) {
    throw Object.assign(new Error("Logo must be under 3 MB."), { status: 400 });
  }
  let png;
  try {
    const image = sharp(source, { limitInputPixels: 16_000_000, failOn: "error" });
    const meta = await image.metadata();
    if (!["png", "jpeg", "webp"].includes(meta.format) ||
        !meta.width || !meta.height || meta.width > 4096 || meta.height > 4096) {
      throw new Error("Unsupported logo dimensions or image format.");
    }
    png = await image.rotate().resize(1600, 600, {
      fit: "inside",
      withoutEnlargement: true,
    }).png({ compressionLevel: 9 }).toBuffer();
  } catch {
    throw Object.assign(new Error("Use a valid PNG, JPEG, or WebP logo up to 4096 pixels per side."), { status: 400 });
  }
  if (png.length > MAX_REPORT_LOGO_BYTES) {
    throw Object.assign(new Error("Processed logo is too large. Choose a simpler image."), { status: 400 });
  }
  return png;
}

export default async function handler(req, res) {
  const context = await requirePortalAdmin(req, res, ["GET", "POST", "DELETE", "OPTIONS"]);
  if (!context) return;

  let body = {};
  if (req.method !== "GET") {
    try {
      body = await readJsonBody(req);
    } catch {
      return sendJson(res, 400, { error: "Invalid JSON body." });
    }
  }
  const orgId = validateUuid(req.method === "GET" ? req.query?.orgId : body.orgId);
  if (!orgId) return sendJson(res, 400, { error: "Valid organization ID is required." });
  if (!brandingEnabledForOrg(orgId)) return sendJson(res, 404, { error: "Report branding is not enabled for this organization." });
  if (!canManageBranding(context, orgId)) return sendJson(res, 403, { error: "Organization owner or manager access required." });

  try {
    const org = await loadOrg(context.service, orgId);
    if (!org) return sendJson(res, 404, { error: "Organization not found." });
    const current = await currentBranding(context.service, orgId);
    if (req.method === "GET") {
      return sendJson(res, 200, await brandingResponse(context.service, orgId, current));
    }

    if (req.method === "DELETE") {
      if (current) {
        const { error } = await context.service.from("org_report_branding").delete().eq("org_id", orgId);
        if (error) throw error;
        await context.service.storage.from(REPORT_BRANDING_BUCKET).remove([current.logo_path]);
      }
      return sendJson(res, 200, { orgId, logoUrl: null, updatedAt: null });
    }

    const png = await normalizedLogo(body.logoBase64);
    const logoPath = `orgs/${orgId}/logos/${randomUUID()}.png`;
    const storage = context.service.storage.from(REPORT_BRANDING_BUCKET);
    const { error: uploadError } = await storage.upload(logoPath, png, {
      contentType: "image/png",
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data: updated, error: saveError } = await context.service
      .from("org_report_branding")
      .upsert({ org_id: orgId, logo_path: logoPath, updated_by: context.user.id }, { onConflict: "org_id" })
      .select("logo_path,updated_at")
      .single();
    if (saveError) {
      await storage.remove([logoPath]);
      throw saveError;
    }
    if (current?.logo_path) await storage.remove([current.logo_path]);
    return sendJson(res, 200, await brandingResponse(context.service, orgId, updated));
  } catch (error) {
    const missingSchema = error?.code === "42P01";
    return sendJson(res, error.status || (missingSchema ? 409 : 500), {
      error: missingSchema
        ? "Report branding is not installed yet. Run the database migration first."
        : error.status ? error.message : "Unable to update report logo.",
    });
  }
}
