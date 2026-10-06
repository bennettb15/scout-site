import assert from "node:assert/strict";
import test from "node:test";
import { processNextOrganizationPurge } from "../api-lib/organizationPurgeProcessor.js";

function fakeService(initialObjects, { due = true, removeFails = false } = {}) {
  const objects = new Map(initialObjects.map((row) => [`${row.bucket_id}\0${row.object_name}`, row]));
  const operations = [];
  const updateResult = {
    eq() { return this; },
    then(resolve) { return Promise.resolve({ data: null, error: null }).then(resolve); },
  };
  const service = {
    rpc(name) {
      operations.push(["rpc", name]);
      if (name === "claim_next_organization_purge") {
        return Promise.resolve({ data: due ? "test-org" : null, error: null });
      }
      if (name === "organization_purge_storage_objects") {
        return {
          range(start, end) {
            return Promise.resolve({ data: [...objects.values()].slice(start, end + 1), error: null });
          },
        };
      }
      if (name === "finish_organization_purge") {
        return Promise.resolve({ data: null, error: null });
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
    storage: {
      from(bucket) {
        return {
          async remove(paths) {
            operations.push(["remove", bucket, ...paths]);
            if (removeFails) return { data: null, error: new Error("Storage unavailable") };
            for (const path of paths) objects.delete(`${bucket}\0${path}`);
            return { data: paths, error: null };
          },
        };
      },
    },
    from(name) {
      assert.equal(name, "organization_retention_schedule");
      return { update(value) { operations.push(["update", value]); return updateResult; } };
    },
  };
  return { service, operations, objects };
}

test("no due organization leaves Storage and database unchanged", async () => {
  const { service, operations } = fakeService([], { due: false });
  assert.deepEqual(await processNextOrganizationPurge(service), { status: "idle" });
  assert.deepEqual(operations.map((entry) => entry[0]), ["rpc"]);
});

test("reviewed files are removed before organization records", async () => {
  const { service, operations, objects } = fakeService([
    { bucket_id: "scoutcapture-originals", object_name: "sessions/test/photo.jpg" },
    { bucket_id: "scoutcapture-deliverables", object_name: "orgs/test/report.pdf" },
  ]);
  assert.equal((await processNextOrganizationPurge(service)).status, "completed");
  assert.equal(objects.size, 0);
  const finish = operations.findIndex((entry) => entry[1] === "finish_organization_purge");
  assert.ok(finish > operations.findIndex((entry) => entry[0] === "remove"));
});

test("an unreviewed bucket blocks all file and record deletion", async () => {
  const { service, operations } = fakeService([
    { bucket_id: "unreviewed-bucket", object_name: "orgs/test/file" },
  ]);
  await assert.rejects(processNextOrganizationPurge(service), /Unreviewed organization Storage bucket/);
  assert.equal(operations.some((entry) => entry[0] === "remove"), false);
  assert.equal(operations.some((entry) => entry[1] === "finish_organization_purge"), false);
});

test("Storage failure leaves organization records in place", async () => {
  const { service, operations } = fakeService([
    { bucket_id: "scoutcapture-originals", object_name: "sessions/test/photo.jpg" },
  ], { removeFails: true });
  await assert.rejects(processNextOrganizationPurge(service), /Storage unavailable/);
  assert.equal(operations.some((entry) => entry[1] === "finish_organization_purge"), false);
});

test("multiple Storage batches finish in one scheduled run", async () => {
  const rows = Array.from({ length: 55 }, (_, index) => ({
    bucket_id: "scoutcapture-originals",
    object_name: `sessions/test/photo-${index}.jpg`,
  }));
  const { service, operations, objects } = fakeService(rows);
  assert.equal((await processNextOrganizationPurge(service)).status, "completed");
  assert.equal(objects.size, 0);
  assert.equal(operations.filter((entry) => entry[0] === "remove").length, 2);
});

test("an unfamiliar bucket beyond the first page blocks every deletion", async () => {
  const rows = Array.from({ length: 500 }, (_, index) => ({
    bucket_id: "scoutcapture-originals",
    object_name: `sessions/test/photo-${index}.jpg`,
  }));
  rows.push({ bucket_id: "unreviewed-bucket", object_name: "orgs/test/unknown" });
  const { service, operations } = fakeService(rows);
  await assert.rejects(processNextOrganizationPurge(service), /Unreviewed organization Storage bucket/);
  assert.equal(operations.some((entry) => entry[0] === "remove"), false);
});
