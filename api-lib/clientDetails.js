import { portalAccessCanUseRole } from "../api/_reportPortalShared.js";

export const CLIENT_DETAILS_EDIT_ROLES = ["owner", "manager"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function canReadClientDetails(access, orgId, propertyId) {
  return Boolean(access?.canAccessProperty?.(orgId, propertyId));
}

export function canEditClientDetails(access, orgId, propertyId) {
  return portalAccessCanUseRole(access, CLIENT_DETAILS_EDIT_ROLES, orgId, propertyId);
}

export function validateClientContact(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "A contact is required." };
  }
  if (typeof body.clientEmail !== "string" || typeof body.clientPhone !== "string") {
    return { error: "Email and phone must be text." };
  }
  const clientEmail = body.clientEmail.trim().toLowerCase();
  const clientPhone = body.clientPhone.trim();
  if (clientEmail.length > 254 || (clientEmail && !EMAIL_PATTERN.test(clientEmail))) {
    return { error: "Enter a valid email address." };
  }
  if (clientPhone.length > 40 || (clientPhone && !/^[+\d().\-\s xextEXT]+$/.test(clientPhone))) {
    return { error: "Enter a valid phone number." };
  }
  return { clientEmail: clientEmail || null, clientPhone: clientPhone || null };
}

export function publicClientProperty(row, canEdit) {
  return {
    id: row.id,
    orgId: row.org_id,
    propertyName: row.name,
    addressLine1: row.address_line1 || "",
    addressLine2: row.address_line2 || "",
    city: row.city || "",
    state: row.state || "",
    postalCode: row.postal_code || "",
    clientName: row.client_name || "",
    clientEmail: row.client_email || "",
    clientPhone: row.client_phone || "",
    revision: row.revision,
    canEdit,
  };
}
