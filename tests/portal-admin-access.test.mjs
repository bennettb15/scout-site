import assert from "node:assert/strict";
import test from "node:test";
import {
  membershipNeedsRequiredAdminRepair,
  membershipSummary,
} from "../api-lib/portalAdminAccess.js";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

function mapsFor(email) {
  return {
    profileById: new Map([[userId, { email }]]),
    orgById: new Map([[orgId, { name: "Test New" }]]),
    authById: new Map([[userId, { id: userId, email, email_confirmed_at: "2026-09-07T00:00:00Z" }]]),
  };
}

test("approved admin owner membership appears as active non-revocable access", () => {
  const maps = mapsFor("bennettb15@gmail.com");
  const row = membershipSummary(
    {
      id: "membership-1",
      org_id: orgId,
      user_id: userId,
      role: "owner",
      access_scope: "org",
      created_at: "2026-09-07T00:00:00Z",
      updated_at: "2026-09-07T00:00:00Z",
      deleted_at: null,
    },
    maps.profileById,
    maps.orgById,
    maps.authById,
    true
  );

  assert.equal(row.email, "bennettb15@gmail.com");
  assert.equal(row.role, "owner");
  assert.equal(row.accessScope, "org");
  assert.equal(row.canRevoke, false);
});

test("ordinary org-level viewer access remains revocable", () => {
  const maps = mapsFor("client@example.com");
  const row = membershipSummary(
    {
      id: "membership-2",
      org_id: orgId,
      user_id: userId,
      role: "viewer",
      access_scope: "org",
      created_at: "2026-09-07T00:00:00Z",
      updated_at: "2026-09-07T00:00:00Z",
      deleted_at: null,
    },
    maps.profileById,
    maps.orgById,
    maps.authById,
    true
  );

  assert.equal(row.canRevoke, true);
});

test("required admin repair upgrades missing, deleted, property-scoped, or non-owner rows", () => {
  assert.equal(membershipNeedsRequiredAdminRepair(null), true);
  assert.equal(
    membershipNeedsRequiredAdminRepair({
      role: "owner",
      access_scope: "org",
      deleted_at: "2026-09-07T00:00:00Z",
    }),
    true
  );
  assert.equal(
    membershipNeedsRequiredAdminRepair({
      role: "manager",
      access_scope: "org",
      deleted_at: null,
    }),
    true
  );
  assert.equal(
    membershipNeedsRequiredAdminRepair({
      role: "owner",
      access_scope: "property",
      deleted_at: null,
    }),
    true
  );
  assert.equal(
    membershipNeedsRequiredAdminRepair({
      role: "owner",
      access_scope: "org",
      deleted_at: null,
    }),
    false
  );
});
