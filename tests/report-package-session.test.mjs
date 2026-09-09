import assert from "node:assert/strict";
import test from "node:test";
import { PORTAL_EMAIL_LOGO_URL } from "../api/_portalInviteShared.js";
import { reportReadyEmailPayload } from "../api/_reportReadyEmailShared.js";
import { buildSnapshotPhotoMetadata } from "../api/_reportPortalShared.js";
import {
  FULL_DOCUMENTATION_SESSION_TYPE,
  PUNCHLIST_VISIT_SESSION_TYPE,
  normalizeReportPackageSessionType,
  reportPackageSessionTypeFromSources,
} from "../api-lib/reportPackageSession.js";
import {
  packageShowsPropertyReport,
  reportPackageTypeLabel,
  visibleReportFilesForPackage,
} from "../src/lib/reportPackageDisplay.js";

const reportsUrl = "https://www.scoutclear.com/reports?org=org-1&property=property-1";
const property = {
  name: "Rental Unit",
  addressLine1: "123 Main St",
  city: "Austin",
  state: "TX",
};
const org = { name: "Client Org" };

function reportPackage(overrides = {}) {
  return {
    sessionType: FULL_DOCUMENTATION_SESSION_TYPE,
    files: [
      { id: "property-file", reportType: "property_report" },
      { id: "flagged-file", reportType: "flagged_observations" },
      { id: "comparison-file", reportType: "flagged_comparison" },
    ],
    ...overrides,
  };
}

test("session type normalization supports punchlist, full, and legacy fallback", () => {
  assert.equal(
    normalizeReportPackageSessionType("punchlist_visit"),
    PUNCHLIST_VISIT_SESSION_TYPE
  );
  assert.equal(
    normalizeReportPackageSessionType("fullDocumentation"),
    FULL_DOCUMENTATION_SESSION_TYPE
  );
  assert.equal(
    normalizeReportPackageSessionType(undefined),
    FULL_DOCUMENTATION_SESSION_TYPE
  );
  assert.equal(
    reportPackageSessionTypeFromSources(
      { metadata: { sessionType: "punchlist_visit" } },
      { session_type: "full_documentation" }
    ),
    PUNCHLIST_VISIT_SESSION_TYPE
  );
});

test("snapshot metadata exposes punchlist_visit session type", () => {
  const metadata = buildSnapshotPhotoMetadata({
    id: "session-1",
    sessionType: "punchlist_visit",
    shots: [],
  });

  assert.equal(metadata.sessionType, PUNCHLIST_VISIT_SESSION_TYPE);
});

test("punchlist_visit packages are labeled Punchlist and hide Property Report", () => {
  const punchlistPackage = reportPackage({ sessionType: PUNCHLIST_VISIT_SESSION_TYPE });

  assert.equal(reportPackageTypeLabel(punchlistPackage), "Punchlist");
  assert.equal(packageShowsPropertyReport(punchlistPackage), false);
  assert.deepEqual(
    visibleReportFilesForPackage(punchlistPackage).map((file) => file.reportType),
    ["flagged_observations", "flagged_comparison"]
  );
});

test("full_documentation packages still show normal reports", () => {
  const fullPackage = reportPackage();

  assert.equal(reportPackageTypeLabel(fullPackage), "Full Documentation");
  assert.equal(packageShowsPropertyReport(fullPackage), true);
  assert.deepEqual(
    visibleReportFilesForPackage(fullPackage).map((file) => file.reportType),
    ["property_report", "flagged_observations", "flagged_comparison"]
  );
});

test("legacy packages without sessionType remain full-documentation compatible", () => {
  const legacyPackage = reportPackage({ sessionType: undefined });

  assert.equal(reportPackageTypeLabel(legacyPackage), "Full Documentation");
  assert.equal(packageShowsPropertyReport(legacyPackage), true);
});

test("report-ready email copy changes for punchlist_visit", () => {
  const payload = reportReadyEmailPayload({
    email: "client@example.com",
    org,
    property,
    reportsUrl,
    sessionType: PUNCHLIST_VISIT_SESSION_TYPE,
    readyAt: "2026-09-09T20:45:00.000Z",
    from: "Scout <hello@scoutclear.com>",
    replyTo: "hello@scoutclear.com",
  });

  assert.equal(payload.to, "client@example.com");
  assert.equal(payload.subject, "Your SCOUT punchlist update is ready");
  assert.match(payload.text, /Your SCOUT punchlist update is ready/);
  assert.match(payload.text, /A punchlist update for Rental Unit is ready/);
  assert.doesNotMatch(payload.text, /property documentation report/i);
  assert.match(payload.text, /Ready: Sep 9, 2026, 4:45 PM EDT/);
  assert.match(
    payload.text,
    /Open Reports Portal: https:\/\/www\.scoutclear\.com\/reports\?org=org-1&property=property-1/
  );
  assert.match(payload.html, new RegExp(`src="${PORTAL_EMAIL_LOGO_URL}"`));
  assert.match(payload.html, /Open Reports Portal<\/a>/);
  assert.match(payload.html, /href="https:\/\/www\.scoutclear\.com\/reports\?org=org-1&amp;property=property-1"/);
});

test("report-ready email copy remains full documentation by default", () => {
  const payload = reportReadyEmailPayload({
    email: "client@example.com",
    org,
    property,
    reportsUrl,
    from: "Scout <hello@scoutclear.com>",
    replyTo: "hello@scoutclear.com",
  });

  assert.equal(payload.subject, "Your SCOUT report is ready");
  assert.match(payload.text, /Your SCOUT report is ready/);
  assert.match(payload.text, /The property report package for Rental Unit is ready/);
  assert.doesNotMatch(payload.text, /punchlist update/i);
  assert.match(payload.html, new RegExp(`src="${PORTAL_EMAIL_LOGO_URL}"`));
  assert.match(payload.html, /Open Reports Portal<\/a>/);
});
