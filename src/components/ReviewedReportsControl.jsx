import { useEffect, useRef, useState } from "react";
import { Check, FileText, RefreshCw } from "lucide-react";
import { writePortalContext } from "../lib/portalContext";
import { selectReviewReadySource } from "../lib/reviewedReportVisits";

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
    case "uploading": return "Saving the updated copies to Reports…";
    default: return "Reports are queued. You can leave this page and return later.";
  }
}

export default function ReviewedReportsControl({ orgId, propertyId, pendingRows, session }) {
  const [sources, setSources] = useState([]);
  const [request, setRequest] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const selected = selectReviewReadySource(sources, pendingRows, request);
  const processing = selected?.request && ["queued", "generating"].includes(selected.request.status);
  const activeRequestId = request && ["queued", "generating"].includes(request.status) ? request.id : "";

  useEffect(() => {
    const controller = new AbortController();
    setSources([]);
    setRequest(null);
    setNotice(null);
    setLoading(true);
    setUnavailable(false);
    setError("");
    const params = new URLSearchParams({ orgId, propertyId });
    fetch("/api/reviewed-reports?" + params, {
      headers: { Authorization: "Bearer " + session.access_token },
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
      setRequest(nextSources.map((source) => source.latestRequest)
        .find((item) => item && ["queued", "generating"].includes(item.status)) || null);
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause.message || "Unable to load visits.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [orgId, propertyId, refreshKey, session.access_token]);

  useEffect(() => {
    if (!activeRequestId) return;
    const controller = new AbortController();
    let timer;
    async function poll() {
      try {
        const response = await fetch("/api/reviewed-reports?requestId=" + encodeURIComponent(activeRequestId), {
          headers: { Authorization: "Bearer " + session.access_token },
          signal: controller.signal,
        });
        const body = await readResponse(response);
        if (controller.signal.aborted) return;
        const nextRequest = body.request;
        setRequest(nextRequest);
        setSources((current) => current.map((source) =>
          source.id === nextRequest?.sourcePackageId
            ? { ...source, latestRequest: nextRequest }
            : source
        ));
        setError("");
        if (nextRequest?.status === "ready" && nextRequest.resultPackageId) {
          const finishedSource = sourcesRef.current.find((source) => source.id === nextRequest.sourcePackageId);
          setNotice({ label: finishedSource ? visitLabel(finishedSource) : "this visit" });
        } else if (["queued", "generating"].includes(nextRequest?.status)) {
          timer = setTimeout(poll, 4000);
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError((cause.message || "Unable to check progress.") + " Checking again shortly.");
        timer = setTimeout(poll, 10000);
      }
    }
    timer = setTimeout(poll, 4000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [activeRequestId, session.access_token]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 12000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function generate() {
    if (!selected || requesting || processing) return;
    setRequesting(true);
    setError("");
    try {
      const response = await fetch("/api/reviewed-reports", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + session.access_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orgId, propertyId, sourcePackageId: selected.source.id }),
      });
      const body = await readResponse(response);
      setRequest(body.request);
      setSources((current) => current.map((source) =>
        source.id === selected.source.id
          ? { ...source, latestRequest: body.request }
          : source
      ));
    } catch (cause) {
      setError(cause.message || "Unable to request updated reports.");
    } finally {
      setRequesting(false);
    }
  }

  if (unavailable || loading || (!selected && !notice && !error)) return null;

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm" aria-label="Visit report updates">
      {notice && (
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-green-800" role="status">
          <Check className="h-4 w-4" />
          Updated reports for {notice.label} are ready.
          <a href="/reports" onClick={() => writePortalContext(session, { orgId, propertyId })}
            className="underline underline-offset-2">View in Reports</a>
        </div>
      )}
      {selected && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand)]" />
            <div>
              <h2 className="font-semibold text-[var(--brand)]">Review complete · {visitLabel(selected.source)}</h2>
              <p className="mt-1 text-sm text-foreground/70">
                Update this visit's three reports. The original copies stay in Reports.
              </p>
              {processing && <p role="status" className="mt-1 text-sm text-foreground/65">
                {progressMessage(selected.request)}
              </p>}
              {selected.request?.status === "failed" && <p role="alert" className="mt-1 text-sm text-red-700">
                {selected.request.error || "The updated reports could not be generated."}
              </p>}
            </div>
          </div>
          <button type="button" onClick={generate} disabled={requesting || processing}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-blue-200 bg-white px-4 text-sm font-semibold text-[var(--brand)] shadow-sm hover:bg-blue-100 disabled:opacity-50">
            {processing || requesting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {processing ? "Generating…" : requesting ? "Requesting…" : "Update reports"}
          </button>
        </div>
      )}
      {error && <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-red-700" role="alert">
        {error}
        {!selected && <button type="button" className="font-semibold underline" onClick={() => setRefreshKey((value) => value + 1)}>Retry</button>}
      </div>}
    </section>
  );
}
