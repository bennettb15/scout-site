import { useEffect, useMemo, useState } from "react";
import { CircleUserRound, ClipboardList, FileText, RefreshCw } from "lucide-react";
import { hasSupabaseConfig, supabase } from "./lib/supabaseClient";
import { readPortalContext, writePortalContext } from "./lib/portalContext";
import AccountMenu from "./components/AccountMenu";

const BRAND_NAVY = "#1C2742";

function propertyAddress(property) {
  const locality = [property.city, property.state, property.postalCode].filter(Boolean).join(" ");
  return [property.addressLine1, property.addressLine2, locality].filter(Boolean).join(", ");
}

function ClientCard({ property, session, onSaved }) {
  const [email, setEmail] = useState(property.clientEmail);
  const [phone, setPhone] = useState(property.clientPhone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
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
    <article className="rounded-xl border border-border bg-background p-5 shadow-sm">
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-foreground/50">Property</div>
        <h2 className="mt-1 text-lg font-semibold text-foreground">{property.propertyName || "Property"}</h2>
        <p className="mt-1 text-sm text-foreground/65">{propertyAddress(property) || "No address on file"}</p>
      </div>
      <div className="mb-4 rounded-lg bg-slate-50 px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-foreground/50">Customer name</div>
        <div className="mt-1 text-sm font-medium text-foreground">{property.clientName || "No name on file"}</div>
      </div>
      {property.canEdit ? (
        <form onSubmit={handleSave} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-foreground/75">
              Email
              <input
                type="email"
                value={email}
                maxLength={254}
                onChange={(event) => { setEmail(event.target.value); setSaved(false); }}
                placeholder="customer@example.com"
                className="h-11 min-w-0 rounded-lg border border-input bg-background px-3 text-foreground outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-foreground/75">
              Phone
              <input
                type="tel"
                value={phone}
                maxLength={40}
                onChange={(event) => { setPhone(event.target.value); setSaved(false); }}
                placeholder="(555) 555-5555"
                className="h-11 min-w-0 rounded-lg border border-input bg-background px-3 text-foreground outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!changed || saving}
              className="inline-flex h-10 items-center rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {saving ? "Saving…" : "Save contact"}
            </button>
            {saved && <span className="text-sm font-medium text-green-700">Saved to SCOUT</span>}
          </div>
          {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
        </form>
      ) : (
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div><span className="font-medium text-foreground/55">Email</span><p className="mt-1 break-all">{property.clientEmail || "No email on file"}</p></div>
          <div><span className="font-medium text-foreground/55">Phone</span><p className="mt-1">{property.clientPhone || "No phone on file"}</p></div>
        </div>
      )}
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
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <div className="mb-6 flex items-center gap-3"><CircleUserRound className="h-7 w-7 text-[var(--brand)]" /><div><div className="text-sm font-medium text-[var(--brand)]">Client Portal</div><h1 className="text-3xl font-semibold">Client Details</h1></div></div>
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
            <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
              <label className="grid gap-1 text-sm font-medium">Organization
                <select value={orgId} onChange={(event) => { setOrgId(event.target.value); writePortalContext(session, { orgId: event.target.value, propertyId: "all" }); }} disabled={!orgs.length} className="h-11 min-w-0 rounded-lg border border-input bg-background px-3">
                  {!orgs.length && <option value="">No organizations</option>}
                  {orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">Search clients or properties
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, address, email, phone…" className="h-11 min-w-0 rounded-lg border border-input bg-background px-3" />
              </label>
            </div>
            <p className="mb-5 text-sm text-foreground/60">Contact details are stored with each property. Owners and managers can update email and phone.</p>
            {error && <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
            {loading && <p className="flex items-center gap-2 text-sm text-foreground/60"><RefreshCw className="h-4 w-4 animate-spin" />Loading client details…</p>}
            {!loading && !error && !shownProperties.length && <div className="rounded-xl border border-border bg-background p-6 text-sm text-foreground/65">{search ? "No clients match your search." : "No properties are available for this organization."}</div>}
            <div className="grid gap-4 lg:grid-cols-2">
              {shownProperties.map((property) => <ClientCard key={property.id} property={property} session={session} onSaved={handleSaved} />)}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
