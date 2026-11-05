/* global process */
export async function dispatchTenantRequest(service, requestId, {
  fetcher = fetch, origin = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY, now = new Date(),
} = {}) {
  if (!origin || !serviceKey) return 'retrying';
  const cutoff = new Date(now.getTime() - 60000).toISOString();
  const { data, error } = await service.from('on_demand_report_requests').update({ locked_at: now.toISOString() })
    .eq('id', requestId).eq('status', 'queued').or(`locked_at.is.null,locked_at.lt.${cutoff}`).select('id').maybeSingle();
  if (error || !data) return 'waiting';
  try {
    const response = await fetcher(`${origin.replace(/\/$/, '')}/functions/v1/report-package-dispatch`, {
      method: 'POST', headers: { 'content-type': 'application/json', apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`, 'x-scoutcapture-service-key': serviceKey },
      body: JSON.stringify({ tenant_comparison_request_id: requestId }), signal: AbortSignal.timeout(8000),
    });
    if (response.ok) {
      await service.from('on_demand_report_requests').update({ last_error: null }).eq('id', requestId).eq('status', 'queued');
      return 'starting';
    }
    await service.from('on_demand_report_requests').update({ last_error: `dispatch_http_${response.status}` }).eq('id', requestId).eq('status', 'queued');
    console.warn(JSON.stringify({ event: 'tenant_dispatch_retry', requestId, status: response.status }));
  } catch {
    await service.from('on_demand_report_requests').update({ last_error: 'dispatch_unavailable' }).eq('id', requestId).eq('status', 'queued');
    console.warn(JSON.stringify({ event: 'tenant_dispatch_retry', requestId, reason: 'unavailable' }));
  }
  return 'retrying';
}
