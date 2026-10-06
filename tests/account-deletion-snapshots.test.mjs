import assert from "node:assert/strict";
import { Blob, Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import test from "node:test";
import { redactSnapshotObject, scanAccountSnapshots } from "../api-lib/accountDeletionSnapshots.js";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const identity = {
  email: "former@example.com",
  userId: "66666666-6666-4666-8666-666666666666",
};
const requestId = "11111111-1111-4111-8111-111111111111";
const snapshotId = "22222222-2222-4222-8222-222222222222";
const path = `orgs/33333333-3333-4333-8333-333333333333/snapshots/${snapshotId}.json`;

function fixture(failBeforeRowUpdate = false) {
  const rawSessionJSON = JSON.stringify({
    capturedByEmail: identity.email,
    capturedByUserID: identity.userId,
    shots: [{ title: "North side" }],
  });
  const original = Buffer.from(JSON.stringify({
    rawSessionJSON,
    rawSessionJSONSHA256: hash(Buffer.from(rawSessionJSON)),
    rawSessionJSONByteCount: Buffer.byteLength(rawSessionJSON),
    actor: { email: identity.email, userID: identity.userId },
  }));
  const files = new Map([[path, original]]);
  const row = {
    id: snapshotId,
    payload_storage_bucket: "scoutcapture-session-snapshots",
    payload_storage_path: path,
    payload_byte_size: original.length,
    snapshot_payload_sha256: hash(original),
    raw_session_json_sha256: hash(Buffer.from(rawSessionJSON)),
    manifest: { actor: { email: identity.email, userID: identity.userId } },
  };
  let journal = null;
  let fail = failBeforeRowUpdate;
  const storage = {
    async download(name) {
      return files.has(name)
        ? { data: new Blob([files.get(name)]), error: null }
        : { data: null, error: new Error("missing file") };
    },
    async list(folder, { search, limit, offset }) {
      const prefix = folder ? `${folder}/` : "";
      const data = [...files.keys()].filter((path) => path.startsWith(prefix))
        .map((path) => path.slice(prefix.length))
        .filter((name) => !name.includes("/") && name.includes(search))
        .slice(offset, offset + limit)
        .map((name) => ({ name, id: name }));
      return { data, error: null };
    },
    async copy(source, destination) {
      files.set(destination, Buffer.from(files.get(source)));
      return { data: { path: destination }, error: null };
    },
    async upload(name, bytes) {
      files.set(name, Buffer.from(await bytes.arrayBuffer()));
      return { data: { path: name }, error: null };
    },
    async remove(names) {
      for (const name of names) files.delete(name);
      return { data: names, error: null };
    },
  };
  function builder(table) {
    let action = "read";
    let patch;
    return {
      select() { return this; },
      eq() { return this; },
      async maybeSingle() {
        if (table === "account_deletion_snapshot_redactions") return { data: journal, error: null };
        if (action === "update") {
          if (fail) {
            fail = false;
            return { data: null, error: new Error("interrupted before row update") };
          }
          Object.assign(row, patch);
          return { data: { id: row.id }, error: null };
        }
        return { data: { ...row }, error: null };
      },
      async single() { return { data: { ...row }, error: null }; },
      async insert(value) { journal = { ...value }; return { data: null, error: null }; },
      update(value) {
        action = "update";
        patch = value;
        return this;
      },
      then(resolve) {
        if (table === "account_deletion_snapshot_redactions" && action === "update") {
          Object.assign(journal, patch);
        }
        resolve({ data: null, error: null });
      },
    };
  }
  return {
    service: { from: builder, storage: { from: () => storage } },
    files,
    row,
    getJournal: () => journal,
  };
}

test("snapshot redaction updates Storage and database integrity fields", async () => {
  const state = fixture();
  assert.equal(await redactSnapshotObject(state.service, requestId, state.row, identity), true);
  const current = state.files.get(path);
  assert.doesNotMatch(current.toString("utf8"), /former@example\.com|66666666-6666-4666-8666-666666666666/);
  assert.equal(state.row.snapshot_payload_sha256, hash(current));
  assert.equal(state.row.payload_byte_size, current.length);
  assert.deepEqual(state.row.manifest, { actor: { email: "Deleted user", userID: null } });
  assert.equal(state.getJournal().status, "complete");
  assert.equal(state.files.size, 1);
});

test("retry repairs a crash after Storage rewrite and before checksum update", async () => {
  const state = fixture(true);
  await assert.rejects(redactSnapshotObject(state.service, requestId, state.row, identity),
    /interrupted before row update/);
  assert.notEqual(state.row.snapshot_payload_sha256, hash(state.files.get(path)));
  assert.equal(state.files.size, 2);
  assert.equal(await redactSnapshotObject(state.service, requestId, state.row, identity), true);
  assert.equal(state.row.snapshot_payload_sha256, hash(state.files.get(path)));
  assert.equal(state.files.size, 1);
});

function scanFixture(snapshotCount) {
  const state = { cursor: null, complete: false };
  const snapshots = Array.from({ length: snapshotCount }, (_, index) => ({
    id: String(index + 1).padStart(3, "0"),
  }));
  const service = {
    from(table) {
      let patch = null;
      let cursor = null;
      return {
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        order() { return this; },
        limit() { return this; },
        gt(_field, value) { cursor = value; return this; },
        async single() {
          assert.equal(table, "account_deletion_requests");
          return { data: { snapshot_scan_cursor: state.cursor, snapshot_scan_complete: state.complete }, error: null };
        },
        update(value) { patch = value; return this; },
        then(resolve) {
          if (table === "account_deletion_requests") {
            if ("snapshot_scan_cursor" in patch) state.cursor = patch.snapshot_scan_cursor;
            if ("snapshot_scan_complete" in patch) state.complete = patch.snapshot_scan_complete;
            resolve({ data: null, error: null });
          } else if (table === "org_memberships") {
            resolve({ data: [{ org_id: "test-org" }], error: null });
          } else {
            assert.equal(table, "session_snapshots");
            resolve({ data: snapshots.filter((row) => !cursor || row.id > cursor).slice(0, 20), error: null });
          }
        },
      };
    },
  };
  return { service, state };
}

test("snapshot scan handles bounded parallel batches and resumes from a committed cursor", async () => {
  const { service, state } = scanFixture(21);
  let active = 0;
  let peak = 0;
  const redactSnapshot = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active -= 1;
  };
  assert.equal(await scanAccountSnapshots(service, requestId, identity.userId, identity.email, null, { redactSnapshot }), false);
  assert.equal(state.cursor, "020");
  assert.equal(peak, 4);
  assert.equal(await scanAccountSnapshots(service, requestId, identity.userId, identity.email, null, { redactSnapshot }), true);
  assert.equal(state.cursor, "021");
  assert.equal(state.complete, true);
});

test("snapshot scan keeps its last safe cursor if a parallel batch fails", async () => {
  const { service, state } = scanFixture(8);
  const redactSnapshot = async (_service, _requestId, snapshot) => {
    if (snapshot.id === "006") throw new Error("snapshot failed");
  };
  await assert.rejects(
    scanAccountSnapshots(service, requestId, identity.userId, identity.email, null, { redactSnapshot }),
    /snapshot failed/
  );
  assert.equal(state.cursor, "004");
  assert.equal(state.complete, false);
});
