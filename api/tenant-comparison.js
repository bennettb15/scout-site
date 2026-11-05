import { authenticateRequest, createServiceClient, getQueryValue, loadUserPortalPropertyAccess,
  loadSnapshotPhotoMetadataBatch, methodAllowed, sendJson } from './_reportPortalShared.js';
import { isUuid, TENANT_BUCKET, TENANT_RENDER_VERSION, tenantPath, selectComparisonPackages } from '../api-lib/tenantComparison.js';
import { dispatchTenantRequest } from '../api-lib/tenantDispatch.js';

export function tenantRequestSummary(row) {
  if (!row) return null;
  return { requestId: row.id, status: row.status, beforePackageId: row.before_package_id,
    afterPackageId: row.after_package_id, expiresAt: row.expires_at, progressStep: row.progress_step || row.status };
}

export async function activeTenantRequest(service, userId, orgId, propertyId, beforeId = null, afterId = null, includeFailed = false) {
  let query = service.from('on_demand_report_requests').select('*')
    .eq('org_id', orgId).eq('property_id', propertyId).eq('requested_by', userId)
    .eq('kind', 'tenant_comparison').eq('renderer_version', TENANT_RENDER_VERSION)
    .in('status', includeFailed ? ['queued', 'generating', 'ready', 'failed'] : ['queued', 'generating', 'ready']).gt('expires_at', new Date().toISOString());
  if (beforeId) query = query.eq('before_package_id', beforeId);
  if (afterId) query = query.eq('after_package_id', afterId);
  const { data, error } = await query.order('requested_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  // Never advertise a ready file outside the expected private request path.
  if (data?.status === 'ready' && data.storage_path !== tenantPath(data)) return null;
  return data;
}

export async function comparisonOptions(service, orgId, propertyId, { onlyIds = null, latestOnly = false } = {}) {
  const packages = [];
  const pageSize = latestOnly ? 10 : 100;
  for (let offset = 0; ; offset += pageSize) {
    let query = service.from('report_packages')
      .select('id,org_id,property_id,session_id,snapshot_id,session_completed_at,completed_at,package_session_type:manifest->>session_type')
      .eq('org_id', orgId).eq('property_id', propertyId).eq('status', 'ready').is('deleted_at', null)
      .order('session_completed_at', { ascending: false }).order('id');
    if (onlyIds) query = query.in('id', onlyIds);
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    const { data: files, error: fileError } = await service.from('report_package_files').select('package_id')
      .in('package_id', (data || []).map((p) => p.id)).eq('org_id', orgId).eq('property_id', propertyId)
      .eq('report_type', 'property_report').is('deleted_at', null).is('storage_deleted_at', null);
    if (fileError) throw fileError;
    const available = new Set((files || []).map((f) => f.package_id));
    const candidates = latestOnly ? data.filter((row) => available.has(row.id)).slice(0, 1) : data;
    const unknown = candidates.filter((row) => !['full_documentation', 'punchlist_visit'].includes(row.package_session_type));
    const metadata = await loadSnapshotPhotoMetadataBatch(service, unknown);
    const legacy = new Map(unknown.map((row, i) => [row.id, metadata[i]]));
    candidates.forEach((row) => {
      // Missing or unreadable snapshots must not silently become full baselines.
      const sessionType = ['full_documentation', 'punchlist_visit'].includes(row.package_session_type) ? row.package_session_type :
        (legacy.get(row.id) ? (legacy.get(row.id).isFullBaseline ? 'full_documentation' : 'punchlist_visit') : null);
      if (sessionType && available.has(row.id)) packages.push({ ...row, sessionType });
    });
    if ((latestOnly && packages.length) || data.length < pageSize || onlyIds) break;
  }
  const seen = new Set();
  return packages.filter((p) => !seen.has(p.session_id) && seen.add(p.session_id));
}

export function createTenantComparisonHandler({ authenticate = authenticateRequest, serviceClient = createServiceClient, propertyAccess = loadUserPortalPropertyAccess } = {}) {
return async function handler(req, res) {
  if (!methodAllowed(req, res, ['GET', 'POST', 'OPTIONS'])) return;
  try {
    const auth = await authenticate(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });
    const service = serviceClient();
    const access = await propertyAccess(service, auth.user);
    if (req.method === 'GET' && getQueryValue(req, 'requestId')) {
      const id = getQueryValue(req, 'requestId');
      if (!isUuid(id)) return sendJson(res, 400, { error: 'Invalid request.' });
      const { data: row, error } = await service.from('on_demand_report_requests').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!row || row.requested_by !== auth.user.id || !access.canAccessProperty(row.org_id, row.property_id)) return sendJson(res, 404, { error: 'Report request not found.' });
      const { data: property } = await service.from('properties').select('id').eq('id', row.property_id).eq('org_id', row.org_id).is('deleted_at', null).maybeSingle();
      if (!property) return sendJson(res, 404, { error: 'Property not found.' });
      if (new Date(row.expires_at).getTime() <= Date.now()) return sendJson(res, 410, { error: 'This temporary download expired. Generate it again.' });
      if (row.status === 'failed') return sendJson(res, 200, { status: 'failed', error: 'The comparison could not be generated. Please try again.' });
      if (row.status !== 'ready') {
        const dispatch = row.status === 'queued' ? await dispatchTenantRequest(service, row.id) : null;
        return sendJson(res, 200, { ...tenantRequestSummary(row), dispatch, dispatchDelayed: String(row.last_error || '').startsWith('dispatch_') });
      }
      if (row.storage_path !== tenantPath(row)) return sendJson(res, 404, { error: 'Download unavailable.' });
      const seconds = Math.min(300, Math.floor((new Date(row.expires_at).getTime() - Date.now()) / 1000));
      if (seconds < 1) return sendJson(res, 410, { error: 'This temporary download expired. Generate it again.' });
      const { data, error: signingError } = await service.storage.from(TENANT_BUCKET).createSignedUrl(row.storage_path, seconds, { download: row.filename });
      if (signingError) throw signingError;
      return sendJson(res, 200, { ...tenantRequestSummary(row), downloadUrl: data.signedUrl, filename: row.filename });
    }
    const body = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}) : {};
    const orgId = body.orgId || getQueryValue(req, 'orgId');
    const propertyId = body.propertyId || getQueryValue(req, 'propertyId');
    if (!isUuid(orgId) || !isUuid(propertyId)) return sendJson(res, 400, { error: 'Select a property and organization.' });
    if (!access.canAccessProperty(orgId, propertyId)) return sendJson(res, 404, { error: 'Property not found.' });
    const { data: property, error: propertyError } = await service.from('properties').select('id').eq('id', propertyId).eq('org_id', orgId).is('deleted_at', null).maybeSingle();
    if (propertyError) throw propertyError;
    if (!property) return sendJson(res, 404, { error: 'Property not found.' });
    if (req.method === 'GET') {
      if (getQueryValue(req, 'lookup') === '1') {
        const beforeId = getQueryValue(req, 'beforePackageId');
        const afterId = getQueryValue(req, 'afterPackageId');
        if (!isUuid(beforeId) || !isUuid(afterId)) return sendJson(res, 400, { error: 'Choose valid report versions.' });
        const row = await activeTenantRequest(service, auth.user.id, orgId, propertyId, beforeId, afterId, true);
        const dispatch = row?.status === 'queued' ? await dispatchTenantRequest(service, row.id) : null;
        return sendJson(res, 200, { request: tenantRequestSummary(row), dispatch,
          dispatchDelayed: String(row?.last_error || '').startsWith('dispatch_') });
      }
      const [packages, latest] = await Promise.all([
        comparisonOptions(service, orgId, propertyId), activeTenantRequest(service, auth.user.id, orgId, propertyId),
      ]);
      return sendJson(res, 200, { versions: packages.map((p) => ({ id: p.id, sessionType: p.sessionType, date: p.session_completed_at, sessionId: p.session_id })), latestRequest: tenantRequestSummary(latest) });
    }
    if (!isUuid(body.beforePackageId) || (body.afterPackageId && !isUuid(body.afterPackageId))) return sendJson(res, 400, { error: 'Choose valid report versions.' });
    const [before, after] = await Promise.all([
      comparisonOptions(service, orgId, propertyId, { onlyIds: [body.beforePackageId] }),
      comparisonOptions(service, orgId, propertyId, body.afterPackageId ? { onlyIds: [body.afterPackageId] } : { latestOnly: true }),
    ]);
    const packages = [...after, ...before];
    let selected;
    try { selected = selectComparisonPackages(packages, body.beforePackageId, body.afterPackageId); }
    catch (error) { return sendJson(res, 400, { error: error.message }); }
    // Reuse this user's active request to avoid duplicate worker builds on double-click/reload.
    const existing = await activeTenantRequest(service, auth.user.id, orgId, propertyId, selected.before.id, selected.after.id);
    if (existing) {
      if (existing.status === 'queued') await dispatchTenantRequest(service, existing.id);
      return sendJson(res, 202, tenantRequestSummary(existing));
    }
    const { data: row, error } = await service.from('on_demand_report_requests').insert({ org_id: orgId, property_id: propertyId,
      requested_by: auth.user.id, renderer_version: TENANT_RENDER_VERSION, before_package_id: selected.before.id, after_package_id: selected.after.id }).select('*').single();
    if (error) throw error;
    // The authenticated function dispatches the existing report worker. Scheduled polling is the fallback.
    await dispatchTenantRequest(service, row.id);
    return sendJson(res, 202, tenantRequestSummary(row));
  } catch {
    return sendJson(res, 500, { error: 'Unable to prepare tenant comparison.' });
  }
}
}

export default createTenantComparisonHandler();
