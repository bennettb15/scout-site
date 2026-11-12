import test from "node:test";
import assert from "node:assert/strict";
import { selectReviewReadySource } from "../src/lib/reviewedReportVisits.js";

const first = { id: "package-one", sessionId: "visit-one" };
const second = { id: "package-two", sessionId: "visit-two" };
const pending = { status: "pending_review", session: { id: "visit-one" } };

test("shows the completed visit while another visit still has pending items", () => {
  assert.equal(selectReviewReadySource([first, second], [pending])?.source.id, second.id);
  assert.equal(selectReviewReadySource([first], [pending]), null);
  assert.equal(selectReviewReadySource([first, second], [])?.source.id, first.id);
});

test("hides a visit after its updated report package is ready", () => {
  const ready = { status: "ready", resultPackageId: "reviewed-package" };
  assert.equal(selectReviewReadySource([{ ...first, latestRequest: ready }], []), null);
  assert.equal(selectReviewReadySource([{ ...first, latestRequest: ready }, second], [])?.source.id, second.id);
});

test("keeps generation progress visible while the request runs", () => {
  const request = { sourcePackageId: first.id, id: "request-one", status: "generating" };
  assert.equal(selectReviewReadySource([first], [pending], request)?.request.id, request.id);
  assert.equal(selectReviewReadySource([second, first], [], request)?.source.id, first.id);
});

test("avoids offering a visit when a pending item has no reliable visit ID", () => {
  assert.equal(selectReviewReadySource([first], [{ status: "pending_review" }]), null);
});

test("matches modern review submissions to the exact visit, even when the issue began earlier", () => {
  const modern = { ...first, pendingSubmissionIds: ["submission-one"] };
  const otherVisit = { ...second, pendingSubmissionIds: ["submission-two"] };
  const pendingRow = { status: "pending_review", session: { id: "visit-older" }, fieldResolutionActivityId: "submission-one" };
  assert.equal(selectReviewReadySource([modern, otherVisit], [pendingRow])?.source.id, otherVisit.id);
});

test("matches legacy pending photos by shot ID", () => {
  const legacy = { ...first, legacyShotIds: ["shot-one"] };
  const pendingRow = { status: "pending_review", session: { id: "visit-older" }, shotId: "shot-one" };
  assert.equal(selectReviewReadySource([legacy], [pendingRow]), null);
});
