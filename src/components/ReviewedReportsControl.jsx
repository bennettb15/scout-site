import { useEffect, useState } from "react";
import { Check, FileText, RefreshCw } from "lucide-react";
import { writePortalContext } from "../lib/portalContext";

async function readResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Unable to prepare updated reports.");
  return body;
}

function progressMessage(request) {
  switch (request?.progressStep) {
    case "validating": return "Checking the latest property data and review decisions…";
    case "preparing_photos": return "Preparing report photos…";
    case "rendering": return "Building the three PDFs…";
    case "uploading": return "Saving updated copies to Reports…";
    default: return "Reports are queued. You can leave this page and return later.";
  }
}

export default function ReviewedReportsControl({ orgId, propertyId, pendingCount, session }) {
  const [availability, setAvailability] = useState(null);
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const processing = request && ["queued", "generating"].includes(request.status);
  const activeRequestId = processing ? request.id : "";

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch("/api/current-reviewed-reports?" + new URLSearchParams({ orgId, propertyId }), {
      headers: { Authorization: "Bearer " + session.access_token },
      signal: controller.signal,
    }).then(readResponse).then((body) => {
      if (controller.signal.aborted) return;
      setAvailability(body.available && body.unresolvedCount === 0);
      setRequest(body.request);
    }).catch((cause) => {
      if (!controller.signal.aborted) {
        setAvailability(false);
        setError(cause.message || "Unable to check report updates.");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [orgId, propertyId, pendingCount, refreshKey, session.access_token]);

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
        setRequest(body.request);
        setError("");
        if (body.request?.status === "ready" && body.request.resultPackageId) {
          setNotice(true);
        } else if (["queued", "generating"].includes(body.request?.status)) {
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
    const timer = setTimeout(() => setNotice(false), 12000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function generate() {
    if (!availability || requesting || processing) return;
    setRequesting(true);
    setError("");
    try {
      const response = await fetch("/api/current-reviewed-reports", {
        method: "POST",
        headers: { Authorization: "Bearer " + session.access_token, "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, propertyId }),
      });
      const body = await readResponse(response);
      setRequest(body.request);
      if (body.request?.status === "ready" && body.request.resultPackageId) setNotice(true);
    } catch (cause) {
      setError(cause.message || "Unable to request updated reports.");
    } finally {
      setRequesting(false);
    }
  }

  if (loading || pendingCount > 0 || (!availability && !notice && !error) ||
      (request?.status === "ready" && request.resultPackageId && !notice)) return null;

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm" aria-label="Property report updates">
      {notice && (
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-green-800" role="status">
          <Check className="h-4 w-4" /> Updated property reports are ready.
          <a href="/reports" onClick={() => writePortalContext(session, { orgId, propertyId })}
            className="underline underline-offset-2">View in Reports</a>
        </div>
      )}
      {availability && !(request?.status === "ready" && request.resultPackageId) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand)]" />
            <div>
              <h2 className="font-semibold text-[var(--brand)]">Reviews complete</h2>
              <p className="mt-1 text-sm text-foreground/70">
                Create three updated PDFs using the latest completed property data. Previous copies stay in Reports.
              </p>
              {processing && <p role="status" className="mt-1 text-sm text-foreground/65">{progressMessage(request)}</p>}
              {request?.status === "failed" && <p role="alert" className="mt-1 text-sm text-red-700">
                {request.error || "The updated reports could not be generated."}
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
        {!processing && <button type="button" className="font-semibold underline" onClick={() => setRefreshKey((value) => value + 1)}>Retry</button>}
      </div>}
    </section>
  );
}
