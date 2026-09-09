import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSnapshotPhotoMetadata,
} from "../api/_reportPortalShared.js";
import {
  actorIdsFromVisibleAttributionRows,
  attributionForAction,
  capturedByEmailForReportPackage,
  capturedAttributionForPunchListRow,
  completionAttributionForPunchListRow,
  profileEmailMap,
  publicActivityAttributionFields,
  submittedByEmailForCompletionActivity,
  workflowAttributionForPunchListRow,
} from "../api-lib/auditAttribution.js";
import {
  completionPhotosFromSubmissions,
  publicActivityRow,
  publicObservationRow,
} from "../api/punch-list.js";
import {
  filterRowsByCurrentPortalPropertyAccess,
} from "../api-lib/portalPropertyAccess.js";

const orgId = "11111111-1111-4111-8111-111111111111";
const propertyA = "22222222-2222-4222-8222-222222222222";
const propertyB = "33333333-3333-4333-8333-333333333333";
const sessionId = "44444444-4444-4444-8444-444444444444";
const shotId = "55555555-5555-4555-8555-555555555555";
const actorId = "66666666-6666-4666-8666-666666666666";

test("Reports package includes capturedByEmail from ScoutCapture snapshot", () => {
  const snapshotMetadata = buildSnapshotPhotoMetadata({
    uploadedByEmail: "Capture.Team@Example.com",
    shots: [],
  });

  assert.equal(
    capturedByEmailForReportPackage({ snapshotMetadata }),
    "capture.team@example.com"
  );
});

test("Reports package resolves capturedByEmail from package actor profile", () => {
  const emails = profileEmailMap([{ id: actorId, email: "Uploader@Example.com" }]);

  assert.equal(
    capturedByEmailForReportPackage({
      packageRow: { completed_by: actorId },
      profileEmailById: emails,
    }),
    "uploader@example.com"
  );
});

test("Reports package resolves capturedByEmail from session actor profile", () => {
  const emails = profileEmailMap([{ id: actorId, email: "Session.Uploader@Example.com" }]);

  assert.equal(
    capturedByEmailForReportPackage({
      packageRow: {},
      sessionRow: { created_by: actorId },
      profileEmailById: emails,
    }),
    "session.uploader@example.com"
  );
});

test("Reports package prefers first photo captured email over package fallback", () => {
  assert.equal(
    capturedByEmailForReportPackage({
      packageRow: { captured_by_email: "package@example.com" },
      firstPhotoRow: { captured_by_email: "First.Photo@Example.com" },
    }),
    "first.photo@example.com"
  );
});

test("Reports package resolves first photo user id to email", () => {
  const emails = profileEmailMap([{ id: actorId, email: "First.Actor@Example.com" }]);

  assert.equal(
    capturedByEmailForReportPackage({
      packageRow: { captured_by_email: "package@example.com" },
      firstPhotoRow: { captured_by_user_id: actorId },
      profileEmailById: emails,
    }),
    "first.actor@example.com"
  );
});

test("Snapshot metadata preserves first photo actor id for report attribution", () => {
  const snapshotMetadata = buildSnapshotPhotoMetadata({
    shots: [
      {
        id: shotId,
        originalFilename: "first.jpg",
        capturedByUserId: actorId,
      },
    ],
  });
  const emails = profileEmailMap([{ id: actorId, email: "Snapshot.Actor@Example.com" }]);

  assert.equal(snapshotMetadata.firstPhotoActorId, actorId);
  assert.equal(
    capturedByEmailForReportPackage({ snapshotMetadata, profileEmailById: emails }),
    "snapshot.actor@example.com"
  );
});

test("Punch List ScoutCapture-origin rows include captured attribution data", () => {
  const attribution = capturedAttributionForPunchListRow({
    shot: {
      id: shotId,
      org_id: orgId,
      property_id: propertyA,
      session_id: sessionId,
      captured_by_email: "field@example.com",
    },
  });

  assert.equal(attribution.actorEmail, "field@example.com");
  assert.equal(attribution.label, "Captured by field@example.com");
});

test("note rows include actor email and timestamp", () => {
  const activity = publicActivityAttributionFields({
    id: "activity-1",
    activity_type: "note_added",
    note: "Please verify before closing.",
    created_by: actorId,
    created_at: "2026-09-09T11:32:00.000Z",
  }, {
    actorEmail: "brian@scoutclear.com",
  });

  assert.equal(activity.actorEmail, "brian@scoutclear.com");
  assert.equal(activity.createdAt, "2026-09-09T11:32:00.000Z");
});

test("upload groups include submitted-by email", () => {
  const activity = {
    id: "activity-1",
    activity_type: "completion_submitted",
    actorEmail: "client@example.com",
  };

  assert.equal(submittedByEmailForCompletionActivity(activity), "client@example.com");
  assert.equal(
    completionAttributionForPunchListRow({
      operationalState: { source: "completion", status: "pending_review" },
      completionState: { submission: activity },
    }).label,
    "Uploaded by client@example.com"
  );
});

