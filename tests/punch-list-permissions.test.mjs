import assert from "node:assert/strict";
import test from "node:test";
import {
  canReviewCompletionForPunchListRow,
  portalAccessCanReviewCompletion,
  portalRoleCanReviewCompletionAction,
} from "../api-lib/punchListPermissions.js";
import { publicObservationRow } from "../api/punch-list.js";

const orgId = "11111111-1111-4111-8111-111111111111";
const propertyId = "22222222-2222-4222-8222-222222222222";
const observationId = "33333333-3333-4333-8333-333333333333";
const sessionId = "44444444-4444-4444-8444-444444444444";
const shotId = "55555555-5555-4555-8555-555555555555";

function portalAccessForRole(role) {
  return {
    rows: [
      {
        org_id: orgId,
        role,
        access_scope: "property",
        propertyIds: [propertyId],
      },
    ],
    isApprovedAdmin: false,
  };
}

function pendingReviewRow({ canReviewCompletion }) {
  return publicObservationRow({
    observation: {
      id: observationId,
      org_id: orgId,
      property_id: propertyId,
      session_id: sessionId,
      shot_id: shotId,
      title: "Install cover plate",
      status: "active",
      created_at: "2026-09-09T10:32:00.000Z",
      updated_at: "2026-09-09T10:32:00.000Z",
    },
    update: null,
    activity: [],
    canAddNote: true,
    canEditWorkflow: true,
    canReviewCompletion,
    workflowState: {},
    statusOverride: "pending_review",
    operationalState: null,
    completionState: null,
    completionPhoto: null,
    completionPhotos: [],
    completionPhotoIsPrimary: false,
    workflowActivityRows: [],
    shot: {
      id: shotId,
      org_id: orgId,
      property_id: propertyId,
      session_id: sessionId,
      reason: "Install cover plate",
      created_at: "2026-09-09T10:32:00.000Z",
    },
    org: { id: orgId, name: "Test Org" },
    property: { id: propertyId, name: "Test Property" },
    session: { id: sessionId },
    reportPackage: null,
    previewUrl: null,
  });
}

test("Field cannot approve Pending Review", () => {
  assert.equal(portalRoleCanReviewCompletionAction("field", "approve"), false);
  assert.equal(portalAccessCanReviewCompletion(portalAccessForRole("field"), orgId, propertyId), false);
});

test("Field cannot reject Pending Review", () => {
  assert.equal(portalRoleCanReviewCompletionAction("field", "reject"), false);
  assert.equal(portalAccessCanReviewCompletion(portalAccessForRole("field"), orgId, propertyId), false);
});

test("Field does not receive or render review permission", () => {
  const row = pendingReviewRow({ canReviewCompletion: false });

  assert.equal(row.permissions.canEditWorkflow, true);
  assert.equal(row.permissions.canReviewCompletion, false);
  assert.equal(canReviewCompletionForPunchListRow(row), false);
});

for (const role of ["viewer", "manager", "owner"]) {
  test(`${role} can approve/reject Pending Review`, () => {
    assert.equal(portalRoleCanReviewCompletionAction(role, "approve"), true);
    assert.equal(portalRoleCanReviewCompletionAction(role, "reject"), true);
    assert.equal(portalAccessCanReviewCompletion(portalAccessForRole(role), orgId, propertyId), true);
    assert.equal(canReviewCompletionForPunchListRow(pendingReviewRow({ canReviewCompletion: true })), true);
  });
}
