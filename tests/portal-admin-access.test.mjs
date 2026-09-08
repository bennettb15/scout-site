import assert from "node:assert/strict";
import test from "node:test";
import {
  canActorCancelPendingInvite,
  canActorChangePortalRole,
  canActorInvitePortalRole,
  canActorRevokePortalRole,
  inviteRolesForActor,
  membershipNeedsRequiredAdminRepair,
  membershipSummary,
  portalAccessRoleLabel,
  wouldRemoveLastOwner,
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

test("portal role labels use the simplified names", () => {
  assert.equal(portalAccessRoleLabel("viewer"), "Viewer");
  assert.equal(portalAccessRoleLabel("field"), "Field");
  assert.equal(portalAccessRoleLabel("manager"), "Manager");
  assert.equal(portalAccessRoleLabel("owner"), "Owner");
});

test("owner can change viewer to field", () => {
  assert.equal(
    canActorChangePortalRole({
      actorRole: "owner",
      currentRole: "viewer",
      nextRole: "field",
    }),
    true
  );
});

test("owner can change field to manager", () => {
  assert.equal(
    canActorChangePortalRole({
      actorRole: "owner",
      currentRole: "field",
      nextRole: "manager",
    }),
    true
  );
});

test("manager can change viewer, field, and manager roles except to owner", () => {
  assert.equal(
    canActorChangePortalRole({
      actorRole: "manager",
      currentRole: "viewer",
      nextRole: "field",
    }),
    true
  );
  assert.equal(
    canActorChangePortalRole({
      actorRole: "manager",
      currentRole: "field",
      nextRole: "manager",
    }),
    true
  );
  assert.equal(
    canActorChangePortalRole({
      actorRole: "manager",
      currentRole: "manager",
      nextRole: "viewer",
    }),
    true
  );
  assert.equal(
    canActorChangePortalRole({
      actorRole: "manager",
      currentRole: "viewer",
      nextRole: "owner",
    }),
    false
  );
});

test("manager cannot change or revoke owner access", () => {
  assert.equal(
    canActorChangePortalRole({
      actorRole: "manager",
      currentRole: "owner",
      nextRole: "manager",
    }),
    false
  );
  assert.equal(
    canActorRevokePortalRole({
      actorRole: "manager",
      targetRole: "owner",
    }),
    false
  );
});

test("owner invite dropdown allows viewer, field, manager, and owner", () => {
  assert.deepEqual(inviteRolesForActor("owner"), ["viewer", "field", "manager", "owner"]);
  assert.equal(canActorInvitePortalRole({ actorRole: "owner", targetRole: "manager" }), true);
  assert.equal(canActorInvitePortalRole({ actorRole: "owner", targetRole: "owner" }), true);
});

test("manager invite dropdown allows viewer, field, and manager", () => {
  assert.deepEqual(inviteRolesForActor("manager"), ["viewer", "field", "manager"]);
  assert.equal(canActorInvitePortalRole({ actorRole: "manager", targetRole: "manager" }), true);
});

test("manager cannot invite or grant owner", () => {
  assert.equal(canActorInvitePortalRole({ actorRole: "manager", targetRole: "owner" }), false);
});

test("owner can cancel pending invites for any role", () => {
  assert.equal(canActorCancelPendingInvite({ actorRole: "owner", inviteRole: "viewer" }), true);
  assert.equal(canActorCancelPendingInvite({ actorRole: "owner", inviteRole: "field" }), true);
  assert.equal(canActorCancelPendingInvite({ actorRole: "owner", inviteRole: "manager" }), true);
  assert.equal(canActorCancelPendingInvite({ actorRole: "owner", inviteRole: "owner" }), true);
});

test("manager can cancel viewer, field, and manager pending invites", () => {
  assert.equal(canActorCancelPendingInvite({ actorRole: "manager", inviteRole: "viewer" }), true);
  assert.equal(canActorCancelPendingInvite({ actorRole: "manager", inviteRole: "field" }), true);
  assert.equal(canActorCancelPendingInvite({ actorRole: "manager", inviteRole: "manager" }), true);
});

test("manager cannot cancel owner pending invite", () => {
  assert.equal(canActorCancelPendingInvite({ actorRole: "manager", inviteRole: "owner" }), false);
});

test("last active owner cannot be downgraded or removed", () => {
  assert.equal(
    wouldRemoveLastOwner({
      currentRole: "owner",
      nextRole: "manager",
      activeOwnerCount: 1,
    }),
    true
  );
  assert.equal(
    wouldRemoveLastOwner({
      currentRole: "owner",
      nextRole: "",
      activeOwnerCount: 1,
    }),
    true
  );
  assert.equal(
    wouldRemoveLastOwner({
      currentRole: "owner",
      nextRole: "manager",
      activeOwnerCount: 2,
    }),
    false
  );
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
