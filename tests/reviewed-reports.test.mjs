import test from "node:test";
import assert from "node:assert/strict";
import { dispatchReviewedReportRequest } from "../api-lib/reviewedReportDispatch.js";
import { createReviewedReportsHandler, sourcePackages } from "../api/reviewed-reports.js";

const orgId = "11111111-1111-4111-8111-111111111111";
const propertyId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const sourceId = "44444444-4444-4444-8444-444444444444";
const reportTypes = ["property_report", "flagged_observations", "flagged_comparison"];

test("reviewed-report sources exclude reviewed copies, duplicate sessions, and incomplete packages", async () => {
  const packages = [
    { id: "automatic", snapshot_id: "snapshot-a", session_id: "visit-a", report_variant: null },
    { id: "reviewed", snapshot_id: "snapshot-b", session_id: "visit-b", report_variant: "reviewed" },
    { id: "older", snapshot_id: "snapshot-a", session_id: "visit-a", report_variant: null },
    { id: "incomplete", snapshot_id: "snapshot-c", session_id: "visit-c", report_variant: null },
    { id: "other", snapshot_id: "snapshot-d", session_id: "visit-d", report_variant: null },
    { id: "no-review", snapshot_id: "snapshot-e", session_id: "visit-e", report_variant: null },
    { id: "legacy-approved", snapshot_id: "snapshot-f", session_id: "visit-f", report_variant: null },
    { id: "legacy-incomplete", snapshot_id: "snapshot-g", session_id: "visit-g", report_variant: null },
  ];
  const snapshots = ["a", "c", "d"].map((suffix) => ({
    id: `snapshot-${suffix}`, field_resolution_submissions: [{ status: "pending_review" }],
  }));
  snapshots.push(
    { id: "snapshot-e", field_resolution_submissions: [{ status: "resolved" }] },
    { id: "snapshot-f", field_resolution_submissions: null },
    { id: "snapshot-g", field_resolution_submissions: null },
  );
  const files = [
    ...reportTypes.map((report_type) => ({ package_id: "automatic", report_type })),
    ...reportTypes.map((report_type) => ({ package_id: "older", report_type })),
    { package_id: "incomplete", report_type: "property_report" },
    ...reportTypes.map((report_type) => ({ package_id: "other", report_type })),
    ...reportTypes.map((report_type) => ({ package_id: "no-review", report_type })),
    ...reportTypes.map((report_type) => ({ package_id: "legacy-approved", report_type })),
    { package_id: "legacy-incomplete", report_type: "property_report" },
  ];
  let legacyFunctionAvailable = true;
  const service = { async rpc(name, args) {
    assert.equal(name, "legacy_reviewed_report_outcomes");
    assert.deepEqual(args, { p_org_id: orgId, p_property_id: propertyId,
      p_package_ids: ["legacy-approved", "legacy-incomplete"] });
    if (!legacyFunctionAvailable) return { data: null, error: { code: "PGRST202" } };
    return { data: [{ package_id: "legacy-approved", status: "resolved" },
      { package_id: "legacy-incomplete", status: null }], error: null };
  }, from(table) {
    const query = {
      select() { return this; }, eq() { return this; }, is() { return this; }, order() { return this; }, limit() { return this; },
      in() { return this; },
      then(resolve) { return Promise.resolve({ data: table === "report_packages" ? packages
        : table === "session_snapshots" ? snapshots : files, error: null }).then(resolve); },
    };
    return query;
  } };
  assert.deepEqual((await sourcePackages(service, orgId, propertyId)).map((row) => row.id),
    ["automatic", "other", "legacy-approved"]);
  legacyFunctionAvailable = false;
  assert.deepEqual((await sourcePackages(service, orgId, propertyId)).map((row) => row.id), ["automatic", "other"]);
});

test("reviewed-report dispatch uses the server key and an atomic retry lease", async () => {
  const updates = [];
  const service = { from(table) {
    assert.equal(table, "reviewed_report_requests");
    return {
      update(value) { updates.push(value); return this; }, eq() { return this; },
      or(value) { assert.match(value, /locked_at\.is\.null/); return this; },
      select() { return this; }, maybeSingle: async () => ({ data: { id: requestId }, error: null }),
      then(resolve) { return Promise.resolve({ error: null }).then(resolve); },
    };
  } };
  const outcome = await dispatchReviewedReportRequest(service, requestId, {
    origin: "https://example.supabase.co/", serviceKey: "server-key",
    fetcher: async (url, options) => {
      assert.equal(url, "https://example.supabase.co/functions/v1/report-package-dispatch");
      assert.equal(options.headers["x-scoutcapture-service-key"], "server-key");
      assert.deepEqual(JSON.parse(options.body), { reviewed_report_request_id: requestId });
      return { status: 202, ok: true };
    },
  });
  assert.equal(outcome, "starting");
  assert.ok(updates[0].locked_at);
  assert.equal(updates[1].last_error, null);
});

