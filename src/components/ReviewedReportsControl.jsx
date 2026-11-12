import { useEffect, useState } from "react";
import { Check, FileText, RefreshCw } from "lucide-react";
import { writePortalContext } from "../lib/portalContext";

function visitLabel(source) {
  const date = new Date(source.sessionCompletedAt || source.completedAt || "");
  if (Number.isNaN(date.getTime())) return "Visit date unknown";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(date);
}

async function readResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Unable to prepare reviewed reports.");
  return body;
}

function progressMessage(request) {
  switch (request?.progressStep) {
    case "validating": return "Checking the reviewed decisions…";
    case "preparing_photos": return "Preparing report photos…";
    case "rendering": return "Building the three PDFs…";
    case "uploading": return "Saving the reviewed copies to Reports…";
    default: return "Your reports are queued. You can leave this page and return later.";
  }
}

export default function ReviewedReportsControl({ orgId, propertyId, propertyName, pendingCount, session, transitionOnly = false }) {
  const [sources, setSources] = useState([]);
  const [sourceId, setSourceId] = useState("");
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState("");
  const selectedSource = sources.find((source) => source.id === sourceId) || null;
  const processing = request && ["queued", "generating"].includes(request.status);
  const activeRequestId = processing ? request.id : "";
  const ready = request?.status === "ready" && request.resultPackageId;
  const allSourcesUpdatedNow = sources.length > 0 && sources.every((source) => {
    const latest = source.id === sourceId ? request : source.latestRequest;
    return latest?.status === "ready" && latest?.resultPackageId;
  });
  const transitionFinished = transitionOnly && pendingCount === 0 && allSourcesUpdatedNow;

  useEffect(() => {
    const controller = new AbortController();
    setSources([]);
    setSourceId("");
    setRequest(null);
    setLoading(true);
    setUnavailable(false);
    setError("");
    const params = new URLSearchParams({ orgId, propertyId });
    fetch(`/api/reviewed-reports?${params}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      signal: controller.signal,
    }).then(async (response) => {
      if (response.status === 403) {
        if (!controller.signal.aborted) setUnavailable(true);
        return null;
      }
      return readResponse(response);
    }).then((body) => {
      if (controller.signal.aborted || !body) return;
      const nextSources = body.sources || [];
      setSources(nextSources);
      setSourceId(nextSources[0]?.id || "");
      setRequest(nextSources[0]?.latestRequest || null);
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause.message || "Unable to load visits.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [orgId, propertyId, session.access_token]);

  useEffect(() => {
    if (!activeRequestId) return;
    const controller = new AbortController();
    let timer;
    async function poll() {
      try {
        const response = await fetch(`/api/reviewed-reports?requestId=${encodeURIComponent(activeRequestId)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: controller.signal,
        });
        const body = await readResponse(response);
        if (controller.signal.aborted) return;
        setRequest(body.request);
        setError("");
        if (["queued", "generating"].includes(body.request?.status)) timer = setTimeout(poll, 4000);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(`${cause.message || "Unable to check progress."} Checking again shortly.`);
        timer = setTimeout(poll, 10000);
      }
    }
    timer = setTimeout(poll, 4000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [activeRequestId, session.access_token]);

  const allSourcesUpdated = sources.length > 0 && sources.every((source) =>
    source.latestRequest?.status === "ready" && source.latestRequest?.resultPackageId
  );
  if (unavailable || loading || (!error && sources.length === 0) ||
    (transitionOnly && pendingCount === 0 && allSourcesUpdated)) return null;

  async function generate() {
    if (!sourceId || requesting || processing) return;
    setRequesting(true);
    setError("");
    try {
      const response = await fetch("/api/reviewed-reports", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orgId, propertyId, sourcePackageId: sourceId }),
      });
      const body = await readResponse(response);
      setRequest(body.request);
    } catch (cause) {
      setError(cause.message || "Unable to request reviewed reports.");
    } finally {
      setRequesting(false);
    }
  }

  return (
    <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm" aria-label="Reviewed reports">
      <div className="flex items-start gap-3">
        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand)]" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-[var(--brand)]">Reviewed reports</h2>
          <p className="mt-1 text-sm text-foreground/70">
            When you finish reviewing a visit, create updated copies of its three reports. The original reports stay in Reports.
          </p>
          {pendingCount > 0 && <p className="mt-2 text-sm text-violet-800">
            {pendingCount} item{pendingCount === 1 ? "" : "s"} still pending for this property. Approve or reject all field resolutions from the selected visit before generating its reviewed copy.
          </p>}
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="grid min-w-52 flex-1 gap-1 text-sm font-semibold text-foreground">
              Visit for {propertyName || "this property"}
              <select value={sourceId} disabled={loading || requesting || processing || sources.length === 0}
                onChange={(event) => {
                  const nextId = event.target.value;
                  setSourceId(nextId);
                  setRequest(sources.find((source) => source.id === nextId)?.latestRequest || null);
                  setError("");
                }}
                className="h-10 w-full min-w-0 rounded-lg border border-border bg-white px-3 text-sm font-medium text-foreground">
                {sources.length === 0 && <option value="">{loading ? "Loading visits…" : "No visits needing review"}</option>}
                {sources.map((source) => <option key={source.id} value={source.id}>{visitLabel(source)}</option>)}
              </select>
            </label>
            {!transitionFinished && <button type="button" onClick={generate} disabled={!selectedSource || loading || requesting || processing}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-white px-4 text-sm font-semibold text-[var(--brand)] shadow-sm hover:bg-blue-100 disabled:opacity-50">
              {processing || requesting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {processing ? "Generating…" : requesting ? "Requesting…" : ready ? "Generate updated copies" : "Generate reviewed reports"}
            </button>}
            {ready && <a href="/reports" onClick={() => writePortalContext(session, { orgId, propertyId })}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white shadow-sm">
              <Check className="h-4 w-4" /> View in Reports
            </a>}
          </div>
          {processing && <p role="status" className="mt-2 text-sm text-foreground/65">
            {progressMessage(request)}
          </p>}
          {request?.status === "failed" && <p role="alert" className="mt-2 text-sm text-red-700">{request.error || "The reviewed reports could not be generated."}</p>}
          {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
        </div>
      </div>
    </section>
  );
}
