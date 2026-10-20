import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ClipboardList, FileText, Mail, Pencil, Phone, RefreshCw } from "lucide-react";
import { hasSupabaseConfig, supabase } from "./lib/supabaseClient";
import { readPortalContext, writePortalContext } from "./lib/portalContext";
import {
  changedClientProperties,
  contactDraftForProperty,
  formatClientPhone,
  saveClientContactChanges,
} from "./lib/clientContactChanges";
import AccountMenu from "./components/AccountMenu";

const BRAND_NAVY = "#1C2742";

function propertyAddress(property) {
  const locality = [property.city, property.state, property.postalCode].filter(Boolean).join(" ");
  return [property.addressLine1, property.addressLine2, locality].filter(Boolean).join(", ");
}

function ClientRow({ property, session, draft, saving, onDraftChange }) {
  const [showDestinations, setShowDestinations] = useState(false);

  function selectShortcutProperty() {
    writePortalContext(session, { orgId: property.orgId, propertyId: property.id });
  }

  return (
    <Fragment>
      <tr className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50/70">
        <th scope="row" className="sticky left-0 z-10 min-w-[170px] border-r border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-foreground">
          <button
            type="button"
            aria-expanded={showDestinations}
            aria-controls={`client-destinations-${property.id}`}
            onClick={() => setShowDestinations((current) => !current)}
            className="inline-flex items-center gap-1 text-left font-semibold text-[var(--brand)] underline underline-offset-2 hover:text-blue-700"
          >
            {property.propertyName || "Property"}
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${showDestinations ? "rotate-180" : ""}`} />
          </button>
        </th>
        <td className="min-w-[160px] border-r border-slate-200 px-3 py-2 text-sm text-foreground/75">{property.clientName || <span className="text-foreground/45">No name</span>}</td>
        <td className="min-w-[245px] max-w-[340px] border-r border-slate-200 px-3 py-2 text-sm text-foreground/75" title={propertyAddress(property)}>
          <div className="truncate">{propertyAddress(property) || <span className="text-foreground/45">No address</span>}</div>
        </td>
        <td className="min-w-[220px] border-r border-slate-200 px-2 py-1.5 text-sm">
          {property.canEdit ? (
            <input
              type="email"
              aria-label={`Email for ${property.clientName || property.propertyName || "client"}`}
              value={draft.clientEmail}
              maxLength={254}
              disabled={saving}
              onChange={(event) => onDraftChange(property, "clientEmail", event.target.value)}
              placeholder="Add email"
              className="h-9 w-full rounded border border-slate-200 bg-white px-2 outline-none hover:border-slate-400 focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15 disabled:opacity-60"
            />
          ) : <span className="px-2 text-foreground/75">{property.clientEmail || "—"}</span>}
        </td>
        <td className="min-w-[155px] border-r border-slate-200 px-2 py-1.5 text-sm">
          {property.canEdit ? (
            <input
              type="tel"
              aria-label={`Phone for ${property.clientName || property.propertyName || "client"}`}
              value={draft.clientPhone}
              maxLength={40}
              disabled={saving}
              onChange={(event) => onDraftChange(property, "clientPhone", event.target.value)}
              onBlur={(event) => onDraftChange(property, "clientPhone", formatClientPhone(event.target.value))}
              placeholder="Add phone"
              className="h-9 w-full rounded border border-slate-200 bg-white px-2 outline-none hover:border-slate-400 focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15 disabled:opacity-60"
            />
          ) : <span className="px-2 text-foreground/75">{formatClientPhone(property.clientPhone) || "—"}</span>}
        </td>
      </tr>
      {showDestinations && (
        <tr id={`client-destinations-${property.id}`} className="border-b border-slate-200 bg-slate-50">
          <td colSpan={5} className="px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="mr-1 text-foreground/60">Open {property.propertyName || "property"} in:</span>
              <a href="/reports" onClick={selectShortcutProperty} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-[var(--brand)] hover:border-[var(--brand)]">Reports</a>
              <a href="/punch-list" onClick={selectShortcutProperty} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-[var(--brand)] hover:border-[var(--brand)]">Punch List</a>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function MobileContactField({ label, icon: Icon, propertyName, type, value, displayValue, placeholder, canEdit, saving, onChange, onBlur }) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="min-w-0">
      <span className="sr-only">{label}</span>
      {canEdit && editing ? (
        <div className="flex min-h-9 items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 shrink-0 text-foreground/45" aria-hidden="true" />
          <input
            autoFocus
            type={type}
            aria-label={`${label} for ${propertyName}`}
            value={value}
            maxLength={type === "email" ? 254 : 40}
            disabled={saving}
            onChange={(event) => onChange(event.target.value)}
            onBlur={(event) => {
              onBlur?.(event.target.value);
              setEditing(false);
            }}
            placeholder={placeholder}
            className="h-9 w-full min-w-0 rounded-none border-0 border-b border-[var(--brand)] bg-transparent px-0 text-base font-normal normal-case tracking-normal text-foreground outline-none disabled:opacity-60"
          />
        </div>
      ) : canEdit ? (
        <button
          type="button"
          aria-label={`Edit ${label.toLowerCase()} for ${propertyName}: ${displayValue || placeholder}`}
          disabled={saving}
          onClick={() => setEditing(true)}
          className={`flex min-h-9 w-full items-center gap-1.5 text-left text-[13px] disabled:opacity-60 ${displayValue ? "text-foreground/70" : "text-foreground/45"}`}
        >
          <Icon className="h-3.5 w-3.5 shrink-0 text-foreground/45" aria-hidden="true" />
          <span className="min-w-0 break-all">{displayValue || placeholder}</span>
          <Pencil className="ml-auto h-3 w-3 shrink-0 text-foreground/35" aria-hidden="true" />
        </button>
      ) : (
        <span className="flex min-h-9 items-center gap-1.5 break-all text-[13px] text-foreground/70">
          <Icon className="h-3.5 w-3.5 shrink-0 text-foreground/45" aria-hidden="true" />
          {displayValue || "—"}
        </span>
      )}
    </div>
  );
}

function MobileClientRow({ property, session, draft, saving, onDraftChange }) {
  const [showDestinations, setShowDestinations] = useState(false);

  function selectShortcutProperty() {
    writePortalContext(session, { orgId: property.orgId, propertyId: property.id });
  }

  return (
    <article className="border-b border-slate-200 bg-white px-4 py-3 last:border-b-0">
      <button
        type="button"
        aria-expanded={showDestinations}
        aria-controls={`mobile-client-destinations-${property.id}`}
        onClick={() => setShowDestinations((current) => !current)}
        className="inline-flex max-w-full min-w-0 items-center gap-1 text-left text-sm font-semibold text-[var(--brand)] underline underline-offset-2"
      >
        <span className="break-words">{property.propertyName || "Property"}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${showDestinations ? "rotate-180" : ""}`} />
      </button>
      {showDestinations && (
        <div id={`mobile-client-destinations-${property.id}`} className="mt-2 flex flex-wrap gap-2">
          <a href="/reports" onClick={selectShortcutProperty} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-[var(--brand)]">Reports</a>
          <a href="/punch-list" onClick={selectShortcutProperty} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-[var(--brand)]">Punch List</a>
        </div>
      )}
      <p className="mt-1 break-words text-xs leading-snug text-foreground/55">
        {propertyAddress(property) || "No address on file"}
      </p>
      <div className="mt-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/45">Client</div>
        <h2 className="min-w-0 break-words text-base font-semibold leading-tight text-foreground">
          {property.clientName || "No client name"}
        </h2>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <MobileContactField
            label="Email"
            icon={Mail}
            propertyName={property.propertyName || "property"}
            type="email"
            value={draft.clientEmail}
            displayValue={draft.clientEmail}
            placeholder="Add email"
            canEdit={property.canEdit}
            saving={saving}
            onChange={(value) => onDraftChange(property, "clientEmail", value)}
          />
        </div>
        <div className="min-w-0">
          <MobileContactField
            label="Phone"
            icon={Phone}
            propertyName={property.propertyName || "property"}
            type="tel"
            value={draft.clientPhone}
            displayValue={formatClientPhone(draft.clientPhone)}
            placeholder="Add phone"
            canEdit={property.canEdit}
            saving={saving}
            onChange={(value) => onDraftChange(property, "clientPhone", value)}
            onBlur={(value) => onDraftChange(property, "clientPhone", formatClientPhone(value))}
          />
        </div>
      </div>
    </article>
  );
}

