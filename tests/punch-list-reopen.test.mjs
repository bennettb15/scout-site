import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSnapshotPhotoMetadata,
  enrichPhotoRowWithSnapshotMetadata,
} from "../api/_reportPortalShared.js";
import { latestStatusOverride } from "../api-lib/punchListStatus.js";

const sessionId = "11111111-1111-4111-8111-111111111111";
const issueId = "22222222-2222-4222-8222-222222222222";
const shotId = "33333333-3333-4333-8333-333333333333";

function metadataFor(rawSession) {
  return buildSnapshotPhotoMetadata(rawSession).byShotId.get(shotId);
}

test("sealed snapshot active/reopen metadata clears stale resolved shot state", () => {
  const snapshotMetadata = buildSnapshotPhotoMetadata({
    id: sessionId,
    shots: [
      {
        shotID: shotId,
        issueID: issueId,
        issueStatus: "active",
        captureKind: "follow_up_capture",
        isFlagged: true,
      },
    ],
    issues: [
      {
        id: issueId,
        issueStatus: "active",
        historyEvents: [
          {
            type: "reopened",
            sessionId,
            details: { beforeValue: "resolution_required", afterValue: "active" },
          },
        ],
      },
    ],
  });

  const enriched = enrichPhotoRowWithSnapshotMetadata(
    {
      id: shotId,
      issue_status: "resolved",
      is_resolved_in_session: true,
    },
    snapshotMetadata
  );

  assert.equal(enriched.issue_status, "active");
  assert.equal(enriched.snapshot_issue_status, "active");
  assert.equal(enriched.snapshot_reopened_in_session, true);
  assert.equal(enriched.is_resolved_in_session, false);
});

test("resolved capture metadata remains resolved", () => {
  const metadata = metadataFor({
    id: sessionId,
    shots: [
      {
        shotID: shotId,
        issueID: issueId,
        issueStatus: "resolved",
        captureKind: "resolved_capture",
      },
    ],
    issues: [{ id: issueId, issueStatus: "resolved" }],
  });

  assert.equal(metadata.issue_status, "resolved");
  assert.equal(metadata.is_resolved_in_session, true);
});

test("resolution_required without reopen does not clear existing resolved state", () => {
  const snapshotMetadata = buildSnapshotPhotoMetadata({
    id: sessionId,
    shots: [
      {
        shotID: shotId,
        issueID: issueId,
        issueStatus: "resolution_required",
        captureKind: "reference",
      },
    ],
    issues: [{ id: issueId, issueStatus: "resolution_required" }],
  });

  const enriched = enrichPhotoRowWithSnapshotMetadata(
    {
      id: shotId,
      issue_status: "resolved",
      is_resolved_in_session: true,
    },
    snapshotMetadata
  );

  assert.equal(enriched.issue_status, "resolved");
  assert.equal(enriched.snapshot_issue_status, null);
  assert.equal(enriched.snapshot_reopened_in_session, false);
  assert.equal(enriched.is_resolved_in_session, true);
});

test("SC explicit reopen after portal resolved returns Website Open", () => {
  const shot = {
    snapshot_reopened_in_session: true,
    snapshot_issue_status: "active",
  };
  const reportPackage = { session_completed_at: "2026-09-04T14:00:00.000Z" };

  assert.equal(
    latestStatusOverride({
      operationalState: {
        status: "resolved",
        activity: { created_at: "2026-09-04T13:59:00.000Z" },
      },
      shot,
      reportPackage,
    }),
    "active"
  );
});

test("older SC active evidence does not override newer portal resolved", () => {
  const shot = {
    snapshot_reopened_in_session: true,
    snapshot_issue_status: "active",
  };
  const reportPackage = { session_completed_at: "2026-09-04T14:00:00.000Z" };

  assert.equal(
    latestStatusOverride({
      operationalState: {
        status: "resolved",
        activity: { created_at: "2026-09-04T14:01:00.000Z" },
      },
      shot,
      reportPackage,
    }),
    "resolved"
  );
});

test("completion-approved resolves unless superseded by newer SC reopen", () => {
  const reportPackage = { session_completed_at: "2026-09-04T14:00:00.000Z" };

  assert.equal(
    latestStatusOverride({
      operationalState: {
        status: "resolved",
        source: "completion",
        activity: { created_at: "2026-09-04T13:59:00.000Z" },
      },
      shot: {},
      reportPackage,
    }),
    "resolved"
  );

  assert.equal(
    latestStatusOverride({
      operationalState: {
        status: "resolved",
        source: "completion",
        activity: { created_at: "2026-09-04T13:59:00.000Z" },
      },
      shot: {
        snapshot_reopened_in_session: true,
        snapshot_issue_status: "active",
      },
      reportPackage,
    }),
    "active"
  );
});
