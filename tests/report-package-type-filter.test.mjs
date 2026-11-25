import assert from "node:assert/strict";
import test from "node:test";
import { filterReportPackagesByType } from "../src/lib/reportPackageDisplay.js";

test("report type filter includes legacy Full packages and keeps each type distinct", () => {
  const packages = [
    { id: "legacy" },
    { id: "full", sessionType: "full_documentation", fullDocumentationMode: "complete_capture" },
    { id: "follow-up", sessionType: "full_documentation", fullDocumentationMode: "follow_up" },
    { id: "punchlist", sessionType: "punchlist_visit" },
  ];
  assert.deepEqual(filterReportPackagesByType(packages, "All"), packages);
  assert.deepEqual(filterReportPackagesByType(packages, "Full").map(({ id }) => id), ["legacy", "full"]);
  assert.deepEqual(filterReportPackagesByType(packages, "Follow-Up").map(({ id }) => id), ["follow-up"]);
  assert.deepEqual(filterReportPackagesByType(packages, "Punchlist").map(({ id }) => id), ["punchlist"]);
});
