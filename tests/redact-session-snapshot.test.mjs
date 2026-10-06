import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { redactSessionSnapshot } from "../api-lib/redactSessionSnapshot.js";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const identity = {
  email: "Former.User@example.com",
  userId: "66666666-6666-4666-8666-666666666666",
  fullName: "Former User",
};

function sampleSnapshot() {
  const rawSessionJSON = JSON.stringify({
    propertyName: "123 Main Street",
    capturedByEmail: identity.email,
    capturedByUserID: identity.userId,
    note: "Uploaded by former.user@example.com for this property",
    shots: [{ capturedByEmail: identity.email, title: "Front elevation" }],
  });
  return Buffer.from(JSON.stringify({
    snapshotSchemaVersion: 1,
    orgID: "11111111-1111-4111-8111-111111111111",
    actor: { userID: identity.userId, email: identity.email, name: identity.fullName },
    rawSessionJSON,
    rawSessionJSONSHA256: hash(Buffer.from(rawSessionJSON)),
    rawSessionJSONByteCount: Buffer.byteLength(rawSessionJSON),
    mediaManifest: [{ storagePath: "orgs/11111111/photo.jpg" }],
  }));
}

test("snapshot redaction removes account attribution and rebuilds both checksums", () => {
  const result = redactSessionSnapshot(sampleSnapshot(), identity);
  const payload = JSON.parse(result.bytes.toString("utf8"));
  const raw = JSON.parse(payload.rawSessionJSON);
  assert.equal(raw.propertyName, "123 Main Street");
  assert.equal(raw.shots[0].title, "Front elevation");
  assert.equal(raw.capturedByEmail, "Deleted user");
  assert.equal(raw.capturedByUserID, null);
  assert.equal(raw.note, "Uploaded by Deleted user for this property");
  assert.equal(payload.actor.name, "Deleted user");
  assert.equal(payload.actor.userID, null);
  assert.equal(result.rawSessionJSONSHA256, hash(Buffer.from(payload.rawSessionJSON)));
  assert.equal(payload.rawSessionJSONSHA256, result.rawSessionJSONSHA256);
  assert.equal(result.snapshotPayloadSHA256, hash(result.bytes));
  assert.equal(result.payloadByteSize, result.bytes.length);
  assert.equal(result.rawSessionJSONByteCount, Buffer.byteLength(payload.rawSessionJSON));
  assert.doesNotMatch(result.bytes.toString("utf8"), /former\.user@example\.com/i);
  assert.doesNotMatch(result.bytes.toString("utf8"), /66666666-6666-4666-8666-666666666666/i);
});

test("snapshot without departing user attribution stays byte-for-byte unchanged", () => {
  const source = Buffer.from(JSON.stringify({ rawSessionJSON: "{}", actor: null }));
  assert.equal(redactSessionSnapshot(source, identity), null);
});

test("unsupported snapshots fail closed", () => {
  assert.throws(() => redactSessionSnapshot(Buffer.from("{}"), identity), /Unsupported/);
});

test("snapshot with a bad source checksum cannot be rewritten", () => {
  const payload = JSON.parse(sampleSnapshot().toString("utf8"));
  payload.rawSessionJSONSHA256 = "0".repeat(64);
  assert.throws(() => redactSessionSnapshot(Buffer.from(JSON.stringify(payload)), identity), /integrity validation/);
});
