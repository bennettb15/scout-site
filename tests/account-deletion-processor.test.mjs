import assert from "node:assert/strict";
import test from "node:test";
import { transferObject } from "../api-lib/accountDeletionProcessor.js";

function fakeService(initialPaths, failCopyFrom = "") {
  const paths = new Set(initialPaths);
  const operations = [];
  const storage = {
    async list(folder, { search, limit, offset }) {
      const prefix = folder ? `${folder}/` : "";
      const data = [...paths].filter((path) => path.startsWith(prefix))
        .map((path) => path.slice(prefix.length))
        .filter((name) => !name.includes("/") && name.includes(search))
        .slice(offset, offset + limit)
        .map((name) => ({ name, id: name }));
      return { data, error: null };
    },
    async copy(source, destination) {
      operations.push(["copy", source, destination]);
      if (source === failCopyFrom) return { data: null, error: new Error("copy failed") };
      if (!paths.has(source)) return { data: null, error: new Error("source missing") };
      paths.add(destination);
      return { data: { path: destination }, error: null };
    },
    async remove(names) {
      operations.push(["remove", ...names]);
      for (const name of names) paths.delete(name);
      return { data: names, error: null };
    },
  };
  return { service: { storage: { from: () => storage } }, paths, operations };
}

const row = { bucket_id: "scoutcapture-originals", object_name: "property/photo.jpg", temporary_name: "transfer/photo.jpg" };

test("retained object is copied to a temporary path before its owned source is removed", async () => {
  const { service, paths, operations } = fakeService([row.object_name]);
  assert.equal(await transferObject(service, row, true), true);
  assert.deepEqual(operations, [
    ["copy", row.object_name, row.temporary_name],
    ["remove", row.object_name],
    ["copy", row.temporary_name, row.object_name],
  ]);
  assert.equal(paths.has(row.object_name), true);
  assert.equal(paths.has(row.temporary_name), true);
});

test("a failed first copy leaves the original object in place", async () => {
  const { service, paths, operations } = fakeService([row.object_name], row.object_name);
  await assert.rejects(transferObject(service, row, true), /copy failed/);
  assert.equal(paths.has(row.object_name), true);
  assert.deepEqual(operations, [["copy", row.object_name, row.temporary_name]]);
});

test("a retry restores an original that was removed after the temporary copy", async () => {
  const { service, paths, operations } = fakeService([row.temporary_name]);
  assert.equal(await transferObject(service, row, false), true);
  assert.equal(paths.has(row.object_name), true);
  assert.deepEqual(operations, [["copy", row.temporary_name, row.object_name]]);
});

test("an owned object with no original fails closed", async () => {
  const { service, operations } = fakeService([]);
  await assert.rejects(transferObject(service, row, true), /disappeared/);
  assert.deepEqual(operations, []);
});

test("an unreviewed bucket is not copied or removed", async () => {
  const { service, operations } = fakeService([row.object_name]);
  await assert.rejects(
    transferObject(service, { ...row, bucket_id: "personal-files" }, true),
    /Unreviewed Storage bucket/
  );
  assert.deepEqual(operations, []);
});

test("a scheduled run safely transfers multiple batches before deleting Auth", async () => {
  const bucket = "scoutcapture-originals";
  const initial = Array.from({ length: 35 }, (_, index) => `sessions/test/shot-${index}.jpg`);
  const paths = new Set(initial);
  const owned = new Set(initial);
  const journal = new Map();
  const operations = [];
  const ok = { data: null, error: null };
  const resultChain = {
    eq() { return this; },
    then(resolve) { return Promise.resolve(ok).then(resolve); },
  };
  const service = {
    from(table) {
      if (table === "account_deletion_requests") {
        return {
          update(value) { operations.push(["request", value.status]); return resultChain; },
          select() { return { eq() { return { single: async () => ({ data: { snapshot_scan_complete: true }, error: null }) }; } }; },
        };
      }
      assert.equal(table, "account_deletion_storage_transfers");
      return {
        async upsert(rows) {
          for (const row of rows) journal.set(row.object_name, { ...row, status: "pending" });
          return ok;
        },
        select() {
          return { eq() { return this; }, limit: async (n) => ({
            data: [...journal.values()].filter((row) => row.status === "pending").slice(0, n),
            error: null,
          }) };
        },
        update(value) {
          let path = "";
          return {
            eq(key, val) {
              if (key === "object_name") path = val;
              if (key === "object_name") journal.get(path).status = value.status;
              return this;
            },
            then(resolve) { return Promise.resolve(ok).then(resolve); },
          };
        },
        delete() { return resultChain; },
      };
    },
    async rpc(name) {
      if (name === "account_deletion_owned_objects") {
        return { data: [...owned].map((object_name) => ({ bucket_id: bucket, object_name })), error: null };
      }
      operations.push(["rpc", name]);
      return ok;
    },
    storage: {
      from(bucketId) {
        assert.equal(bucketId, bucket);
        return {
          async list(folder, { search, limit, offset }) {
            const prefix = folder ? `${folder}/` : "";
            const data = [...paths].filter((path) => path.startsWith(prefix))
              .map((path) => path.slice(prefix.length))
              .filter((name) => !name.includes("/") && name.includes(search))
              .slice(offset, offset + limit)
              .map((name) => ({ name, id: name }));
            return { data, error: null };
          },
          async copy(from, to) {
            assert.equal(paths.has(from), true);
            paths.add(to);
            return ok;
          },
          async remove(names) {
            for (const path of names) { paths.delete(path); owned.delete(path); }
            return ok;
          },
        };
      },
    },
    auth: { admin: { async deleteUser() {
      operations.push(["deleteAuth"]);
      assert.equal(owned.size, 0);
      for (const path of initial) assert.equal(paths.has(path), true);
      return ok;
    } } },
  };
  const { processAccountDeletion } = await import("../api-lib/accountDeletionProcessor.js");
  let notified = false;
  const result = await processAccountDeletion(service, {
    id: "request", user_id: "user", request_email: "test@example.test",
  }, { notifyCompletion: async () => { notified = true; } });
  assert.equal(result.status, "completed");
  assert.equal(journal.size, 35);
  assert.equal([...journal.values()].every((row) => row.status === "complete"), true);
  assert.equal(operations.some((entry) => entry[0] === "deleteAuth"), true);
  assert.equal(notified, true);
});
