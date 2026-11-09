import { useEffect, useState } from "react";

const MAX_SOURCE_BYTES = 3_000_000;
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function readLogoBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error("Unable to read the selected logo."));
    reader.readAsDataURL(file);
  });
}

export default function ReportBrandingPanel({ org, accessToken }) {
  const [logoUrl, setLogoUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    setLogoUrl(null);
    setLoading(true);
    setError("");
    setMessage("");
    fetch(`/api/admin/report-branding?orgId=${encodeURIComponent(org.id)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Unable to load report branding.");
        return body;
      })
      .then((body) => {
        if (active) setLogoUrl(body.logoUrl || null);
      })
      .catch((cause) => {
        if (active) setError(cause.message || "Unable to load report branding.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [org.id, accessToken]);

  async function uploadLogo(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setMessage("");
    if (!ACCEPTED_TYPES.has(file.type) || file.size > MAX_SOURCE_BYTES) {
      setError("Choose a PNG, JPG, or WebP logo under 3 MB.");
      return;
    }
    setSaving(true);
    try {
      const logoBase64 = await readLogoBase64(file);
      const response = await fetch("/api/admin/report-branding", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orgId: org.id, logoBase64 }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Unable to upload report logo.");
      setLogoUrl(body.logoUrl || null);
      setMessage("Report logo saved. New reports for this organization will use it.");
    } catch (cause) {
      setError(cause.message || "Unable to upload report logo.");
    } finally {
      setSaving(false);
    }
  }

  async function removeLogo() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/report-branding", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orgId: org.id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Unable to remove report logo.");
      setLogoUrl(null);
      setMessage("Scout is now the default logo for new reports from this organization.");
    } catch (cause) {
      setError(cause.message || "Unable to remove report logo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-background p-4 shadow-sm sm:p-5" aria-label="Report branding">
      <h2 className="text-base font-semibold text-foreground">Report Branding</h2>
      <p className="mt-1 text-sm text-foreground/60">
        Add a logo for new {org.name} reports. Scout remains the default when no logo is uploaded.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="flex h-24 w-56 items-center justify-center rounded-lg border border-border bg-white p-3">
          <img
            src={logoUrl || "/Scout Only Logo Navy Dark NEW.png"}
            alt={logoUrl ? `${org.name} report logo` : "Default Scout report logo"}
            className="max-h-full max-w-full object-contain"
          />
        </div>
        <div className="grid gap-2">
          <label className={`inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white shadow-sm ${loading || saving ? "cursor-not-allowed opacity-60" : ""}`}>
            {saving ? "Saving..." : logoUrl ? "Replace Logo" : "Upload Logo"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={loading || saving}
              onChange={uploadLogo}
              className="sr-only"
            />
          </label>
          {logoUrl && (
            <button type="button" onClick={removeLogo} disabled={saving}
              className="h-10 rounded-lg border border-border px-4 text-sm font-semibold text-foreground/70 disabled:opacity-50">
              Use Scout Default
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-foreground/55">PNG, JPG, or WebP up to 3 MB. The logo is scaled to fit without stretching.</p>
      {loading && <p className="mt-2 text-sm text-foreground/55">Loading report branding...</p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-2 text-sm text-emerald-800">{message}</p>}
    </section>
  );
}
