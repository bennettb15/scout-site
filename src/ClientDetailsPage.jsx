import { Fragment, useEffect, useMemo, useState } from "react";
import { ClipboardList, FileText, RefreshCw } from "lucide-react";
import { hasSupabaseConfig, supabase } from "./lib/supabaseClient";
import { readPortalContext, writePortalContext } from "./lib/portalContext";
import AccountMenu from "./components/AccountMenu";

const BRAND_NAVY = "#1C2742";

function propertyAddress(property) {
  const locality = [property.city, property.state, property.postalCode].filter(Boolean).join(" ");
  return [property.addressLine1, property.addressLine2, locality].filter(Boolean).join(", ");
}

function ClientRow({ property, session, onSaved }) {
  const [email, setEmail] = useState(property.clientEmail);
  const [phone, setPhone] = useState(property.clientPhone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const formId = `client-contact-${property.id}`;
  const changed = email.trim() !== property.clientEmail || phone.trim() !== property.clientPhone;

  useEffect(() => {
    setEmail(property.clientEmail);
    setPhone(property.clientPhone);
    setError("");
  }, [property.clientEmail, property.clientPhone]);

  async function handleSave(event) {
    event.preventDefault();
    if (!property.canEdit || !changed) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/client-details", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          propertyId: property.id,
          revision: property.revision,
          clientEmail: email,
          clientPhone: phone,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.property) {
        throw new Error(body.error || "Unable to save contact details.");
      }
      onSaved(body.property);
      setSaved(true);
    } catch (saveError) {
      setError(saveError.message || "Unable to save contact details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Fragment>
      <tr className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50/70">
        <th scope="row" className="sticky left-0 z-10 min-w-[170px] border-r border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-foreground">
          {property.clientName || <span className="font-normal text-foreground/45">No name</span>}
        </th>
        <td className="min-w-[160px] border-r border-slate-200 px-3 py-2 text-sm text-foreground/75">{property.propertyName || "Property"}</td>
        <td className="min-w-[245px] max-w-[340px] border-r border-slate-200 px-3 py-2 text-sm text-foreground/75" title={propertyAddress(property)}>
          <div className="truncate">{propertyAddress(property) || <span className="text-foreground/45">No address</span>}</div>
        </td>
        <td className="min-w-[220px] border-r border-slate-200 px-2 py-1.5 text-sm">
          {property.canEdit ? (
            <input
              form={formId}
              type="email"
              aria-label={`Email for ${property.clientName || property.propertyName || "client"}`}
              value={email}
              maxLength={254}
              onChange={(event) => { setEmail(event.target.value); setSaved(false); }}
              placeholder="Add email"
              className="h-9 w-full rounded border border-slate-200 bg-white px-2 outline-none hover:border-slate-400 focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            />
          ) : <span className="px-2 text-foreground/75">{property.clientEmail || "—"}</span>}
        </td>
        <td className="min-w-[155px] border-r border-slate-200 px-2 py-1.5 text-sm">
          {property.canEdit ? (
            <input
              form={formId}
              type="tel"
              aria-label={`Phone for ${property.clientName || property.propertyName || "client"}`}
              value={phone}
              maxLength={40}
              onChange={(event) => { setPhone(event.target.value); setSaved(false); }}
              placeholder="Add phone"
              className="h-9 w-full rounded border border-slate-200 bg-white px-2 outline-none hover:border-slate-400 focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            />
          ) : <span className="px-2 text-foreground/75">{property.clientPhone || "—"}</span>}
        </td>
        <td className="min-w-[90px] px-3 py-1.5 text-right text-xs">
          {property.canEdit ? (
            <form id={formId} onSubmit={handleSave}>
              {changed || saving ? (
                <button type="submit" disabled={saving} className="h-8 rounded-md bg-[var(--brand)] px-3 font-semibold text-white disabled:opacity-60">
                  {saving ? "Saving…" : "Save"}
                </button>
              ) : saved ? <span className="font-semibold text-green-700">Saved</span> : null}
            </form>
          ) : <span className="text-foreground/45">View only</span>}
        </td>
      </tr>
      {error && (
        <tr className="border-b border-slate-200 bg-red-50">
          <td colSpan={6} role="alert" className="px-3 py-2 text-sm font-medium text-red-700">{error}</td>
        </tr>
      )}
    </Fragment>
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

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

  function handleSaved(updated) {
    setProperties((current) => current.map((item) => item.id === updated.id ? updated : item));
  }

  return (
    <div style={{ "--brand": BRAND_NAVY }} className="min-h-screen bg-slate-50 text-foreground">
      <header className="border-b border-border bg-background/95">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6">
          <a href="/"><img src="/Scout Only Logo Navy Dark NEW.png" alt="SCOUT" className="h-10 w-auto" /></a>
          <nav className="flex flex-wrap items-center gap-2" aria-label="Portal">
            <a href="/reports" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium"><FileText className="h-4 w-4" />Reports</a>
            <a href="/punch-list" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium"><ClipboardList className="h-4 w-4" />Punch List</a>
            {session && <AccountMenu onSignOut={() => supabase.auth.signOut()} />}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-screen-2xl px-4 py-6 md:px-6">
        <div className="mb-5"><div className="text-sm font-medium text-[var(--brand)]">Client Portal</div><h1 className="text-2xl font-semibold">Clients</h1></div>
        {authLoading && <p className="text-sm text-foreground/65">Checking your session…</p>}
        {!authLoading && !session && (
          <form onSubmit={handleSignIn} className="grid max-w-md gap-4 rounded-xl border border-border bg-background p-6 shadow-sm">
            <p className="text-sm text-foreground/65">Sign in to see the clients for your organization.</p>
            <label className="grid gap-1 text-sm font-medium">Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 rounded-lg border border-input px-3" /></label>
            <label className="grid gap-1 text-sm font-medium">Password<input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 rounded-lg border border-input px-3" /></label>
            {authError && <p role="alert" className="text-sm text-red-700">{authError}</p>}
            <button type="submit" className="h-11 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white">Sign In</button>
            <a href="/forgot-password" className="text-center text-sm font-medium text-[var(--brand)]">Forgot password?</a>
          </form>
        )}
        {session && (
          <>
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <label className="grid min-w-[190px] gap-1 text-xs font-semibold text-foreground/60">Organization
                <select value={orgId} onChange={(event) => { setOrgId(event.target.value); writePortalContext(session, { orgId: event.target.value, propertyId: "all" }); }} disabled={!orgs.length} className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                  {!orgs.length && <option value="">No organizations</option>}
                  {orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
                </select>
              </label>
              <label className="grid min-w-[220px] flex-1 gap-1 text-xs font-semibold text-foreground/60">Search
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Client, property, address, email, phone" className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground" />
              </label>
              <span className="pb-2 text-xs tabular-nums text-foreground/50">{shownProperties.length} {shownProperties.length === 1 ? "row" : "rows"}</span>
            </div>
            {error && <div role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            {loading && <p className="mb-3 flex items-center gap-2 text-sm text-foreground/60"><RefreshCw className="h-4 w-4 animate-spin" />Loading clients…</p>}
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[1040px] border-collapse text-left">
                <thead className="bg-slate-100 text-xs font-semibold uppercase tracking-wide text-foreground/60">
                  <tr>
                    <th scope="col" className="sticky left-0 z-20 border-r border-slate-200 bg-slate-100 px-3 py-2.5">Client</th>
                    <th scope="col" className="border-r border-slate-200 px-3 py-2.5">Property</th>
                    <th scope="col" className="border-r border-slate-200 px-3 py-2.5">Address</th>
                    <th scope="col" className="border-r border-slate-200 px-3 py-2.5">Email</th>
                    <th scope="col" className="border-r border-slate-200 px-3 py-2.5">Phone</th>
                    <th scope="col" className="px-3 py-2.5 text-right"> </th>
                  </tr>
                </thead>
                <tbody>
                  {!loading && !error && !shownProperties.length && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-foreground/60">{search ? "No clients match your search." : "No properties are available for this organization."}</td></tr>
                  )}
                  {shownProperties.map((property) => <ClientRow key={property.id} property={property} session={session} onSaved={handleSaved} />)}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-foreground/50">Email and phone can be edited by owners and managers. Each row is one property record.</p>
          </>
        )}
      </main>
    </div>
  );
}
