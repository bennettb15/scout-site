import {
  canManageCustomerLifecycle,
  lifecycleExpiry,
  lifecycleStatus,
  pilotEndFromSignature,
} from "../../api-lib/customerLifecycle.js";
import { adminEmailSet } from "../../api-lib/portalAdminAccess.js";
import { readJsonBody, validateUuid } from "../_portalAdminShared.js";
import {
  authenticateRequest,
  createServiceClient,
  methodAllowed,
  sendJson,
} from "../_reportPortalShared.js";

function parseDate(value, label) {
  if (value === null || value === undefined || value === "") return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) {
    throw Object.assign(new Error(`${label} must be a valid date and time.`), { status: 400 });
  }
  return new Date(time).toISOString();
}

function publicLifecycle(row) {
  return {
    orgId: row.org_id,
    pilotSignedAt: row.pilot_signed_at,
    pilotExpiresAt: row.pilot_expires_at,
    ongoingStartedAt: row.ongoing_started_at,
    ongoingExpiresAt: row.ongoing_expires_at,
    accessEndedAt: row.access_ended_at,
    internalNotes: row.internal_notes || "",
    updatedAt: row.updated_at,
    status: lifecycleStatus(row),
    effectiveExpiresAt: lifecycleExpiry(row),
  };
}

async function readAll(service) {
  const [{ data: orgs, error: orgError }, { data: lifecycles, error: lifecycleError }] =
    await Promise.all([
      service.from("orgs").select("id,name").is("deleted_at", null).order("name"),
      service.from("customer_lifecycle").select("*").order("updated_at", { ascending: false }),
    ]);
  if (orgError || lifecycleError) throw orgError || lifecycleError;
  const byOrg = new Map((lifecycles || []).map((row) => [row.org_id, row]));
  return (orgs || []).map((org) => ({
    id: org.id,
    name: org.name,
    lifecycle: byOrg.has(org.id) ? publicLifecycle(byOrg.get(org.id)) : null,
  }));
}

async function saveLifecycle(service, user, body) {
  const orgId = validateUuid(body.orgId);
  if (!orgId) throw Object.assign(new Error("A valid organization is required."), { status: 400 });
  const { data: org, error: orgError } = await service
    .from("orgs").select("id").eq("id", orgId).is("deleted_at", null).maybeSingle();
  if (orgError) throw orgError;
  if (!org) throw Object.assign(new Error("Organization not found."), { status: 404 });
  const { data: existing, error: existingError } = await service.from("customer_lifecycle")
    .select("access_ended_at").eq("org_id", orgId).maybeSingle();
  if (existingError) throw existingError;

  const pilotSignedAt = parseDate(body.pilotSignedAt, "Pilot signed date");
  const pilotExpiresAt = parseDate(body.pilotExpiresAt, "Pilot expiration")
    || (pilotSignedAt ? pilotEndFromSignature(pilotSignedAt) : null);
  const ongoingStartedAt = parseDate(body.ongoingStartedAt, "Ongoing start");
  const ongoingExpiresAt = parseDate(body.ongoingExpiresAt, "Ongoing expiration");
  const internalNotes = String(body.internalNotes || "").trim();
  if (internalNotes.length > 2000) {
    throw Object.assign(new Error("Internal notes must be under 2,000 characters."), { status: 400 });
  }
  if (Boolean(pilotSignedAt) !== Boolean(pilotExpiresAt) ||
      (pilotSignedAt && new Date(pilotExpiresAt) <= new Date(pilotSignedAt))) {
    throw Object.assign(new Error("Pilot expiration must be after the signed date."), { status: 400 });
  }
  if (Boolean(ongoingStartedAt) !== Boolean(ongoingExpiresAt) ||
      (ongoingStartedAt && new Date(ongoingExpiresAt) <= new Date(ongoingStartedAt))) {
    throw Object.assign(new Error("Ongoing start and expiration must both be set, with expiration later."), { status: 400 });
  }
  if (pilotExpiresAt && ongoingStartedAt && new Date(ongoingStartedAt) > new Date(pilotExpiresAt)) {
    throw Object.assign(new Error("Ongoing access must start by the pilot cutoff. Extend the pilot first if needed."), { status: 400 });
  }
  const proposed = {
    pilot_signed_at: pilotSignedAt,
    pilot_expires_at: pilotExpiresAt,
    ongoing_started_at: ongoingStartedAt,
    ongoing_expires_at: ongoingExpiresAt,
  };
  const effective = lifecycleExpiry(proposed);
  if (effective && new Date(effective) <= new Date() && body.confirmImmediateExpiration !== true) {
    throw Object.assign(new Error("This date has passed. Confirm that saving should end customer access."), { status: 409 });
  }
  const { error } = await service.from("customer_lifecycle").upsert({
    org_id: orgId,
    ...proposed,
    internal_notes: internalNotes,
    access_ended_at: existing?.access_ended_at || null,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  }, { onConflict: "org_id" });
  if (error) throw error;

  if (effective && new Date(effective) <= new Date()) {
    const { error: expireError } = await service.rpc("expire_due_customer_access", {
      trusted_admin_emails: [...adminEmailSet()],
    });
    if (expireError) throw expireError;
    const { error: retentionError } = await service.rpc("reconcile_org_retention_schedule", {
      trusted_admin_emails: [...adminEmailSet()],
    });
    if (retentionError) throw retentionError;
  }
  const { data: saved, error: savedError } = await service.from("customer_lifecycle")
    .select("*").eq("org_id", orgId).single();
  if (savedError) throw savedError;
  return publicLifecycle(saved);
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    methodAllowed(req, res, ["GET", "PATCH", "OPTIONS"]);
    return;
  }
  if (!methodAllowed(req, res, ["GET", "PATCH", "OPTIONS"])) return;
  res.setHeader("Cache-Control", "no-store");
  const auth = await authenticateRequest(req);
  if (auth.error) return sendJson(res, 401, { error: auth.error });
  if (!canManageCustomerLifecycle(auth.user.email)) {
    return sendJson(res, 403, { error: "Private customer access required." });
  }

  try {
    const service = createServiceClient();
    if (req.method === "GET") {
      return sendJson(res, 200, { organizations: await readAll(service) });
    }
    const body = await readJsonBody(req);
    const lifecycle = await saveLifecycle(service, auth.user, body);
    return sendJson(res, 200, { lifecycle });
  } catch (error) {
    return sendJson(res, error.status || 500, {
      error: error.status ? error.message : "Unable to load or save customer dates.",
    });
  }
}
