import assert from "node:assert/strict";
import test from "node:test";
import { loadReadyPackageRowsForOrg } from "../api/report-packages.js";

function reportService() {
  const limits = new Map();
  return {
    limits,
    from(table) {
      assert.equal(table, "report_packages");
      let propertyId = "";
      let limit = 0;
      return {
        select() { return this; },
        eq(column, value) {
          if (column === "org_id") assert.equal(value, "org-1");
          if (column === "property_id") propertyId = value;
          return this;
        },
        is() { return this; },
        order() { return this; },
        limit(value) { limit = value; return this; },
        then(resolve, reject) {
          limits.set(propertyId, limit);
          const data = Array.from({ length: 3 }, (_, index) => ({
            id: `${propertyId}-report-${index + 1}`,
            property_id: propertyId,
          })).slice(0, limit);
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
    },
  };
}

test("Reports keeps the newest two ready packages for every property in an organization", async () => {
  const service = reportService();
  const properties = [{ id: "unit-1" }, { id: "unit-2" }, { id: "unit-3" }];
  const { data, error } = await loadReadyPackageRowsForOrg(service, "org-1", properties);

  assert.equal(error, null);
  assert.deepEqual(data.map((row) => row.id), [
    "unit-1-report-1", "unit-1-report-2",
    "unit-2-report-1", "unit-2-report-2",
    "unit-3-report-1", "unit-3-report-2",
  ]);
  assert.deepEqual(Array.from(service.limits.values()), [2, 2, 2]);
});

test("All Dates requests more history for each property", async () => {
  const service = reportService();
  const { data, error } = await loadReadyPackageRowsForOrg(
    service,
    "org-1",
    [{ id: "unit-1" }, { id: "unit-2" }],
    "all"
  );

  assert.equal(error, null);
  assert.equal(data.length, 6);
  assert.deepEqual(Array.from(service.limits.values()), [50, 50]);
});
