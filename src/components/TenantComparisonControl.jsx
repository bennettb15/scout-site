import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { FileText, Download, RefreshCw, X } from 'lucide-react';
import { restoredComparisonSelection, matchingComparisonRequest, comparisonProgressMessage } from '../lib/tenantComparisonDisplay.js';

const dateLabel = (value) => value ? new Date(value).toLocaleString() : 'Unknown date';
const generationStyle = 'border border-blue-200 bg-blue-50 text-[var(--brand)] hover:bg-blue-100';

export default function TenantComparisonControl({ orgId, propertyId, propertyName, accessToken, expanded = false }) {
  const [configuring, setConfiguring] = useState(false);
  const actionRef = useRef(null);
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
  const current = configuring ? matchingComparisonRequest(request, beforeId, selectedAfter) :
    (request && Date.parse(request.expiresAt) > Date.now() ? request : null);
  const processing = current && ['queued', 'generating'].includes(current.status);
  const ready = current?.status === 'ready';
  const validSelection = beforeId && selectedAfter && beforeId !== selectedAfter;

  useEffect(() => {
    if (!configuring) return;
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
  }, [configuring, orgId, propertyId, accessToken]);

  useEffect(() => {
    const check = () => { if (!document.hidden) setRefresh((value) => value + 1); };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => { window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, []);

  useEffect(() => {
    if (configuring && (loading || !validSelection)) return;
    const controller = new AbortController();
    let timer;
    async function poll() {
      setChecking(true);
      try {
        const params = new URLSearchParams({ orgId, propertyId, ...(configuring ?
          { lookup: '1', beforePackageId: beforeId, afterPackageId: selectedAfter } : { current: '1' }) });
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
  }, [configuring, loading, validSelection, orgId, propertyId, accessToken, beforeId, selectedAfter, refresh]);

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
        setConfiguring(false);
      } else {
        const response = await fetch('/api/tenant-comparison', { method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgId, propertyId, beforePackageId: beforeId, afterPackageId: selectedAfter }),
        });
        const body = await response.json();
        if (!response.ok || !body.requestId) throw new Error(body.error || 'Unable to request comparison.');
        setRequest(body); setRefresh((value) => value + 1);
        setConfiguring(false);
      }
    } catch (e) { setError(e.message); }
    finally { setActing(false); }
  }

  return <Dialog.Root open={configuring} onOpenChange={setConfiguring}>
    <section hidden={!expanded} className="mt-4 border-t border-border pt-4" aria-label={`Tenant Comparison PDF for ${propertyName || 'this property'}`}>
      <div className="flex flex-wrap items-center gap-3">
        <button ref={actionRef} type="button" onClick={ready ? act : () => setConfiguring(true)} disabled={acting || (checking && !current)}
          aria-haspopup={!ready && !processing ? 'dialog' : undefined}
          className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60 ${generationStyle}`}>
          {ready ? <Download className="h-4 w-4" /> : processing || acting || checking ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          {ready ? 'Download Tenant Comparison PDF' : processing ? 'Processing Tenant Comparison…' : acting ? 'Requesting Tenant Comparison…' : checking ? 'Checking Tenant Comparison…' : 'Generate Tenant Comparison PDF'}
        </button>
        {(ready || processing) && <button type="button" onClick={() => setConfiguring(true)} className="text-sm font-semibold text-[var(--brand)] underline-offset-4 hover:underline">Change dates</button>}
      </div>
      {processing && <p role="status" className="mt-2 text-sm text-foreground/65">{comparisonProgressMessage(current, delayed)}</p>}
      {ready && <p className="mt-2 text-sm text-foreground/65">Available until {dateLabel(current.expiresAt)}.</p>}
      {!configuring && error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm" />
      <Dialog.Content onCloseAutoFocus={(event) => { event.preventDefault(); actionRef.current?.focus(); }}
        className="fixed left-1/2 top-1/2 z-[60] max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-white p-6 text-foreground shadow-xl focus:outline-none">
        <Dialog.Title className="pr-8 text-xl font-semibold text-[var(--brand)]">Generate Tenant Comparison PDF</Dialog.Title>
        <p className="mt-1 text-sm font-semibold text-foreground">{propertyName}</p>
        <Dialog.Description className="mt-3 text-sm text-foreground/65">Compare a full documentation baseline with the latest Property Report, including punchlist updates. Each photo keeps its capture date.</Dialog.Description>
        <div className="mt-5 grid gap-4">
          <label className="grid gap-1 text-sm font-medium">Compare from
            <select value={beforeId} onChange={(e) => setSelection({ ...selection, beforeId: e.target.value })} disabled={acting || loading} className="min-w-0 w-full rounded-md border border-border p-2">
              <option value="">Choose a Full Documentation session</option>
              {versions.filter((v) => v.sessionType === 'full_documentation').map((v) => <option key={v.id} value={v.id}>{dateLabel(v.date)} — Full Documentation</option>)}
            </select>
          </label>
          <div className="text-sm">Compare to: <strong>{customEnd ? `Selected report version (${dateLabel(versions.find((v) => v.id === afterId)?.date)})` : `Latest Property Report (${dateLabel(versions[0]?.date)})`}</strong></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={customEnd} disabled={acting || loading} onChange={(e) => setSelection({ ...selection, customEnd: e.target.checked })} />Choose a different end date</label>
          {customEnd && <label className="grid gap-1 text-sm font-medium">End report version
            <select value={afterId} disabled={acting || loading} onChange={(e) => setSelection({ ...selection, afterId: e.target.value })} className="min-w-0 w-full rounded-md border border-border p-2">
              {versions.map((v) => <option key={v.id} value={v.id}>{dateLabel(v.date)} — {v.sessionType === 'full_documentation' ? 'Full Documentation' : 'Punchlist Visit'}</option>)}
            </select>
          </label>}
          {loading && <p role="status" className="text-sm text-foreground/65">Loading report versions…</p>}
          {versions.length < 2 && !loading && <p className="text-sm text-foreground/65">Two report versions are needed for a comparison.</p>}
          <p className="text-sm text-foreground/65">Larger properties may take longer. You can close this popup or leave the page while your report is prepared. Downloads remain available for 24 hours after completion.</p>
          <button type="button" disabled={acting || loading || processing || (checking && !ready) || !validSelection} onClick={act}
            className={`inline-flex min-h-10 w-fit items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60 ${generationStyle}`}>
            {ready ? <Download className="h-4 w-4" /> : processing || acting || checking ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {ready ? 'Download Tenant Comparison PDF' : processing ? 'Processing Tenant Comparison…' : acting ? 'Requesting…' : checking ? 'Checking report status…' : 'Generate Tenant Comparison PDF'}
          </button>
          {processing && <p role="status" className="text-sm text-foreground/65">{comparisonProgressMessage(current, delayed)}</p>}
          {ready && <p className="text-sm text-foreground/65">Available until {dateLabel(current.expiresAt)}.</p>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </div>
        <Dialog.Close asChild><button type="button" aria-label="Close comparison options" className="absolute right-4 top-4 rounded-md p-1 text-foreground/65 hover:bg-slate-100"><X className="h-5 w-5" /></button></Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
