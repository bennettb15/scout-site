import { useEffect, useState } from "react";

export default function ResolutionReviewPanel({ org, accessToken }) {
  const [required, setRequired] = useState(true);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setRequired(true);
    setReady(false);
    setLoading(true);
    setError("");
    setMessage("");
    fetch(`/api/admin/resolution-review?orgId=${encodeURIComponent(org.id)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Unable to load review setting.");
      return body;
    }).then((body) => {
      if (!controller.signal.aborted) {
        setRequired(body.requireReviewForFieldResolutions !== false);
        setReady(true);
      }
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause.message || "Unable to load review setting.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [org.id, accessToken]);

  async function toggleReview() {
    if (loading || saving || !ready) return;
    const next = !required;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/resolution-review", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orgId: org.id, requireReviewForFieldResolutions: next }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Unable to update review setting.");
      setRequired(body.requireReviewForFieldResolutions !== false);
      setMessage(next
        ? "New field resolutions will wait for review."
        : "New field resolutions will be final after upload.");
    } catch (cause) {
      setError(cause.message || "Unable to update review setting.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-background p-4 shadow-sm sm:p-5" aria-label="Punch List review">
      <h2 className="text-base font-semibold text-foreground">Punch List Review</h2>
      <p className="mt-1 text-sm text-foreground/60">
        Choose whether field-resolved items for {org.name} need approval before they become final.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-slate-50 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-foreground">Require review for field resolutions</div>
          <p className="mt-1 text-xs text-foreground/60">
            {required ? "On: new items go to Pending Review." : "Off: new items become Resolved after upload."}
          </p>
        </div>
        <button type="button" role="switch" aria-checked={required} aria-label="Require review for field resolutions"
          disabled={loading || saving || !ready} onClick={toggleReview}
          className={`relative h-9 w-16 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30 disabled:cursor-not-allowed disabled:opacity-50 ${required ? "bg-[var(--brand)]" : "bg-slate-400"}`}>
          <span className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow-sm transition-transform ${required ? "left-8" : "left-1"}`} />
        </button>
      </div>
      <p className="mt-2 text-xs text-foreground/55">Existing Pending Review items still need a decision. This setting applies to future field resolutions.</p>
      {loading && <p className="mt-2 text-sm text-foreground/55">Loading review setting...</p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-2 text-sm text-emerald-800">{message}</p>}
    </section>
  );
}
