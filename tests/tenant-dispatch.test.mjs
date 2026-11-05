import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchTenantRequest } from '../api-lib/tenantDispatch.js';

function database(claim = true) {
  const updates = [];
  return { updates, from(table) {
    assert.equal(table, 'on_demand_report_requests');
    return { update(value) { updates.push(value); return this; }, eq() { return this; },
      or(value) { assert.match(value, /locked_at\.is\.null/); return this; }, select() { return this; },
      maybeSingle: async () => ({ data: claim ? { id: 'request' } : null, error: null }),
      then(resolve) { return Promise.resolve({ error: null }).then(resolve); } };
  } };
}
test('immediate dispatch supplies standard Supabase headers and retries use an atomic one-minute lease', async () => {
  const service = database();
  const status = await dispatchTenantRequest(service, 'request', { origin: 'https://example.supabase.co/', serviceKey: 'server-key',
    fetcher: async (url, options) => {
      assert.equal(url, 'https://example.supabase.co/functions/v1/report-package-dispatch');
      assert.equal(options.headers.apikey, 'server-key');
      assert.equal(options.headers.Authorization, 'Bearer server-key');
      assert.equal(options.headers['x-scoutcapture-service-key'], 'server-key');
      assert.equal(JSON.parse(options.body).tenant_comparison_request_id, 'request');
      return { ok: true };
    } });
  assert.equal(status, 'starting');
  assert.ok(service.updates[0].locked_at);
  assert.equal(service.updates[1].last_error, null);
  assert.equal(await dispatchTenantRequest(database(false), 'request', { origin: 'https://example.test', serviceKey: 'key', fetcher: () => { throw Error('must not dispatch twice'); } }), 'waiting');
});
test('dispatch errors are retained for retry instead of silently stranding the request', async () => {
  const service = database();
  assert.equal(await dispatchTenantRequest(service, 'request', { origin: 'https://example.test', serviceKey: 'key', fetcher: async () => ({ ok: false, status: 502 }) }), 'retrying');
  assert.equal(service.updates.at(-1).last_error, 'dispatch_http_502');
});