test("history events include action actor email", () => {
  const approved = publicActivityAttributionFields({
    id: "activity-1",
    activity_type: "completion_approved",
    from_value: "submission-1",
    to_value: "resolved",
    created_at: "2026-09-09T11:32:00.000Z",
  }, {
    actorEmail: "reviewer@example.com",
  });

  assert.equal(approved.actorEmail, "reviewer@example.com");
  assert.equal(attributionForAction("approved", approved.actorEmail), "Approved by reviewer@example.com");
});

test("portal workflow attribution drives last-updated row labels", () => {
  const attribution = workflowAttributionForPunchListRow({
    operationalState: {
      source: "workflow",
      activity: { actorEmail: "field@example.com" },
    },
    workflowActivityRows: [],
  });

  assert.equal(attribution.label, "Last updated by field@example.com");
});

test("fallback attribution is System, not Unknown", () => {
  const activity = publicActivityAttributionFields({
    id: "activity-1",
    activity_type: "completion_rejected",
    created_at: "2026-09-09T11:32:00.000Z",
  });

  assert.equal(activity.actorEmail, "System");
  assert.equal(String(activity.actorEmail).includes("Unknown"), false);
});

test("Punch List rows with missing actor data still render notes, uploads, and history", () => {
  const note = publicActivityRow({
    id: "77777777-7777-4777-8777-777777777777",
    org_id: orgId,
    property_id: propertyA,
    observation_id: "88888888-8888-4888-8888-888888888888",
    activity_type: "note_added",
    note: "Legacy note",
    created_at: "2026-09-09T11:32:00.000Z",
  });
  const uploadRow = {
    id: "99999999-9999-4999-8999-999999999999",
    org_id: orgId,
    property_id: propertyA,
    observation_id: "88888888-8888-4888-8888-888888888888",
    activity_type: "completion_submitted",
    from_value: "99999999-9999-4999-8999-999999999999",
    to_value: "pending_review",
    storage_path: "punchlist-completions/photo.jpg",
    filename: "photo.jpg",
    mime_type: "image/jpeg",
    byte_size: 128,
    created_at: "2026-09-09T12:32:00.000Z",
    actorEmail: "System",
  };
  const upload = publicActivityRow(uploadRow, {
    attachmentPreviewUrl: "https://example.com/photo.jpg",
  });
  const completionPhotos = completionPhotosFromSubmissions(
    [uploadRow],
    new Map([[uploadRow.id, "https://example.com/photo.jpg"]]),
    "Pending Review"
  );

  const row = publicObservationRow({
    observation: {
      id: "88888888-8888-4888-8888-888888888888",
      org_id: orgId,
      property_id: propertyA,
      session_id: sessionId,
      shot_id: shotId,
      title: "Legacy issue",
      status: "active",
      created_at: "2026-09-09T10:32:00.000Z",
      updated_at: "2026-09-09T10:32:00.000Z",
    },
    update: null,
    activity: [note, upload],
    canAddNote: true,
    canEditWorkflow: true,
    canReviewCompletion: true,
    workflowState: {},
    statusOverride: "pending_review",
    operationalState: {
      source: "completion",
      status: "pending_review",
      activity: uploadRow,
      groupId: uploadRow.id,
    },
    completionState: {
      status: "pending_review",
      submission: uploadRow,
      submissions: [uploadRow],
      groupId: uploadRow.id,
    },
    completionPhoto: completionPhotos[0],
    completionPhotos,
    completionPhotoIsPrimary: true,
    workflowActivityRows: [],
    shot: {
      id: shotId,
      org_id: orgId,
      property_id: propertyA,
      session_id: sessionId,
      reason: "Legacy issue",
      created_at: "2026-09-09T10:32:00.000Z",
    },
    org: { id: orgId, name: "Test Org" },
    property: { id: propertyA, name: "Test Property" },
    session: { id: sessionId },
    reportPackage: {},
    previewUrl: null,
  });

  assert.equal(note.actorEmail, "System");
  assert.equal(upload.actorEmail, "System");
  assert.equal(row.attribution.actorEmail, "System");
  assert.equal(row.attribution.label, "Uploaded by System");
  assert.equal(row.activity.length, 2);
  assert.equal(row.completionReview.photos[0].submittedByEmail, "System");
});

test("property-scoped users do not gain unrelated actor data", () => {
  const visibleRows = filterRowsByCurrentPortalPropertyAccess(
    [
      { id: "visible", org_id: orgId, property_id: propertyA, created_by: "actor-visible" },
      { id: "hidden", org_id: orgId, property_id: propertyB, created_by: "actor-hidden" },
    ],
    [
      {
        org_id: orgId,
        role: "viewer",
        access_scope: "property",
        propertyIds: [propertyA],
      },
    ],
    [propertyA, propertyB]
  );

  assert.deepEqual(actorIdsFromVisibleAttributionRows(visibleRows), ["actor-visible"]);
});
