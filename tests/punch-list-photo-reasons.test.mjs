import assert from "node:assert/strict";
import test from "node:test";
import { publicHistoryPhotoForRow, publicPreview } from "../api/punch-list.js";
import { photoFlagReason } from "../src/lib/punchListPhotoPreview.js";

test("switching to a previous punchlist photo shows its saved reason, not the latest wording", async () => {
  const current = { id: "new-shot", issue_id: "same-issue", session_id: "new-session", reason: "Repaired downspout" };
  const previous = { id: "old-shot", issue_id: "same-issue", session_id: "old-session", reason: "Broken downspout" };
  const preview = publicPreview(current, "https://example.test/new.jpg", null);
  const prior = await publicHistoryPhotoForRow({
    row: { status: "resolved", preview, title: current.reason },
    shot: current,
    historyShotsByIssueId: new Map([["same-issue", [previous]]]),
    historyShotsByLocationKey: new Map(),
    candidateOrderByShotId: new Map([[current.id, 0], [previous.id, 1]]),
    packageBySession: new Map(),
    sessionById: new Map(),
    previewForShot: async () => "https://example.test/old.jpg",
  });
  assert.equal(photoFlagReason({ preview }), "Repaired downspout");
  assert.equal(photoFlagReason(prior), "Broken downspout");
  assert.equal(prior.shotId, previous.id);
});

test("unchanged wording repeats for each photo and missing historical wording is explicit", () => {
  for (const id of ["old", "new"]) {
    const preview = publicPreview({ id, reason: "Broken downspout" }, "https://example.test/photo.jpg", null);
    assert.equal(photoFlagReason({ preview }), "Broken downspout");
  }
  const preview = publicPreview({ id: "old", reason: null }, "https://example.test/old.jpg", null);
  assert.equal(photoFlagReason({ preview }), "No flag reason recorded");
});

test("portal completion photos keep their own submitted note", () => {
  assert.equal(photoFlagReason({ activityId: "upload", note: "Repair completed", preview: {} }), "Repair completed");
  assert.equal(photoFlagReason({ activityId: "upload", preview: {} }), "No completion note recorded");
});
