import test from "node:test";
import assert from "node:assert/strict";
import { createCurrentReviewedReportsHandler } from "../api/current-reviewed-reports.js";

const orgId = "11111111-1111-4111-8111-111111111111";
const propertyId = "22222222-2222-4222-8222-222222222222";
const sourceId = "33333333-3333-4333-8333-333333333333";
const requestId = "44444444-4444-4444-8444-444444444444";
const decisionId = "55555555-5555-4555-8555-555555555555";
const state = { package_id: sourceId, state_hash: "fresh-hash", unresolved_count: 0,
  session_completed_at: "2026-11-12T10:00:00Z",
  issue_states: [{ observation_id: "issue", status: "resolved" }],
  review_outcomes: [{ observation_id: "issue", status: "resolved", decision_activity_id: decisionId }] };

function response() {
  return { statusCode: 0, body: null, setHeader() {}, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
}

function fixture() {
  let currentState = state;
  let request = null;
  let latestReviewedAt = null;
  let reviewedDecisionIds = [decisionId];
  let latestAutomaticAt = "2026-11-12T10:01:00Z";
  let decisionAt = "2026-11-12T10:05:00Z";
  let inserted = null;
  let dispatched = 0;
  const service = {
    rpc: async (name, args) => {
      assert.equal(name, "current_reviewed_report_state");
      assert.deepEqual(args, { p_org_id: orgId, p_property_id: propertyId });
      return { data: currentState, error: null };
    },
    from(table) {
      if (table === "properties") return { select() { return this; }, eq() { return this; },
        is() { return this; }, maybeSingle: async () => ({ data: { id: propertyId }, error: null }) };
      if (table === "report_packages") return { select() { return this; }, eq() { return this; },
        maybeSingle: async () => ({ data: { completed_at: latestAutomaticAt }, error: null }) };
      if (table === "punchlist_activity") return { select() { return this; }, eq() { return this; },
        in(column, values) { assert.equal(column, "id"); assert.deepEqual(values, [decisionId]);
          return Promise.resolve({ data: [{ id: decisionId, created_at: decisionAt }], error: null }); } };
      assert.equal(table, "reviewed_report_requests");
      let readyOnly = false;
      return { select() { return this; }, eq(column, value) { if (column === "status" && value === "ready") readyOnly = true; return this; }, order() { return this; }, limit() { return this; },
        then(resolve) { return Promise.resolve({ data: readyOnly ? (latestReviewedAt ? [{ completed_at: latestReviewedAt,
          review_outcomes: reviewedDecisionIds.map((id) => ({ decision_activity_id: id })) }] : []) : (request ? [request] : []), error: null }).then(resolve); },
        insert(value) { inserted = value; return this; },
        single: async () => ({ data: { id: requestId, status: "queued", ...inserted }, error: null }),
      };
    },
  };
  const handler = createCurrentReviewedReportsHandler({
    authenticate: async () => ({ user: { id: "owner" } }),
    serviceClient: () => service,
    propertyAccess: async () => ({ rows: [{ org_id: orgId, role: "owner", access_scope: "org" }] }),
    dispatch: async () => { dispatched += 1; return "starting"; },
  });
  return { handler, setState(value) { currentState = value; }, setRequest(value) { request = value; },
    setDecisionAt(value) { decisionAt = value; }, setLatestReviewedAt(value) { latestReviewedAt = value; },
    setReviewedDecisionIds(value) { reviewedDecisionIds = value; },
    setLatestAutomaticAt(value) { latestAutomaticAt = value; },
    inserted: () => inserted, dispatched: () => dispatched };
}

async function call(handler, method) {
  const res = response();
  const req = method === "GET" ? { method, query: { orgId, propertyId } }
    : { method, headers: {}, body: { orgId, propertyId } };
  await handler(req, res);
  return res;
}

test("current reports use the latest property state and queue one package", async () => {
  const f = fixture();
  const available = await call(f.handler, "GET");
  assert.equal(available.statusCode, 200);
  assert.equal(available.body.available, true);
  const queued = await call(f.handler, "POST");
  assert.equal(queued.statusCode, 202);
  assert.equal(f.inserted().source_package_id, sourceId);
  assert.equal(f.inserted().current_state_hash, "fresh-hash");
  assert.equal(f.inserted().report_scope, "current_property");
  assert.equal(f.dispatched(), 1);
  f.setRequest({ id: requestId, status: "ready", result_package_id: sourceId });
  const ready = await call(f.handler, "GET");
  assert.equal(ready.body.request.status, "ready");
  assert.equal((await call(f.handler, "POST")).statusCode, 200);
  assert.equal(f.dispatched(), 1);
});

test("current reports can queue after a partial review", async () => {
  const f = fixture();
  f.setState({ ...state, unresolved_count: 1, issue_states: [
    { observation_id: "approved", status: "resolved" },
    { observation_id: "waiting", status: "pending_review" },
  ] });
  assert.equal((await call(f.handler, "GET")).body.available, true);
  assert.equal((await call(f.handler, "POST")).statusCode, 202);
  assert.equal(f.inserted().report_scope, "current_property");
  assert.equal(f.inserted().current_state_hash, "fresh-hash");
});

test("current reports do not queue before a review decision", async () => {
  const f = fixture();
  f.setState({ ...state, unresolved_count: 1, review_outcomes: [],
    issue_states: [{ observation_id: "waiting", status: "pending_review" }] });
  assert.equal((await call(f.handler, "GET")).body.available, false);
  assert.equal((await call(f.handler, "POST")).statusCode, 400);
  assert.equal(f.inserted(), null);
});

test("old decisions already covered by an automatic or reviewed report do not prompt another update", async () => {
  const f = fixture();
  f.setDecisionAt("2026-11-11T20:00:00Z");
  assert.equal((await call(f.handler, "GET")).body.available, false);
  f.setDecisionAt("2026-11-12T10:02:00Z");
  f.setLatestAutomaticAt("2026-11-12T10:03:00Z");
  assert.equal((await call(f.handler, "GET")).body.available, false);
  f.setDecisionAt("2026-11-12T10:05:00Z");
  f.setLatestReviewedAt("2026-11-12T10:06:00Z");
  assert.equal((await call(f.handler, "GET")).body.available, false);
  f.setReviewedDecisionIds([]);
  assert.equal((await call(f.handler, "GET")).body.available, true);
  f.setReviewedDecisionIds([decisionId]);
  assert.equal((await call(f.handler, "POST")).statusCode, 400);
  assert.equal(f.inserted(), null);
});

test("current reports require property reviewer access", async () => {
  const f = fixture();
  const denied = createCurrentReviewedReportsHandler({
    authenticate: async () => ({ user: { id: "field" } }),
    serviceClient: () => ({ from() { throw Error("Unauthorized data access"); } }),
    propertyAccess: async () => ({ rows: [{ org_id: orgId, role: "field", access_scope: "org" }] }),
  });
  assert.equal((await call(denied, "GET")).statusCode, 403);
  assert.equal((await call(f.handler, "GET")).statusCode, 200);
});
