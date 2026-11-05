import test from 'node:test';
import assert from 'node:assert/strict';
import { selectComparisonPackages, tenantPath } from '../api-lib/tenantComparison.js';
import { completePunchListRows, pagedRowsResult } from '../api/punch-list.js';
import { comparisonOptions, createTenantComparisonHandler } from '../api/tenant-comparison.js';
import { buildSnapshotPhotoMetadata } from '../api/_reportPortalShared.js';

const version = (id, day, sessionType = 'punchlist_visit') => ({ id, session_completed_at: `2026-10-${day}T12:00:00Z`, sessionType, org_id: 'org-a', property_id: 'property-a' });
test('latest version is automatic; a full baseline remains available after many selective visits', () => {
  const versions = [version('latest', 30), ...Array.from({ length: 20 }, (_, i) => version(`partial-${i}`, 29 - i)), version('baseline', '01', 'full_documentation')];
  assert.equal(selectComparisonPackages(versions, 'baseline').after.id, 'latest');
  assert.equal(selectComparisonPackages(versions, 'baseline', 'partial-4').after.id, 'partial-4');
});
test('comparison rejects same version, partial baseline, reversed dates, and cross-scope pairs', () => {
  const versions = [version('latest', 30), version('baseline', '01', 'full_documentation')];
  assert.throws(() => selectComparisonPackages(versions, 'latest'));
  assert.throws(() => selectComparisonPackages(versions, 'baseline', 'baseline'));
  assert.throws(() => selectComparisonPackages([version('b', 30, 'full_documentation'), version('a', '01')], 'b', 'a'));
  for (const field of ['org_id', 'property_id']) {
    assert.throws(() => selectComparisonPackages([{ ...versions[0], [field]: 'other' }, versions[1]], 'baseline'));
  }
});
test('complete punchlist includes open, pending review, and resolved without changing photo dates', () => {
  const rows = [{ id: 'r', status: 'resolved', trade: 'general', capturedAt: '2026-10-01' },
    { id: 'p', status: 'pending_review', trade: 'general', capturedAt: '2026-10-02' },
    { id: 'o', status: 'active', trade: 'general', capturedAt: '2026-10-03' }];
  const result = completePunchListRows(rows);
  assert.equal(result.length, 3);
  assert.equal(result.at(-1).id, 'r');
  assert.equal(result.find((r) => r.id === 'p').pdfStatusGroup, 'Pending Review');
  assert.equal(result.find((r) => r.id === 'r').capturedAt, '2026-10-01');
  assert.equal(rows[0].pdfStatusGroup, undefined);
});
test('complete export pagination includes rows beyond the old 250 row cap and fails closed on query errors', async () => {
  const all = Array.from({ length: 1201 }, (_, id) => ({ id }));
  const result = await pagedRowsResult({ range: async (a, b) => ({ data: all.slice(a, b + 1), error: null }) });
  assert.equal(result.data.length, 1201);
  assert.deepEqual(await pagedRowsResult({ range: async () => ({ error: 'denied' }) }), { data: null, error: 'denied' });
});
test('tenant output uses a distinct property-scoped temporary path', () => {
  assert.equal(tenantPath({ org_id: 'o', property_id: 'p', id: 'r' }), 'orgs/o/properties/p/tenant-comparisons/r.pdf');
});

const uuid = '11111111-1111-1111-1111-111111111111';
function statusHarness({ user = 'user', allowed = true, row = null, property = true } = {}) {
  const calls = [];
  const service = {
    from(table) {
      const query = { select() { return this; }, eq(column, value) { calls.push([table, column, value]); return this; }, is() { return this; },
        async maybeSingle() { return { data: table === 'properties' ? (property ? { id: uuid } : null) : row, error: null }; } };
      return query;
    },
    storage: { from(bucket) { return { async createSignedUrl(path, seconds) { calls.push([bucket, path, seconds]); return { data: { signedUrl: 'https://example.test/download' }, error: null }; } }; } },
  };
  const handler = createTenantComparisonHandler({ authenticate: async () => user ? { user: { id: user } } : { error: 'Authentication required.' },
    serviceClient: () => service, propertyAccess: async () => ({ canAccessProperty: () => allowed }) });
  const res = { statusCode: null, body: null, setHeader() {}, status(value) { this.statusCode = value; return this; }, json(body) { this.body = body; return this; } };
  return { handler, res, calls };
}
test('temporary tenant download rejects unauthenticated, wrong-user, inaccessible-property and expired requests', async () => {
  const row = { id: uuid, requested_by: 'user', org_id: uuid, property_id: uuid, status: 'ready', expires_at: new Date(Date.now() + 60000).toISOString() };
  row.storage_path = tenantPath(row);
  for (const [options, status] of [[{ user: null }, 401], [{ user: 'other', row }, 404], [{ allowed: false, row }, 404],
    [{ row, property: false }, 404], [{ row: { ...row, expires_at: '2000-01-01' } }, 410], [{ row: { ...row, storage_path: 'other-property/file.pdf' } }, 404]]) {
    const h = statusHarness(options);
    await h.handler({ method: 'GET', query: { requestId: uuid } }, h.res);
    assert.equal(h.res.statusCode, status);
    assert.equal(h.calls.some((call) => call[0] === 'scoutcapture-on-demand'), false);
  }
});
test('authorized tenant download signs only its expected temporary path and bounds expiry', async () => {
  const row = { id: uuid, requested_by: 'user', org_id: uuid, property_id: uuid, status: 'ready', expires_at: new Date(Date.now() + 60000).toISOString() };
  row.storage_path = tenantPath(row);
  const h = statusHarness({ row });
  await h.handler({ method: 'GET', query: { requestId: uuid } }, h.res);
  assert.equal(h.res.statusCode, 200);
  assert.equal(h.res.body.downloadUrl, 'https://example.test/download');
  const call = h.calls.find((call) => call[0] === 'scoutcapture-on-demand');
  assert.ok(call[2] > 0 && call[2] <= 60);
});

test('the baseline selector reads every page after hundreds of selective visits', async () => {
  const packages = Array.from({ length: 271 }, (_, i) => ({ id: `package-${i}`, session_id: `session-${i}`,
    org_id: 'org-a', property_id: 'property-a', package_session_type: i === 270 ? 'full_documentation' : 'punchlist_visit' }));
  const service = { from(table) {
    let ids = [];
    return { select() { return this; }, eq(column, value) {
      if (column === 'org_id') assert.equal(value, 'org-a');
      if (column === 'property_id') assert.equal(value, 'property-a');
      return this;
    }, is() { return this; }, order() { return this; }, in(column, value) { ids = value; return this; },
    range(a, b) { return Promise.resolve({ data: packages.slice(a, b + 1), error: null }); },
    then(resolve) { assert.equal(table, 'report_package_files'); return Promise.resolve({ data: ids.map((package_id) => ({ package_id })), error: null }).then(resolve); } };
  } };
  const result = await comparisonOptions(service, 'org-a', 'property-a');
  assert.equal(result.length, 271);
  assert.equal(result.at(-1).sessionType, 'full_documentation');
});
test('missing session types do not fabricate full baselines', () => {
  assert.equal(buildSnapshotPhotoMetadata({ shots: [{ id: 'photo', isFlagged: true }] }).isFullBaseline, false);
  assert.equal(buildSnapshotPhotoMetadata({ sessionType: 'punchlist_visit', guidedShots: [{ id: 'old-guided' }] }).isFullBaseline, false);
  assert.equal(buildSnapshotPhotoMetadata({ sessionType: 'full_documentation', shots: [] }).isFullBaseline, true);
});
