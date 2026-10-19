import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, Clock, RefreshCw, ShieldCheck } from "lucide-react";
import { hasSupabaseConfig, supabase } from "./lib/supabaseClient";
import AccountMenu from "./components/AccountMenu";

const EMPTY_DRAFT = {
  pilotSignedAt: "",
  pilotExpiresAt: "",
  ongoingStartedAt: "",
  ongoingExpiresAt: "",
  internalNotes: "",
};

function localInput(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function isoValue(local) {
  if (!local) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function thirtyDaysAfter(local) {
  const date = new Date(local);
  if (Number.isNaN(date.getTime())) return "";
  return localInput(new Date(date.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString());
}

function draftFor(lifecycle) {
  if (!lifecycle) return { ...EMPTY_DRAFT };
  return {
    pilotSignedAt: localInput(lifecycle.pilotSignedAt),
    pilotExpiresAt: localInput(lifecycle.pilotExpiresAt),
    ongoingStartedAt: localInput(lifecycle.ongoingStartedAt),
    ongoingExpiresAt: localInput(lifecycle.ongoingExpiresAt),
    internalNotes: lifecycle.internalNotes || "",
  };
}

function dateLabel(iso) {
  if (!iso) return "Not set";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const STATUS_LABELS = {
  untracked: "No dates set",
  pilot: "Pilot active",
  ongoing: "Ongoing active",
  expired: "Expiration passed",
  "access-ended": "Access ended",
};

function DateField({ label, value, onChange, detail }) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-foreground">
      {label}
      <input
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 min-w-0 w-full rounded-lg border border-border bg-background px-3 text-base font-normal outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
      />
      {detail && <span className="text-xs font-normal text-foreground/60">{detail}</span>}
    </label>
  );
}

export default function CustomerLifecycleAdminPage() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [accessState, setAccessState] = useState("signed-out");
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmImmediateExpiration, setConfirmImmediateExpiration] = useState(false);

  useEffect(() => {
    document.title = "Customers | SCOUT Admin";
    document.documentElement.style.setProperty("--brand", "#1C2742");
    if (!hasSupabaseConfig || !supabase) {
      setAuthLoading(false);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session || null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
    });
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  const loadCustomers = useCallback(async (accessToken, preferredOrgId = "") => {
    if (!accessToken) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/customer-lifecycle", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 403) {
        setAccessState("denied");
        setOrganizations([]);
        return;
      }
      if (!response.ok) throw new Error(body.error || "Unable to load customers.");
      const rows = body.organizations || [];
      setOrganizations(rows);
      const nextId = rows.some((row) => row.id === preferredOrgId) ? preferredOrgId : rows[0]?.id || "";
      setSelectedOrgId(nextId);
      setDraft(draftFor(rows.find((row) => row.id === nextId)?.lifecycle));
      setConfirmImmediateExpiration(false);
      setAccessState("authorized");
    } catch (loadError) {
      setError(loadError.message || "Unable to load customers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) {
      setAccessState("signed-out");
      setOrganizations([]);
      setSelectedOrgId("");
      return;
    }
    setAccessState("checking");
    loadCustomers(token);
  }, [session?.access_token, loadCustomers]);

  const selectedOrg = useMemo(
    () => organizations.find((org) => org.id === selectedOrgId) || null,
    [organizations, selectedOrgId]
  );

  const effectiveExpiration = draft.ongoingStartedAt && new Date(draft.ongoingStartedAt) <= new Date()
    ? draft.ongoingExpiresAt
    : draft.pilotExpiresAt;
  const endsImmediately = Boolean(
    effectiveExpiration && new Date(effectiveExpiration).getTime() <= Date.now()
  );

  async function handleSignIn(event) {
    event.preventDefault();
    setAuthError("");
    if (!hasSupabaseConfig || !supabase) {
      setAuthError("Supabase is not configured.");
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setAuthError(signInError.message || "Unable to sign in.");
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!session?.access_token || !selectedOrgId) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/customer-lifecycle", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orgId: selectedOrgId,
          pilotSignedAt: isoValue(draft.pilotSignedAt),
          pilotExpiresAt: isoValue(draft.pilotExpiresAt),
          ongoingStartedAt: isoValue(draft.ongoingStartedAt),
          ongoingExpiresAt: isoValue(draft.ongoingExpiresAt),
          internalNotes: draft.internalNotes,
          confirmImmediateExpiration,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Unable to save dates.");
      const previouslyEnded = Boolean(selectedOrg.lifecycle?.accessEndedAt);
      setOrganizations((current) => current.map((org) =>
        org.id === selectedOrgId ? { ...org, lifecycle: body.lifecycle } : org
      ));
      setNotice(previouslyEnded && body.lifecycle.status !== "access-ended"
        ? "Dates saved. Prior customer access remains revoked; invite the customer again through Portal Access."
        : body.lifecycle.status === "access-ended"
          ? "Dates saved. Customer access has ended."
          : "Customer dates saved.");
      setConfirmImmediateExpiration(false);
    } catch (saveError) {
      setError(saveError.message || "Unable to save dates.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ "--brand": "#1C2742" }} className="min-h-screen bg-slate-50 text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6">
          <a href="/admin/portal-access" className="inline-flex items-center gap-2 text-sm font-semibold text-foreground/75 hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Portal Access
          </a>
          {session && <AccountMenu onSignOut={() => supabase?.auth.signOut()} />}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-[var(--brand)]">Private admin</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Customers</h1>
            <p className="mt-2 max-w-2xl text-sm text-foreground/65">
              Track signed pilot and ongoing dates for each organization. Only your two admin logins can view or edit these records.
            </p>
          </div>
          {accessState === "authorized" && (
            <button type="button" onClick={() => loadCustomers(session?.access_token, selectedOrgId)} disabled={loading}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-semibold disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          )}
        </div>

        {authLoading && <p className="rounded-lg border border-border bg-background p-5">Checking session...</p>}
        {!authLoading && !session && (
          <form onSubmit={handleSignIn} className="max-w-md rounded-lg border border-border bg-background p-5 shadow-sm">
            <h2 className="font-semibold">Sign in</h2>
            <label className="mt-4 grid gap-1.5 text-sm font-medium">Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email"
                className="h-11 rounded-lg border border-border bg-background px-3 text-base" required />
            </label>
            <label className="mt-3 grid gap-1.5 text-sm font-medium">Password
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password"
                className="h-11 rounded-lg border border-border bg-background px-3 text-base" required />
            </label>
            {authError && <p className="mt-3 text-sm text-red-700">{authError}</p>}
            <button type="submit" className="mt-4 h-11 w-full rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white">Sign in</button>
          </form>
        )}
        {accessState === "checking" && <p className="rounded-lg border border-border bg-background p-5">Checking access...</p>}
        {accessState === "denied" && <p className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-800">This customer page is limited to the two Scout owner logins.</p>}
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}

        {accessState === "authorized" && (
          <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
            <aside className="rounded-lg border border-border bg-background p-3 shadow-sm">
              <div className="px-2 pb-3 text-sm font-semibold text-foreground/65">Organizations</div>
              {!organizations.length && <p className="px-2 text-sm text-foreground/60">No organizations yet.</p>}
              <div className="grid gap-1">
                {organizations.map((org) => (
                  <button key={org.id} type="button" onClick={() => {
                    setSelectedOrgId(org.id);
                    setDraft(draftFor(org.lifecycle));
                    setConfirmImmediateExpiration(false);
                    setNotice("");
                    setError("");
                  }}
                    className={`rounded-lg px-3 py-3 text-left ${selectedOrgId === org.id ? "bg-slate-100 text-foreground" : "hover:bg-slate-50"}`}>
                    <span className="block truncate text-sm font-semibold">{org.name}</span>
                    <span className="mt-1 block text-xs text-foreground/60">{STATUS_LABELS[org.lifecycle?.status || "untracked"]}</span>
                  </button>
                ))}
              </div>
            </aside>

            {selectedOrg && (
              <form onSubmit={handleSave} className="min-w-0 rounded-lg border border-border bg-background p-4 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <h2 className="text-xl font-semibold">{selectedOrg.name}</h2>
                    <p className="mt-1 text-sm text-foreground/60">{STATUS_LABELS[selectedOrg.lifecycle?.status || "untracked"]}</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-foreground/70">
                    <ShieldCheck className="h-3.5 w-3.5" /> Private
                  </span>
                </div>

                <section className="mt-5">
                  <div className="flex items-center gap-2 text-base font-semibold"><Clock className="h-4 w-4" /> Pilot</div>
                  <p className="mt-1 text-sm text-foreground/60">The expiration defaults to 30 days after signing. Change it here to record a written extension.</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <DateField label="Pilot signed" value={draft.pilotSignedAt}
                      onChange={(value) => setDraft((current) => ({
                        ...current,
                        pilotSignedAt: value,
                        pilotExpiresAt: !current.pilotExpiresAt || current.pilotExpiresAt === thirtyDaysAfter(current.pilotSignedAt)
                          ? thirtyDaysAfter(value) : current.pilotExpiresAt,
                      }))} />
                    <DateField label="Pilot expires" value={draft.pilotExpiresAt}
                      onChange={(value) => setDraft((current) => ({ ...current, pilotExpiresAt: value }))} />
                  </div>
                </section>

                <section className="mt-7 border-t border-border pt-5">
                  <h3 className="text-base font-semibold">Ongoing agreement</h3>
                  <p className="mt-1 text-sm text-foreground/60">Set both dates after the customer accepts an ongoing agreement. The ongoing cutoff takes effect when that term starts; its start must be no later than the pilot cutoff.</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <DateField label="Ongoing starts" value={draft.ongoingStartedAt}
                      onChange={(value) => setDraft((current) => ({ ...current, ongoingStartedAt: value }))} />
                    <DateField label="Ongoing expires" value={draft.ongoingExpiresAt}
                      onChange={(value) => setDraft((current) => ({ ...current, ongoingExpiresAt: value }))} />
                  </div>
                </section>

                <label className="mt-7 grid gap-1.5 border-t border-border pt-5 text-sm font-semibold">Private notes
                  <textarea value={draft.internalNotes} maxLength={2000} rows={3}
                    onChange={(event) => setDraft((current) => ({ ...current, internalNotes: event.target.value }))}
                    placeholder="Optional: extension, agreement, or follow-up details"
                    className="min-h-24 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal" />
                </label>

                <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-foreground/70">
                  <p><strong>Current cutoff:</strong> {effectiveExpiration ? dateLabel(isoValue(effectiveExpiration)) : "Not set"}</p>
                  <p className="mt-1">The daily expiration job removes customer organization access after this time. It does not delete the shared login or records; the existing 90-day organization retention process applies after access ends.</p>
                  {selectedOrg.lifecycle?.accessEndedAt && (
                    <p className="mt-2 font-semibold text-amber-800">Customer access was last ended {dateLabel(selectedOrg.lifecycle.accessEndedAt)}. New dates do not restore revoked memberships; invite the customer again through Portal Access.</p>
                  )}
                </div>

                {endsImmediately && (
                  <label className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                    <input type="checkbox" checked={confirmImmediateExpiration}
                      onChange={(event) => setConfirmImmediateExpiration(event.target.checked)} className="mt-1 h-4 w-4" />
                    I understand this saved expiration has passed and customer access will be ended now.
                  </label>
                )}
                {notice && <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
                <button type="submit" disabled={saving || (endsImmediately && !confirmImmediateExpiration)}
                  className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-5 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto">
                  <Check className="h-4 w-4" /> {saving ? "Saving..." : "Save customer dates"}
                </button>
              </form>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
