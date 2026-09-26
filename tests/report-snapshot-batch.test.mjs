import assert from "node:assert/strict";
import test from "node:test";
import { loadSnapshotPhotoMetadataBatch } from "../api/_reportPortalShared.js";

test("report snapshots load in one query and keep package ownership checks", async () => {
  const packages = [
    { snapshot_id: "snapshot-1", org_id: "org-1", property_id: "property-1", session_id: "session-1" },
    { snapshot_id: "snapshot-2", org_id: "org-2", property_id: "property-2", session_id: "session-2" },
  ];
  const snapshots = [
    {
      id: "snapshot-1",
      org_id: "org-1",
      property_id: "property-1",
      session_id: "session-1",
      snapshot_kind: "completed",
      session_status: "completed",
      is_sealed: true,
      deleted_at: null,
      payload_storage_bucket: "snapshots",
      payload_storage_path: "first.json",
    },
    {
      id: "snapshot-2",
      org_id: "another-org",
      property_id: "property-2",
      session_id: "session-2",
      snapshot_kind: "completed",
      session_status: "completed",
      is_sealed: true,
      deleted_at: null,
      payload_storage_bucket: "snapshots",
      payload_storage_path: "second.json",
    },
  ];
  let queries = 0;
  let downloads = 0;
  const query = {
    select() { return this; },
    in() { queries += 1; return this; },
    eq() { return this; },
    is() { return this; },
    then(resolve, reject) {
      return Promise.resolve({ data: snapshots, error: null }).then(resolve, reject);
    },
  };
  const service = {
    from(table) {
      assert.equal(table, "session_snapshots");
      return query;
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, "snapshots");
        return {
          async download(path) {
            downloads += 1;
            assert.equal(path, "first.json");
            return {
              data: {
                async text() {
                  return JSON.stringify({
                    orgID: "org-1",
                    propertyID: "property-1",
                    sessionID: "session-1",
                    rawSessionJSON: { shots: [{ id: "shot-1" }] },
                  });
                },
              },
              error: null,
            };
          },
        };
      },
    },
  };

  const metadata = await loadSnapshotPhotoMetadataBatch(service, packages);
  assert.equal(queries, 1);
  assert.equal(downloads, 1);
  assert.equal(metadata[0].rows[0].shot_id, "shot-1");
  assert.equal(metadata[1], null);
});