export default function ClientDetailsPage() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(Boolean(hasSupabaseConfig && supabase));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [orgs, setOrgs] = useState([]);
  const [orgId, setOrgId] = useState("");
  const [properties, setProperties] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    document.title = "Client Details | SCOUT";
    document.documentElement.style.setProperty("--brand", BRAND_NAVY);
    if (!hasSupabaseConfig || !supabase) {
      return undefined;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session || null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession || null);
    });
    return () => { active = false; subscription?.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      return undefined;
    }
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        setLoading(true);
        setError("");
      }
    });
    fetch("/api/report-orgs", { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(body.orgs)) throw new Error(body.error || "Unable to load organizations.");
        return body.orgs;
      })
      .then((rows) => {
        if (!active) return;
        setOrgs(rows);
        const savedOrgId = readPortalContext(session).orgId;
        setOrgId(rows.find((row) => row.id === savedOrgId)?.id || rows[0]?.id || "");
      })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session]);

  useEffect(() => {
    if (!session?.access_token || !orgId) return undefined;
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        setLoading(true);
        setError("");
        setProperties([]);
      }
    });
    fetch(`/api/client-details?orgId=${encodeURIComponent(orgId)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(body.properties)) throw new Error(body.error || "Unable to load client details.");
        return body.properties;
      })
      .then((rows) => { if (active) setProperties(rows); })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session, orgId]);

  const shownProperties = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return properties;
    return properties.filter((property) =>
      [property.clientName, property.propertyName, propertyAddress(property), property.clientEmail, property.clientPhone]
        .some((value) => String(value || "").toLowerCase().includes(term))
    );
  }, [properties, search]);

  const changedProperties = useMemo(
    () => changedClientProperties(properties, drafts),
    [properties, drafts]
  );

  async function handleSignIn(event) {
    event.preventDefault();
    setAuthError("");
    if (!supabase) {
      setAuthError("Sign-in is unavailable.");
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) setAuthError(signInError.message || "Unable to sign in.");
  }

  function handleDraftChange(property, field, value) {
    setDrafts((current) => ({
      ...current,
      [property.id]: { ...contactDraftForProperty(property, current), [field]: value },
    }));
    setSaveStatus("");
    setSaveError("");
  }

  async function handleSaveAll() {
    if (!session?.access_token || saving || changedProperties.length === 0) return;
    setSaving(true);
    setSaveStatus("");
    setSaveError("");
    try {
      const { saved, failed } = await saveClientContactChanges({
        properties,
        drafts,
        accessToken: session.access_token,
      });
      if (saved.length) {
        const byId = new Map(saved.map((property) => [property.id, property]));
        setProperties((current) => current.map((property) => byId.get(property.id) || property));
        setDrafts((current) => {
          const next = { ...current };
          for (const property of saved) delete next[property.id];
          return next;
        });
        setSaveStatus(`Saved ${saved.length} ${saved.length === 1 ? "property" : "properties"}.`);
      }
      if (failed.length) {
        const first = failed[0];
        setSaveError(`${failed.length} ${failed.length === 1 ? "property" : "properties"} could not be saved. ${first.property.propertyName || "Property"}: ${first.error}`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    setDrafts({});
    setProperties([]);
    setOrgs([]);
    setOrgId("");
    setSaveStatus("");
    setSaveError("");
    await supabase.auth.signOut();
  }

  return (
    <div style={{ "--brand": BRAND_NAVY }} className="min-h-screen bg-slate-50 text-foreground">
      <header className="border-b border-border bg-background/95">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6">
          <a href="/"><img src="/Scout Only Logo Navy Dark NEW.png" alt="SCOUT" className="h-10 w-auto" /></a>
          <nav className="flex flex-wrap items-center gap-2" aria-label="Portal">
            <a href="/reports" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium"><FileText className="h-4 w-4" />Reports</a>
            <a href="/punch-list" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium"><ClipboardList className="h-4 w-4" />Punch List</a>
            {session && <AccountMenu onSignOut={handleSignOut} />}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-screen-2xl px-4 py-6 md:px-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4 sm:mb-5">
          <div>
            <div className="hidden text-sm font-medium text-[var(--brand)] sm:block">Client Portal</div>
            <h1 className="text-2xl font-semibold">Clients</h1>
            {session && <p className="mt-0.5 text-xs text-foreground/50 sm:hidden">{shownProperties.length} {shownProperties.length === 1 ? "property" : "properties"}</p>}
          </div>
          {session && (
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={saving || changedProperties.length === 0}
                style={{
                  backgroundColor: changedProperties.length > 0 ? BRAND_NAVY : "#e5e7eb",
                  color: changedProperties.length > 0 ? "#ffffff" : "#64748b",
                  borderColor: changedProperties.length > 0 ? BRAND_NAVY : "#cbd5e1",
                }}
                className="h-10 min-w-[132px] rounded-lg border px-4 text-sm font-semibold shadow-sm disabled:cursor-not-allowed"
              >
                {saving ? "Saving…" : changedProperties.length ? `Save changes (${changedProperties.length})` : "Save changes"}
              </button>
              {saveStatus && <span role="status" className="text-xs font-medium text-green-700">{saveStatus}</span>}
            </div>
          )}
        </div>
        {authLoading && <p className="text-sm text-foreground/65">Checking your session…</p>}
        {!authLoading && !session && (
          <form onSubmit={handleSignIn} className="grid max-w-md gap-4 rounded-xl border border-border bg-background p-6 shadow-sm">
            <p className="text-sm text-foreground/65">Sign in to see the clients for your organization.</p>
            <label className="grid gap-1 text-sm font-medium">Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 rounded-lg border border-input px-3 text-base" /></label>
            <label className="grid gap-1 text-sm font-medium">Password<input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 rounded-lg border border-input px-3 text-base" /></label>
            {authError && <p role="alert" className="text-sm text-red-700">{authError}</p>}
            <button type="submit" className="h-11 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white">Sign In</button>
            <a href="/forgot-password" className="text-center text-sm font-medium text-[var(--brand)]">Forgot password?</a>
          </form>
        )}
        {session && (
          <>
            <div className="mb-3 grid gap-3 sm:grid-cols-[minmax(190px,220px)_minmax(0,1fr)_auto] sm:items-end">
              <label className="grid min-w-0 gap-1 text-xs font-semibold text-foreground/60">Organization
                <select value={orgId} onChange={(event) => { setOrgId(event.target.value); setSaveStatus(""); setSaveError(""); writePortalContext(session, { orgId: event.target.value, propertyId: "all" }); }} disabled={!orgs.length || saving} className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground sm:h-9 sm:text-sm">
                  {!orgs.length && <option value="">No organizations</option>}
                  {orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
                </select>
              </label>
              <label className="grid min-w-0 gap-1 text-xs font-semibold text-foreground/60">Search
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Client, property, address, email, phone" className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground sm:h-9 sm:text-sm" />
              </label>
              <span className="hidden justify-self-end text-xs tabular-nums text-foreground/50 sm:block sm:pb-2">{shownProperties.length} {shownProperties.length === 1 ? "row" : "rows"}</span>
            </div>
            {error && <div role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            {saveError && <div role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError}</div>}
            {loading && <p className="mb-3 flex items-center gap-2 text-sm text-foreground/60"><RefreshCw className="h-4 w-4 animate-spin" />Loading clients…</p>}
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:hidden">
              {!loading && !error && !shownProperties.length && (
                <p className="px-4 py-8 text-center text-sm text-foreground/60">{search ? "No clients match your search." : "No properties are available for this organization."}</p>
              )}
              {shownProperties.map((property) => (
                <MobileClientRow
                  key={property.id}
                  property={property}
                  session={session}
                  draft={contactDraftForProperty(property, drafts)}
                  saving={saving}
                  onDraftChange={handleDraftChange}
                />
              ))}
            </div>
            <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm lg:block">
              <table className="w-full min-w-[920px] border-collapse text-left">
                <thead className="bg-slate-100 text-xs font-semibold uppercase tracking-wide text-foreground/60">
                  <tr>
                    <th scope="col" className="sticky left-0 z-20 border-r border-slate-200 bg-slate-100 px-3 py-2.5">Property</th>
                    <th scope="col" className="border-r border-slate-200 px-3 py-2.5">Client name</th>
                    <th scope="col" className="border-r border-slate-200 px-3 py-2.5">Address</th>
                    <th scope="col" className="border-r border-slate-200 px-3 py-2.5">Email</th>
                    <th scope="col" className="border-r border-slate-200 px-3 py-2.5">Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {!loading && !error && !shownProperties.length && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-foreground/60">{search ? "No clients match your search." : "No properties are available for this organization."}</td></tr>
                  )}
                  {shownProperties.map((property) => (
                    <ClientRow
                      key={property.id}
                      property={property}
                      session={session}
                      draft={contactDraftForProperty(property, drafts)}
                      saving={saving}
                      onDraftChange={handleDraftChange}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-foreground/50">Owners and managers can edit email or phone, then save changes above. Each row is one property record.</p>
          </>
        )}
      </main>
    </div>
  );
}
