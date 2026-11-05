import { authenticateRequest, createServiceClient, getQueryValue, loadUserPortalPropertyAccess,
  loadSnapshotPhotoMetadataBatch, methodAllowed, sendJson } from './_reportPortalShared.js';
import { isUuid, TENANT_BUCKET, tenantPath, selectComparisonPackages } from '../api-lib/tenantComparison.js';

export async function comparisonOptions(service, orgId, propertyId) {
  const packages = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await service.from('report_packages')
      .select('id,org_id,property_id,session_id,snapshot_id,session_completed_at,completed_at,package_session_type:manifest->>session_type')
      .eq('org_id', orgId).eq('property_id', propertyId).eq('status', 'ready').is('deleted_at', null)
      .order('session_completed_at', { ascending: false }).order('id').range(offset, offset + 99);
    if (error) throw error;
    if (!data?.length) break;
    const { data: files, error: fileError } = await service.from('report_package_files').select('package_id')
      .in('package_id', (data || []).map((p) => p.id)).eq('org_id', orgId).eq('property_id', propertyId)
      .eq('report_type', 'property_report').is('deleted_at', null).is('storage_deleted_at', null);
    if (fileError) throw fileError;
    const available = new Set((files || []).map((f) => f.package_id));
    const unknown = data.filter((row) => !['full_documentation', 'punchlist_visit'].includes(row.package_session_type));
    const metadata = await loadSnapshotPhotoMetadataBatch(service, unknown);
    const legacy = new Map(unknown.map((row, i) => [row.id, metadata[i]]));
    data.forEach((row) => {
      // Missing or unreadable snapshots must not silently become full baselines.
      const sessionType = ['full_documentation', 'punchlist_visit'].includes(row.package_session_type) ? row.package_session_type :
        (legacy.get(row.id) ? (legacy.get(row.id).isFullBaseline ? 'full_documentation' : 'punchlist_visit') : null);
      if (sessionType && available.has(row.id)) packages.push({ ...row, sessionType });
    });
    if ((data || []).length < 100) break;
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
      if (row.status !== 'ready') return sendJson(res, 200, { status: row.status, requestId: row.id });
      if (row.storage_path !== tenantPath(row)) return sendJson(res, 404, { error: 'Download unavailable.' });
      const seconds = Math.min(300, Math.floor((new Date(row.expires_at).getTime() - Date.now()) / 1000));
      if (seconds < 1) return sendJson(res, 410, { error: 'This temporary download expired. Generate it again.' });
      const { data, error: signingError } = await service.storage.from(TENANT_BUCKET).createSignedUrl(row.storage_path, seconds, { download: row.filename });
      if (signingError) throw signingError;
      return sendJson(res, 200, { status: 'ready', downloadUrl: data.signedUrl, filename: row.filename });
    }
    const body = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}) : {};
    const orgId = body.orgId || getQueryValue(req, 'orgId');
    const propertyId = body.propertyId || getQueryValue(req, 'propertyId');
    if (!isUuid(orgId) || !isUuid(propertyId)) return sendJson(res, 400, { error: 'Select a property and organization.' });
    if (!access.canAccessProperty(orgId, propertyId)) return sendJson(res, 404, { error: 'Property not found.' });
    const { data: property, error: propertyError } = await service.from('properties').select('id').eq('id', propertyId).eq('org_id', orgId).is('deleted_at', null).maybeSingle();
    if (propertyError) throw propertyError;
    if (!property) return sendJson(res, 404, { error: 'Property not found.' });
    const packages = await comparisonOptions(service, orgId, propertyId);
    if (req.method === 'GET') return sendJson(res, 200, { versions: packages.map((p) => ({ id: p.id, sessionType: p.sessionType, date: p.session_completed_at, sessionId: p.session_id })) });
    let selected;
    try { selected = selectComparisonPackages(packages, body.beforePackageId, body.afterPackageId); }
    catch (error) { return sendJson(res, 400, { error: error.message }); }
    // Reuse this user's active request to avoid duplicate worker builds on double-click/reload.
    const { data: existing, error: existingError } = await service.from('on_demand_report_requests').select('id,status')
      .eq('org_id', orgId).eq('property_id', propertyId).eq('requested_by', auth.user.id)
      .eq('before_package_id', selected.before.id).eq('after_package_id', selected.after.id)
      .in('status', ['queued', 'generating', 'ready']).gt('expires_at', new Date().toISOString()).order('requested_at', { ascending: false }).limit(1);
    if (existingError) throw existingError;
    if (existing?.[0]) return sendJson(res, 202, { requestId: existing[0].id, status: existing[0].status });
    const { data: row, error } = await service.from('on_demand_report_requests').insert({ org_id: orgId, property_id: propertyId,
      requested_by: auth.user.id, before_package_id: selected.before.id, after_package_id: selected.after.id }).select('id,status').single();
    if (error) throw error;
    // The authenticated function dispatches the existing report worker. Scheduled polling is the fallback.
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    await fetch(`${url}/functions/v1/report-package-dispatch`, { method: 'POST', headers: {
      'content-type': 'application/json', 'x-scoutcapture-service-key': process.env.SUPABASE_SERVICE_ROLE_KEY,
    }, body: JSON.stringify({ tenant_comparison_request_id: row.id }), signal: AbortSignal.timeout(8000) }).catch(() => {});
    return sendJson(res, 202, { requestId: row.id, status: row.status });
  } catch {
    return sendJson(res, 500, { error: 'Unable to prepare tenant comparison.' });
  }
}
}

export default createTenantComparisonHandler();
