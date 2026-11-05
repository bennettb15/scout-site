import { useEffect, useState } from 'react';
import { FileText, ChevronDown, Download, RefreshCw } from 'lucide-react';
import { restoredComparisonSelection, matchingComparisonRequest, comparisonProgressMessage } from '../lib/tenantComparisonDisplay.js';

const dateLabel = (value) => value ? new Date(value).toLocaleString() : 'Unknown date';
const generationStyle = 'border border-blue-200 bg-blue-50 text-[var(--brand)] hover:bg-blue-100';

export default function TenantComparisonControl({ orgId, propertyId, propertyName, accessToken }) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState([]);
  const [selection, setSelection] = useState({ beforeId: '', afterId: '', customEnd: false });
  const [request, setRequest] = useState(null);
  const [delayed, setDelayed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [acting, setActing] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const { beforeId, afterId, customEnd } = selection;
  const selectedAfter = customEnd ? afterId : versions[0]?.id;
  const current = matchingComparisonRequest(request, beforeId, selectedAfter);
  const processing = current && ['queued', 'generating'].includes(current.status);
  const ready = current?.status === 'ready';
  const validSelection = beforeId && selectedAfter && beforeId !== selectedAfter;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    fetch(`/api/tenant-comparison?${new URLSearchParams({ orgId, propertyId })}`, {
      headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal,
    }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to load report versions.');
      if (controller.signal.aborted) return;
      const options = body.versions || [];
      setVersions(options);
      setSelection((currentSelection) => options.some((v) => v.id === currentSelection.beforeId) ? currentSelection : restoredComparisonSelection(options, body.latestRequest));
      setRequest(body.latestRequest || null);
    }).catch((e) => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, orgId, propertyId, accessToken]);

  useEffect(() => {
    const check = () => { if (!document.hidden) setRefresh((value) => value + 1); };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => { window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, []);

  useEffect(() => {
    if (!open || loading || !validSelection) return;
    const controller = new AbortController();
    let timer;
    async function poll() {
      setChecking(true);
      try {
        const params = new URLSearchParams({ orgId, propertyId, lookup: '1', beforePackageId: beforeId, afterPackageId: selectedAfter });
        const response = await fetch(`/api/tenant-comparison?${params}`, {
          headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to check the report status.');
        if (controller.signal.aborted) return;
        setRequest(body.request || null); setDelayed(body.dispatch === 'retrying' || body.dispatchDelayed);
        setError(body.request?.status === 'failed' ? 'The comparison could not be completed. Generate it again to retry.' : '');
        if (body.request && ['queued', 'generating'].includes(body.request.status)) timer = setTimeout(poll, 4000);
        else if (body.request?.status === 'ready') timer = setTimeout(poll, Math.max(1000, Math.min(60000, Date.parse(body.request.expiresAt) - Date.now())));
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(`${e.message} Your submitted report continues on the server. Checking again shortly.`);
          timer = setTimeout(poll, 10000);
        }
      } finally { if (!controller.signal.aborted) setChecking(false); }
    }
    poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [open, loading, validSelection, orgId, propertyId, accessToken, beforeId, selectedAfter, refresh]);

  async function act() {
    setActing(true); setError('');
    try {
      if (ready) {
        const response = await fetch(`/api/tenant-comparison?requestId=${encodeURIComponent(current.requestId)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
        const body = await response.json();
        if (!response.ok || !body.downloadUrl) {
          if (response.status === 410) { setRequest(null); setRefresh((value) => value + 1); }
          throw new Error(body.error || 'Unable to download the comparison.');
        }
        window.location.assign(body.downloadUrl);
      } else {
        const response = await fetch('/api/tenant-comparison', { method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgId, propertyId, beforePackageId: beforeId, afterPackageId: selectedAfter }),
        });
        const body = await response.json();
        if (!response.ok || !body.requestId) throw new Error(body.error || 'Unable to request comparison.');
        setRequest(body); setRefresh((value) => value + 1);
      }
    } catch (e) { setError(e.message); }
    finally { setActing(false); }
  }

  return <section className="border-t border-border py-3">
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`Tenant Comparison PDF for ${propertyName || 'this property'}`} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm ${generationStyle}`}>
      <FileText className="h-4 w-4" />Tenant Comparison PDF<ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div className="mt-3 grid gap-3">
      <p className="text-sm text-foreground/65">Compare a full documentation baseline with the latest Property Report, including punchlist updates. Each photo keeps its capture date.</p>
      <label className="grid gap-1 text-sm font-medium">Compare from
        <select value={beforeId} onChange={(e) => setSelection({ ...selection, beforeId: e.target.value })} disabled={acting || loading} className="rounded-md border border-border p-2">
          <option value="">Choose a Full Documentation session</option>
          {versions.filter((v) => v.sessionType === 'full_documentation').map((v) => <option key={v.id} value={v.id}>{dateLabel(v.date)} — Full Documentation</option>)}
        </select>
      </label>
      <div className="text-sm">Compare to: <strong>{customEnd ? `Selected report version (${dateLabel(versions.find((v) => v.id === afterId)?.date)})` : `Latest Property Report (${dateLabel(versions[0]?.date)})`}</strong></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={customEnd} disabled={acting || loading} onChange={(e) => setSelection({ ...selection, customEnd: e.target.checked })} />Choose a different end date</label>
      {customEnd && <label className="grid gap-1 text-sm font-medium">End report version
        <select value={afterId} disabled={acting || loading} onChange={(e) => setSelection({ ...selection, afterId: e.target.value })} className="rounded-md border border-border p-2">
          {versions.map((v) => <option key={v.id} value={v.id}>{dateLabel(v.date)} — {v.sessionType === 'full_documentation' ? 'Full Documentation' : 'Punchlist Visit'}</option>)}
        </select>
      </label>}
      {loading && <p role="status" className="text-sm text-foreground/65">Loading report versions…</p>}
      {versions.length < 2 && !loading && <p className="text-sm text-foreground/65">Two report versions are needed for a comparison.</p>}
      <p className="text-sm text-foreground/65">Larger properties may take longer. You can leave this page or close your browser while your report is prepared. Return here to check progress or download it.</p>
      <button type="button" disabled={acting || loading || processing || (checking && !ready) || !validSelection} onClick={act}
        className={`inline-flex min-h-10 w-fit items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60 ${ready ? 'bg-[var(--brand)] text-white hover:opacity-90' : generationStyle}`}>
        {ready ? <Download className="h-4 w-4" /> : (processing || acting || checking) ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        {ready ? 'Download Tenant Comparison PDF' : processing ? 'Processing…' : acting ? 'Requesting…' : checking ? 'Checking report status…' : 'Generate Tenant Comparison PDF'}
      </button>
      {processing && <p role="status" className="text-sm text-foreground/65">{comparisonProgressMessage(current, delayed)}</p>}
      {ready && <p role="status" className="text-sm text-foreground/65">Ready to download. Available for 24 hours after completion. Expires {dateLabel(current.expiresAt)}.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>}
  </section>;
}