function response() {
  return { statusCode: 0, body: null, setHeader() {}, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
}

test("reviewed-report request status is limited to the requester and property reviewer", async () => {
  const row = { id: requestId, requested_by: "owner", org_id: orgId, property_id: propertyId,
    source_package_id: "source", status: "ready", result_package_id: "result" };
  const service = { from(table) {
    assert.equal(table, "reviewed_report_requests");
    return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: row, error: null }) };
  } };
  const allowed = { rows: [{ org_id: orgId, role: "owner", access_scope: "org" }] };
  const handler = createReviewedReportsHandler({
    authenticate: async () => ({ user: { id: "owner" } }),
    serviceClient: () => service,
    propertyAccess: async () => allowed,
  });
  const res = response();
  await handler({ method: "GET", query: { requestId } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.request.resultPackageId, "result");

  const otherUser = createReviewedReportsHandler({
    authenticate: async () => ({ user: { id: "other" } }),
    serviceClient: () => service,
    propertyAccess: async () => allowed,
  });
  const denied = response();
  await otherUser({ method: "GET", query: { requestId } }, denied);
  assert.equal(denied.statusCode, 404);
});

test("reviewed reports require reviewer access and a ready source package", async () => {
  const service = { from(table) {
    assert.equal(table, "properties");
    return { select() { return this; }, eq() { return this; }, is() { return this; },
      maybeSingle: async () => ({ data: { id: propertyId }, error: null }) };
  } };
  const base = { authenticate: async () => ({ user: { id: "owner" } }), serviceClient: () => service,
    loadSources: async () => [{ id: sourceId }] };
  const fieldHandler = createReviewedReportsHandler({ ...base,
    propertyAccess: async () => ({ rows: [{ org_id: orgId, role: "field", access_scope: "org" }] }) });
  const denied = response();
  await fieldHandler({ method: "POST", headers: {}, body: { orgId, propertyId, sourcePackageId: sourceId } }, denied);
  assert.equal(denied.statusCode, 403);

  const ownerHandler = createReviewedReportsHandler({ ...base,
    propertyAccess: async () => ({ rows: [{ org_id: orgId, role: "owner", access_scope: "org" }] }),
    loadSources: async () => [] });
  const missing = response();
  await ownerHandler({ method: "POST", headers: {}, body: { orgId, propertyId, sourcePackageId: sourceId } }, missing);
  assert.equal(missing.statusCode, 400);
});

test("reviewed report generation queues once and blocks another user's active build", async () => {
  let active = null;
  let inserted = null;
  let dispatched = 0;
  const service = { from(table) {
    if (table === "properties") return { select() { return this; }, eq() { return this; }, is() { return this; },
      maybeSingle: async () => ({ data: { id: propertyId }, error: null }) };
    assert.equal(table, "reviewed_report_requests");
    return { select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; },
      limit() { return this; }, maybeSingle: async () => ({ data: active, error: null }),
      insert(value) { inserted = value; return this; },
      single: async () => ({ data: { id: requestId, status: "queued", ...inserted }, error: null }) };
  } };
  const handler = createReviewedReportsHandler({
    authenticate: async () => ({ user: { id: "owner" } }), serviceClient: () => service,
    propertyAccess: async () => ({ rows: [{ org_id: orgId, role: "owner", access_scope: "org" }] }),
    loadSources: async () => [{ id: sourceId }],
    dispatch: async () => { dispatched += 1; return "starting"; },
  });
  const req = { method: "POST", headers: {}, body: { orgId, propertyId, sourcePackageId: sourceId } };
  const queued = response();
  await handler(req, queued);
  assert.equal(queued.statusCode, 202);
  assert.equal(queued.body.request.id, requestId);
  assert.equal(queued.body.dispatch, "starting");
  assert.equal(inserted.source_package_id, sourceId);
  assert.equal(dispatched, 1);

  active = { id: requestId, status: "generating", requested_by: "another", source_package_id: sourceId };
  const conflict = response();
  await handler(req, conflict);
  assert.equal(conflict.statusCode, 409);
  assert.equal(dispatched, 1);
});
