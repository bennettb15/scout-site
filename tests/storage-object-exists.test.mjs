import assert from "node:assert/strict";
import test from "node:test";
import { storageObjectExists } from "../api-lib/storageObjectExists.js";

test("exact Storage listing distinguishes a missing file from similarly named files", async () => {
  const calls = [];
  const storage = { async list(folder, options) {
    calls.push([folder, options]);
    return { data: [{ name: "photo.jpg.old", id: "old" }], error: null };
  } };
  assert.equal(await storageObjectExists(storage, "sessions/one/photo.jpg"), false);
  assert.deepEqual(calls[0], ["sessions/one", { search: "photo.jpg", limit: 100, offset: 0 }]);
});

test("Storage listing errors fail closed", async () => {
  const storage = { async list() { return { data: null, error: new Error("Access denied") }; } };
  await assert.rejects(storageObjectExists(storage, "folder/file.jpg"), /Access denied/);
});

test("Storage listing finds an exact file on a later page", async () => {
  const storage = { async list(_folder, { offset }) {
    return { data: offset === 0
      ? Array.from({ length: 100 }, (_, index) => ({ name: `file-${index}.jpg`, id: String(index) }))
      : [{ name: "file.jpg", id: "found" }], error: null };
  } };
  assert.equal(await storageObjectExists(storage, "folder/file.jpg"), true);
});
