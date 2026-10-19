import assert from "node:assert/strict";
import test from "node:test";
import {
  canEditClientDetails,
  canReadClientDetails,
  publicClientProperty,
  validateClientContact,
} from "../api-lib/clientDetails.js";

const orgId = "11111111-1111-4111-8111-111111111111";
const allowedId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";

function accessFor(role) {
  return {
    isApprovedAdmin: false,
    rows: [{ org_id: orgId, role, access_scope: "property", propertyIds: [allowedId] }],
    canAccessProperty: (requestedOrgId, propertyId) => requestedOrgId === orgId && propertyId === allowedId,
  };
}

test("property scoped members only read their granted client", () => {
  const access = accessFor("viewer");
  assert.equal(canReadClientDetails(access, orgId, allowedId), true);
  assert.equal(canReadClientDetails(access, orgId, otherId), false);
  assert.equal(canReadClientDetails(access, otherId, allowedId), false);
});

test("only owners and managers can edit a granted client contact", () => {
  for (const role of ["viewer", "field"]) {
    assert.equal(canEditClientDetails(accessFor(role), orgId, allowedId), false);
  }
  for (const role of ["owner", "manager"]) {
    assert.equal(canEditClientDetails(accessFor(role), orgId, allowedId), true);
  }
  assert.equal(canEditClientDetails(accessFor("manager"), orgId, otherId), false);
  assert.equal(canEditClientDetails(accessFor("owner"), orgId, otherId), true);
});

test("contact changes allow clearing fields and reject invalid values", () => {
  assert.deepEqual(validateClientContact({ clientEmail: " User@Example.com ", clientPhone: " (555) 123-4567 " }), {
    clientEmail: "user@example.com", clientPhone: "(555) 123-4567",
  });
  assert.deepEqual(validateClientContact({ clientEmail: "", clientPhone: "" }), {
    clientEmail: null, clientPhone: null,
  });
  assert.ok(validateClientContact({ clientEmail: "invalid", clientPhone: "" }).error);
  assert.ok(validateClientContact({ clientEmail: "", clientPhone: "<script>" }).error);
});

test("public client details omit database audit fields", () => {
  const publicRow = publicClientProperty({
    id: allowedId, org_id: orgId, name: "Property", client_name: "Customer",
    client_email: "customer@example.com", client_phone: "555-1000", revision: 3,
    updated_by: "private-user-id", deleted_at: null,
  }, true);
  assert.equal(publicRow.clientName, "Customer");
  assert.equal(publicRow.canEdit, true);
  assert.equal("updated_by" in publicRow, false);
});
