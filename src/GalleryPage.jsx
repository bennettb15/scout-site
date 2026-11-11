import { useEffect, useMemo, useRef, useState } from "react";
import { hasSupabaseConfig, supabase } from "./lib/supabaseClient";
import { readPortalContext } from "./lib/portalContext";
import "./GalleryPage.css";

const INITIAL_SESSION_COUNT = 4;
const MORE_SESSION_COUNT = 4;

function dateValue(reportPackage) {
  return reportPackage.sessionCompletedAt || reportPackage.completedAt || reportPackage.session?.completedAt || reportPackage.session?.startedAt || "";
}

function dateLabel(value, options) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Undated" : new Intl.DateTimeFormat("en-US", options).format(date);
}

function propertyLabel(property) {
  const location = [property.addressLine1, property.city, property.state].filter(Boolean).join(", ");
  return property.name && location ? `${property.name} · ${location}` : property.name || location || "Property";
}

function photoLabel(photo) {
  return photo.displayName || "Property photo";
}

async function getJson(url, accessToken, signal) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Unable to load gallery data.");
  return body;
}

export default function GalleryPage() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [orgs, setOrgs] = useState([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [orgsError, setOrgsError] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [packages, setPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [packagesError, setPackagesError] = useState("");
  const [year, setYear] = useState("all");
  const [visibleCount, setVisibleCount] = useState(INITIAL_SESSION_COUNT);
  const [photosByPackage, setPhotosByPackage] = useState({});
  const [viewer, setViewer] = useState(null);
  const requestedPhotos = useRef(new Set());
  const closeButtonRef = useRef(null);

  useEffect(() => {
    document.title = "Gallery | SCOUT";
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
      if (active) setSession(nextSession || null);
    });
    return () => { active = false; subscription?.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      setOrgs([]);
      setPropertyId("");
      setPackages([]);
      setPhotosByPackage({});
      return;
    }
    const controller = new AbortController();
    setOrgsLoading(true);
    setOrgsError("");
    getJson("/api/report-orgs", session.access_token, controller.signal)
      .then((body) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(body.orgs)) throw new Error("Unable to load properties.");
        setOrgs(body.orgs);
        const requestedId = new URLSearchParams(window.location.search).get("propertyId");
        const savedId = readPortalContext(session).propertyId;
        const available = body.orgs.flatMap((org) => org.properties || []);
        const initialId = [requestedId, savedId].find((id) => id && id !== "all" && available.some((property) => property.id === id));
        setPropertyId(initialId || "");
      })
      .catch((error) => { if (error.name !== "AbortError") setOrgsError(error.message || "Unable to load properties."); })
      .finally(() => { if (!controller.signal.aborted) setOrgsLoading(false); });
    return () => controller.abort();
  }, [session?.access_token]);

  const properties = useMemo(() => orgs.flatMap((org) => (org.properties || []).map((property) => ({
    ...property,
    orgId: org.id,
    orgName: org.name,
  }))).sort((a, b) => propertyLabel(a).localeCompare(propertyLabel(b))), [orgs]);
  const property = properties.find((item) => item.id === propertyId) || null;

  useEffect(() => {
    setPackages([]);
    setPhotosByPackage({});
    requestedPhotos.current.clear();
    setPackagesError("");
    setYear("all");
    setVisibleCount(INITIAL_SESSION_COUNT);
    setViewer(null);
    if (!session?.access_token || !property) return;
    const controller = new AbortController();
    setPackagesLoading(true);
    const params = new URLSearchParams({ orgId: property.orgId, history: "all" });
    getJson(`/api/report-packages?${params}`, session.access_token, controller.signal)
      .then((body) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(body.packages)) throw new Error("Unable to load gallery sessions.");
        setPackages(body.packages
          .filter((item) => item.property?.id === property.id && item.originalPhotoCount > 0)
          .sort((a, b) => new Date(dateValue(b)).getTime() - new Date(dateValue(a)).getTime()));
      })
      .catch((error) => { if (error.name !== "AbortError") setPackagesError(error.message || "Unable to load gallery sessions."); })
      .finally(() => { if (!controller.signal.aborted) setPackagesLoading(false); });
    return () => controller.abort();
  }, [session?.access_token, propertyId, property?.orgId]);

  const propertyPackages = useMemo(() => packages.filter((item) => item.property?.id === propertyId), [packages, propertyId]);
  const years = useMemo(() => [...new Set(propertyPackages.map((item) => {
    const date = new Date(dateValue(item));
    return Number.isNaN(date.getTime()) ? "" : String(date.getFullYear());
  }).filter(Boolean))], [propertyPackages]);
  const filteredPackages = useMemo(() => propertyPackages.filter((item) => year === "all" || String(new Date(dateValue(item)).getFullYear()) === year), [propertyPackages, year]);
  const visiblePackages = useMemo(() => filteredPackages.slice(0, visibleCount), [filteredPackages, visibleCount]);

  useEffect(() => {
    if (!session?.access_token || !property) return;
    const controller = new AbortController();
    const pending = new Set();
    for (const item of visiblePackages) {
      if (requestedPhotos.current.has(item.id)) continue;
      requestedPhotos.current.add(item.id);
      pending.add(item.id);
      setPhotosByPackage((current) => ({ ...current, [item.id]: { loading: true, photos: [], error: "" } }));
      getJson(`/api/original-photos?packageId=${encodeURIComponent(item.id)}`, session.access_token, controller.signal)
        .then((body) => {
          pending.delete(item.id);
          if (controller.signal.aborted) return;
          if (!Array.isArray(body.photos)) throw new Error("Unable to load photos.");
          setPhotosByPackage((current) => ({ ...current, [item.id]: { loading: false, photos: body.photos, error: "" } }));
        })
        .catch((error) => {
          pending.delete(item.id);
          if (error.name === "AbortError") return;
          setPhotosByPackage((current) => ({ ...current, [item.id]: { loading: false, photos: [], error: error.message || "Unable to load photos." } }));
        });
    }
    return () => {
      controller.abort();
      for (const id of pending) requestedPhotos.current.delete(id);
    };
  }, [session?.access_token, propertyId, visiblePackages]);

  const groups = useMemo(() => {
    const result = [];
    for (const item of visiblePackages) {
      const month = dateLabel(dateValue(item), { month: "long", year: "numeric" });
      let group = result[result.length - 1];
      if (!group || group.month !== month) {
        group = { month, packages: [] };
        result.push(group);
      }
      group.packages.push(item);
    }
    return result;
  }, [visiblePackages]);

  const viewerPhotos = viewer ? photosByPackage[viewer.packageId]?.photos || [] : [];
  const activePhoto = viewer?.propertyId === propertyId ? viewerPhotos[viewer.index] : null;
  useEffect(() => {
    if (!viewer) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") setViewer(null);
      if (event.key === "ArrowLeft") setViewer((current) => current && ({ ...current, index: (current.index - 1 + viewerPhotos.length) % viewerPhotos.length }));
      if (event.key === "ArrowRight") setViewer((current) => current && ({ ...current, index: (current.index + 1) % viewerPhotos.length }));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewer?.packageId, viewerPhotos.length]);

  async function handleSignIn(event) {
    event.preventDefault();
    setAuthError("");
    if (!supabase) { setAuthError("Sign in is unavailable right now."); return; }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setAuthError(error.message || "Unable to sign in.");
  }

  function handlePropertyChange(id) {
    setPropertyId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("propertyId", id);
    else url.searchParams.delete("propertyId");
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="gallery-page">
      <header className="gallery-header">
        <div className="gallery-header-inner">
          <a href="/" aria-label="SCOUT home"><img src="/Scout Only Logo Navy Dark NEW.png" alt="SCOUT" /></a>
          <div className="gallery-header-actions">
            <span>Property Gallery</span>
            {session && <button type="button" onClick={() => supabase.auth.signOut()}>Sign out</button>}
          </div>
        </div>
      </header>
      <main className="gallery-main">
        <div className="gallery-intro">
          <p className="gallery-eyebrow">Client Portal / Gallery</p>
          <h1>Property gallery</h1>
          <p>Explore the photo history for one property at a time.</p>
        </div>

        {authLoading && <div className="gallery-panel">Checking session…</div>}
        {!authLoading && !session && <form className="gallery-panel gallery-signin" onSubmit={handleSignIn}>
          <h2>Sign in to view your gallery</h2>
          <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {authError && <p className="gallery-error" role="alert">{authError}</p>}
          <button className="gallery-primary" type="submit">Sign in</button>
          <a href="/forgot-password">Forgot password?</a>
        </form>}

        {session && <>
          <section className="gallery-controls" aria-label="Gallery filters">
            <label>Property
              <select value={propertyId} onChange={(event) => handlePropertyChange(event.target.value)} disabled={orgsLoading || !properties.length}>
                <option value="">Choose a property</option>
                {properties.map((item) => <option key={item.id} value={item.id}>{propertyLabel(item)}{orgs.length > 1 ? ` · ${item.orgName}` : ""}</option>)}
              </select>
            </label>
            {property && <label>Year
              <select value={year} onChange={(event) => { setYear(event.target.value); setVisibleCount(INITIAL_SESSION_COUNT); }}>
                <option value="all">All dates</option>
                {years.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>}
          </section>
          {orgsLoading && <div className="gallery-panel">Loading properties…</div>}
          {orgsError && <div className="gallery-panel gallery-error" role="alert">{orgsError}</div>}
          {!orgsLoading && !orgsError && !property && <div className="gallery-panel gallery-empty">Choose a property to see its photos.</div>}
          {property && <>
            <div className="gallery-property-title"><div><p className="gallery-eyebrow">Selected property</p><h2>{property.name || propertyLabel(property)}</h2><p>{[property.addressLine1, property.city, property.state, property.postalCode].filter(Boolean).join(", ")}</p></div><span>{propertyPackages.length} {propertyPackages.length === 1 ? "session" : "sessions"}</span></div>
            {packagesLoading && <div className="gallery-panel">Loading photo history…</div>}
            {packagesError && <div className="gallery-panel gallery-error" role="alert">{packagesError}</div>}
            {!packagesLoading && !packagesError && propertyPackages.length === 0 && <div className="gallery-panel gallery-empty">No gallery photos are available for this property yet.</div>}
            {!packagesLoading && !packagesError && propertyPackages.length > 0 && filteredPackages.length === 0 && <div className="gallery-panel gallery-empty">No photos match this year.</div>}
            {!packagesLoading && !packagesError && groups.map((group) => <section className="gallery-month" key={group.month} aria-label={group.month}>
              <h2>{group.month}</h2>
              {group.packages.map((item) => {
                const photoState = photosByPackage[item.id];
                return <article className="gallery-session" key={item.id}>
                  <div className="gallery-session-heading"><div><time dateTime={dateValue(item)}>{dateLabel(dateValue(item), { month: "long", day: "numeric", year: "numeric" })}</time><h3>{item.session?.title || "Photo session"}</h3></div><span>{item.originalPhotoCount} {item.originalPhotoCount === 1 ? "photo" : "photos"}</span></div>
                  {(!photoState || photoState.loading) && <p className="gallery-muted">Loading photos…</p>}
                  {photoState?.error && <p className="gallery-error" role="alert">{photoState.error}</p>}
                  {photoState && !photoState.loading && !photoState.error && <div className="gallery-grid">{photoState.photos.map((photo, index) => <button className="gallery-photo" key={photo.id} type="button" onClick={() => setViewer({ propertyId, packageId: item.id, index })} aria-label={`Open ${photoLabel(photo)}`}>
                    {photo.previewUrl ? <img src={photo.previewUrl} alt="" loading="lazy" /> : <span className="gallery-no-preview">Preview unavailable</span>}
                    <span className="gallery-photo-caption">{photoLabel(photo)}</span>
                  </button>)}</div>}
                </article>;
              })}
            </section>)}
            {visibleCount < filteredPackages.length && <button className="gallery-more" type="button" onClick={() => setVisibleCount((count) => count + MORE_SESSION_COUNT)}>Load older sessions</button>}
            {propertyPackages.length >= 50 && <p className="gallery-limit">Showing the latest 50 completed sessions for this property.</p>}
          </>}
        </>}
      </main>
      {activePhoto && <div className="gallery-lightbox" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewer(null); }}>
        <div className="gallery-lightbox-inner" role="dialog" aria-modal="true" aria-label="Photo viewer">
          <div className="gallery-lightbox-toolbar"><span>{viewer.index + 1} of {viewerPhotos.length}</span><button ref={closeButtonRef} type="button" onClick={() => setViewer(null)} aria-label="Close photo viewer">Close ×</button></div>
          {activePhoto.previewUrl ? <img src={activePhoto.previewUrl} alt={photoLabel(activePhoto)} /> : <p>Preview unavailable for this photo.</p>}
          <div className="gallery-lightbox-footer"><button type="button" onClick={() => setViewer((current) => ({ ...current, index: (current.index - 1 + viewerPhotos.length) % viewerPhotos.length }))} disabled={viewerPhotos.length < 2}>← Previous</button><div><strong>{photoLabel(activePhoto)}</strong><span>{dateLabel(activePhoto.capturedAt, { month: "long", day: "numeric", year: "numeric" })}</span></div><button type="button" onClick={() => setViewer((current) => ({ ...current, index: (current.index + 1) % viewerPhotos.length }))} disabled={viewerPhotos.length < 2}>Next →</button></div>
        </div>
      </div>}
    </div>
  );
}
