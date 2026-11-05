import test from 'node:test';
import assert from 'node:assert/strict';
import { activeTenantRequest, tenantRequestSummary, createTenantComparisonHandler } from '../api/tenant-comparison.js';
import { tenantPath } from '../api-lib/tenantComparison.js';
import { restoredComparisonSelection, matchingComparisonRequest, comparisonProgressMessage } from '../src/lib/tenantComparisonDisplay.js';

const org = '11111111-1111-1111-1111-111111111111';
const property = '22222222-2222-2222-2222-222222222222';
const before = '33333333-3333-3333-3333-333333333333';
const after = '44444444-4444-4444-4444-444444444444';
const id = '55555555-5555-5555-5555-555555555555';
const row = { id, org_id: org, property_id: property, requested_by: 'user', kind: 'tenant_comparison', renderer_version: 'tenant-comparison-v2', before_package_id: before, after_package_id: after,
  status: 'generating', progress_step: 'rendering', expires_at: new Date(Date.now() + 86400000).toISOString() };
function harness(rows = [row], allowed = true) {
  const queries = [];
  const service = { from(table) {
    const filters = [];
    queries.push({ table, filters });
    return { select() { return this; }, eq(k,v) { filters.push([k,'eq',v]); return this; }, is(k,v) { filters.push([k,'eq',v]); return this; },
      in(k,v) { filters.push([k,'in',v]); return this; }, gt(k,v) { filters.push([k,'gt',v]); return this; },
      order() { return this; }, limit() { return this; }, async maybeSingle() {
        if (table === 'properties') return { data: allowed ? { id: property } : null };
        return { data: rows.find((item) => filters.every(([k,op,v]) => op === 'in' ? v.includes(item[k]) : op === 'gt' ? Date.parse(item[k]) > Date.parse(v) : item[k] === v)) || null };
      } };
  } };
  const handler = createTenantComparisonHandler({ authenticate: async () => ({ user: { id: 'user' } }), serviceClient: () => service,
    propertyAccess: async () => ({ canAccessProperty: () => allowed }) });
  const res = { setHeader() {}, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; } };
  return { handler, res, service, queries };
}
test('a fresh page discovers the server request and current step without creating another job', async () => {
  const h = harness();
  await h.handler({ method: 'GET', headers: {}, query: { orgId: org, propertyId: property, lookup: '1', beforePackageId: before, afterPackageId: after } }, h.res);
  assert.equal(h.res.statusCode, 200);
  assert.deepEqual(h.res.body.request, tenantRequestSummary(row));
  assert.equal(h.res.body.request.progressStep, 'rendering');
  assert.equal(comparisonProgressMessage(h.res.body.request), 'Creating the side-by-side comparison PDF…');
  assert.ok(h.queries.find((q) => q.table === 'on_demand_report_requests').filters.some(([k,,v]) => k === 'requested_by' && v === 'user'));
});
test('collapsed property cards discover progress without loading report history or generating a PDF', async () => {
  const h = harness();
  await h.handler({ method: 'GET', headers: {}, query: { orgId: org, propertyId: property, current: '1' } }, h.res);
  assert.equal(h.res.statusCode, 200);
  assert.equal(h.res.body.request.requestId, id);
  assert.equal(h.res.body.request.progressStep, 'rendering');
  assert.deepEqual(h.queries.map((q) => q.table), ['properties', 'on_demand_report_requests']);
  const denied = harness([row], false);
  await denied.handler({ method: 'GET', headers: {}, query: { orgId: org, propertyId: property, current: '1' } }, denied.res);
  assert.equal(denied.res.statusCode, 404);
  assert.equal(denied.queries.length, 0);
});
test('revisiting a completed comparison restores Download through the entire 24-hour window', async () => {
  const ready = { ...row, status: 'ready', progress_step: 'ready' };
  ready.storage_path = tenantPath(ready);
  const h = harness([ready]);
  const found = tenantRequestSummary(await activeTenantRequest(h.service, 'user', org, property, before, after));
  assert.equal(found.status, 'ready');
  assert.equal(matchingComparisonRequest(found, before, after, Date.now() + 23 * 3600000).requestId, id);
  assert.equal(matchingComparisonRequest(found, before, after, Date.now() + 25 * 3600000), null);
  assert.equal(matchingComparisonRequest(found, after, before), null);
});
test('request lookup excludes other users, organizations, properties, kinds, renderer versions, pairs, and expired outputs', async () => {
  for (const changed of [{ requested_by: 'other' }, { org_id: 'other' }, { property_id: 'other' }, { kind: 'punchlist_all' },
    { renderer_version: 'legacy' }, { before_package_id: after }, { after_package_id: before }, { expires_at: '2000-01-01' }]) {
    const h = harness([{ ...row, ...changed }]);
    assert.equal(await activeTenantRequest(h.service, 'user', org, property, before, after), null);
  }
  const h = harness([{ ...row, status: 'ready', storage_path: 'other-property/report.pdf' }]);
  assert.equal(await activeTenantRequest(h.service, 'user', org, property, before, after), null);
});
test('failed comparisons can be displayed but are not reused when Generate retries', async () => {
  const h = harness([{ ...row, status: 'failed', progress_step: 'failed' }]);
  assert.equal(await activeTenantRequest(h.service, 'user', org, property, before, after), null);
  assert.equal((await activeTenantRequest(h.service, 'user', org, property, before, after, true)).status, 'failed');
});
test('revisit restores the actual requested versions including a custom end date', () => {
  const versions = [{ id: 'newest', sessionType: 'punchlist_visit' }, { id: after, sessionType: 'punchlist_visit' }, { id: before, sessionType: 'full_documentation' }];
  assert.deepEqual(restoredComparisonSelection(versions, tenantRequestSummary(row)), { beforeId: before, afterId: after, customEnd: true });
  assert.deepEqual(restoredComparisonSelection(versions, null), { beforeId: before, afterId: 'newest', customEnd: false });
});
