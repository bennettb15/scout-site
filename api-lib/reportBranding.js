export const REPORT_BRANDING_BUCKET = "scoutcapture-org-branding";
export const MAX_REPORT_LOGO_BYTES = 2_000_000;

export function brandingEnabledForOrg(orgId) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(orgId || ""));
}

export function validReportLogoPath(orgId, path) {
  return typeof path === "string" &&
    path.startsWith(`orgs/${orgId}/logos/`) &&
    /^orgs\/[0-9a-f-]+\/logos\/[0-9a-f-]+\.png$/i.test(path);
}

export async function loadReportLogo(service, orgId) {
  const { data, error } = await service
    .from("org_report_branding")
    .select("logo_path")
    .eq("org_id", orgId)
    .maybeSingle();
  // A website rollout before the additive migration must keep Scout reports working.
  if (error?.code === "42P01") return null;
  if (error) throw error;
  if (!data?.logo_path) return null;
  if (!validReportLogoPath(orgId, data.logo_path)) throw new Error("Invalid organization logo path.");

  const { data: file, error: downloadError } = await service.storage
    .from(REPORT_BRANDING_BUCKET)
    .download(data.logo_path);
  if (downloadError || !file) throw downloadError || new Error("Organization logo is unavailable.");
  const logo = Buffer.from(await file.arrayBuffer());
  if (logo.length > MAX_REPORT_LOGO_BYTES ||
      !logo.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error("Invalid organization logo asset.");
  }
  return logo;
}
