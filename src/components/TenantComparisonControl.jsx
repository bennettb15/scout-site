import { useEffect, useState } from 'react';

const dateLabel = (value) => value ? new Date(value).toLocaleString() : 'Unknown date';

export default function TenantComparisonControl({ orgId, propertyId, propertyName, accessToken }) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState([]);
  const [beforeId, setBeforeId] = useState('');
  const [afterId, setAfterId] = useState('');
  const [customEnd, setCustomEnd] = useState(false);
  const [requestId, setRequestId] = useState('');
  const [download, setDownload] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ orgId, propertyId });
    fetch(`/api/tenant-comparison?${params}`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to load report versions.');
        const options = body.versions || [];
        setVersions(options);
        setBeforeId((current) => options.some((v) => v.id === current) ? current : options.find((v, i) => i > 0 && v.sessionType === 'full_documentation')?.id || '');
        setAfterId((current) => options.some((v) => v.id === current) ? current : options[0]?.id || '');
      }).catch((e) => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, orgId, propertyId, accessToken]);

  useEffect(() => {
    if (!requestId) return;
    const controller = new AbortController();
    let timer;
    const started = Date.now();
    async function poll() {
      try {
        const response = await fetch(`/api/tenant-comparison?requestId=${encodeURIComponent(requestId)}`, {
          headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok || body.status === 'failed') throw new Error(body.error || 'Unable to generate comparison.');
        if (body.status === 'ready') {
          setDownload({ ...body, requestId });
          setRequestId('');
          setBusy(false);
          setMessage('Your temporary PDF is ready. The download expires in one hour.');
          return;
        }
        if (Date.now() - started > 20 * 60 * 1000) throw new Error('Generation is taking longer than expected. Try Generate again to check the existing request.');
        setMessage(body.status === 'queued' ? 'Waiting to generate your comparison. You can keep this page open.' : 'Preparing your comparison PDF…');
        timer = setTimeout(poll, 4000);
      } catch (e) {
        if (e.name !== 'AbortError') { setError(e.message); setBusy(false); setRequestId(''); }
      }
    }
    poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [requestId, accessToken]);

  async function generate() {
    setBusy(true); setError(''); setDownload(null); setMessage('Requesting comparison…');
    try {
      const response = await fetch('/api/tenant-comparison', { method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, propertyId, beforePackageId: beforeId, afterPackageId: customEnd ? afterId : undefined }),
      });
      const body = await response.json();
      if (!response.ok || !body.requestId) throw new Error(body.error || 'Unable to request comparison.');
      setRequestId(body.requestId);
    } catch (e) { setError(e.message); setBusy(false); setMessage(''); }
  }

  return <section className="rounded-lg border border-border bg-white p-4 shadow-sm">
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="text-sm font-semibold text-[var(--brand)]">Tenant Comparison PDF{propertyName ? ` · ${propertyName}` : ''}</button>
    {open && <div className="mt-3 grid gap-3">
      <p className="text-sm text-foreground/65">Compare a full documentation baseline with the latest Property Report, including punchlist updates. Each photo keeps its capture date.</p>
      <label className="grid gap-1 text-sm font-medium">Compare from
        <select value={beforeId} onChange={(e) => { setBeforeId(e.target.value); setDownload(null); }} disabled={busy || loading} className="rounded-md border border-border p-2">
          <option value="">Choose a Full Documentation session</option>
          {versions.filter((v) => v.sessionType === 'full_documentation').map((v) => <option key={v.id} value={v.id}>{dateLabel(v.date)} — Full Documentation</option>)}
        </select>
      </label>
      <div className="text-sm">Compare to: <strong>{customEnd ? 'Selected report version' : `Latest Property Report (${dateLabel(versions[0]?.date)})`}</strong></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={customEnd} disabled={busy} onChange={(e) => { setCustomEnd(e.target.checked); setDownload(null); }} />Choose a different end date</label>
      {customEnd && <label className="grid gap-1 text-sm font-medium">End report version
        <select value={afterId} disabled={busy} onChange={(e) => { setAfterId(e.target.value); setDownload(null); }} className="rounded-md border border-border p-2">
          {versions.map((v) => <option key={v.id} value={v.id}>{dateLabel(v.date)} — {v.sessionType === 'full_documentation' ? 'Full Documentation' : 'Punchlist Visit'}</option>)}
        </select>
      </label>}
      {loading && <p role="status" className="text-sm text-foreground/65">Loading report versions…</p>}
      {versions.length < 2 && !busy && !loading && <p className="text-sm text-foreground/65">Two report versions are needed for a comparison.</p>}
      <button type="button" disabled={busy || loading || !beforeId || versions.length < 2 || beforeId === (customEnd ? afterId : versions[0]?.id)} onClick={generate} className="w-fit rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Preparing…' : 'Generate Tenant Comparison PDF'}</button>
      {message && <p role="status" className="text-sm text-foreground/65">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {download && <button type="button" className="w-fit text-sm font-semibold text-[var(--brand)] underline" onClick={async () => {
        // Refresh the short-lived URL when the user actually downloads.
        try {
          const response = await fetch(`/api/tenant-comparison?requestId=${encodeURIComponent(download.requestId || '')}`, { headers: { Authorization: `Bearer ${accessToken}` } });
          const body = await response.json();
          if (!response.ok || !body.downloadUrl) throw new Error(body.error || 'Download expired. Generate the comparison again.');
          window.location.assign(body.downloadUrl);
        } catch (e) { setError(e.message); }
      }}>Download comparison PDF</button>}
    </div>}
  </section>;
}
