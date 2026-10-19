import {
  authenticateRequest,
  createServiceClient,
  getQueryValue,
  loadUserPortalPropertyAccess,
  methodAllowed,
  sendJson,
} from "./_reportPortalShared.js";
import { readJsonBody, validateUuid } from "./_portalAdminShared.js";
import {
  canEditClientDetails,
  canReadClientDetails,
  publicClientProperty,
  validateClientContact,
} from "../api-lib/clientDetails.js";

const PROPERTY_SELECT = "id,org_id,name,address_line1,address_line2,city,state,postal_code,client_name,client_email,client_phone,revision";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return methodAllowed(req, res, ["GET", "PATCH", "OPTIONS"]);
  if (!methodAllowed(req, res, ["GET", "PATCH", "OPTIONS"])) return;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });
    const service = createServiceClient();
    const access = await loadUserPortalPropertyAccess(service, auth.user);

    if (req.method === "GET") {
      const orgId = validateUuid(getQueryValue(req, "orgId"));
      if (!orgId) return sendJson(res, 400, { error: "Valid organization ID is required." });
      if (!access.isApprovedAdmin && !access.rows.some((row) => row.org_id === orgId)) {
        return sendJson(res, 403, { error: "Organization access required." });
      }
      const { data, error } = await service.from("properties")
        .select(PROPERTY_SELECT)
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return sendJson(res, 200, {
        properties: (data || [])
          .filter((row) => canReadClientDetails(access, row.org_id, row.id))
          .map((row) => publicClientProperty(
            row,
            canEditClientDetails(access, row.org_id, row.id)
          )),
      });
    }

    const body = await readJsonBody(req);
    const propertyId = validateUuid(body.propertyId);
    const revision = body.revision;
    if (!propertyId || !Number.isSafeInteger(revision) || revision < 1) {
      return sendJson(res, 400, { error: "Valid property and revision are required." });
    }
    const contact = validateClientContact(body);
    if (contact.error) return sendJson(res, 400, { error: contact.error });

    const { data: property, error: readError } = await service.from("properties")
      .select(PROPERTY_SELECT)
      .eq("id", propertyId)
      .is("deleted_at", null)
      .maybeSingle();
    if (readError) throw readError;
    if (!property || !canEditClientDetails(access, property.org_id, property.id)) {
      return sendJson(res, 403, { error: "Contact editing is unavailable for this property." });
    }
    const { data: updated, error: updateError } = await service.from("properties")
      .update({
        client_email: contact.clientEmail,
        client_phone: contact.clientPhone,
        revision: revision + 1,
        updated_by: auth.user.id,
      })
      .eq("id", property.id)
      .eq("org_id", property.org_id)
      .eq("revision", revision)
      .is("deleted_at", null)
      .select(PROPERTY_SELECT)
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) {
      return sendJson(res, 409, { error: "These details changed elsewhere. Refresh and try again." });
    }
    return sendJson(res, 200, { property: publicClientProperty(updated, true) });
  } catch (error) {
    console.error("Client details request failed", error);
    return sendJson(res, 500, { error: "Unable to load or save client details." });
  }
}
