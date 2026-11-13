import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, Flag, Search, SlidersHorizontal } from "lucide-react";
import AccountMenu from "./components/AccountMenu";
import PortalNavigation from "./components/PortalNavigation";
import { hasSupabaseConfig, supabase } from "./lib/supabaseClient";
import { readPortalContext } from "./lib/portalContext";
import { allDatePhotosSelected, filterGalleryPhotos, galleryDayKey, galleryPhotoStatus, gallerySessionDate, photoDateLabel, selectedGalleryPhotos, uniquePropertySessions, updateDatePhotoSelection } from "./lib/galleryData";
import "./GalleryPage.css";

const INITIAL_SESSION_COUNT = 4;
const MORE_SESSION_COUNT = 4;

const dateValue = gallerySessionDate;

function dateLabel(value, options) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Undated" : new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", ...options }).format(date);
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
  const [orgId, setOrgId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [packages, setPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [packagesError, setPackagesError] = useState("");
  const [year, setYear] = useState("all");
  const [photoStatus, setPhotoStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState({});
  const [downloading, setDownloading] = useState(false);
  const [selectingDate, setSelectingDate] = useState("");
  const [canOpenAdmin, setCanOpenAdmin] = useState(false);
  const [actionError, setActionError] = useState("");
  const [historyCapped, setHistoryCapped] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_SESSION_COUNT);
  const [photosByPackage, setPhotosByPackage] = useState({});
  const [viewer, setViewer] = useState(null);
  const requestedPhotos = useRef(new Set());
  const dateSelectionController = useRef(null);
  const closeButtonRef = useRef(null);
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(77);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const updateHeight = () => setHeaderHeight(header.getBoundingClientRect().height);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

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
      setOrgId("");
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
        const saved = readPortalContext(session);
        const requestedOrg = body.orgs.find((org) => (org.properties || []).some((property) => property.id === requestedId));
        const savedOrg = body.orgs.find((org) => org.id === saved.orgId);
        const initialOrg = requestedOrg || savedOrg || (body.orgs.length === 1 ? body.orgs[0] : null);
        const initialId = [requestedId, saved.propertyId].find((id) =>
          id && id !== "all" && (initialOrg?.properties || []).some((property) => property.id === id)
        );
        setOrgId(initialOrg?.id || "");
        setPropertyId(initialId || "");
      })
      .catch((error) => { if (error.name !== "AbortError") setOrgsError(error.message || "Unable to load properties."); })
      .finally(() => { if (!controller.signal.aborted) setOrgsLoading(false); });
    return () => controller.abort();
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.access_token) {
      setCanOpenAdmin(false);
      return;
    }
    const controller = new AbortController();
    getJson("/api/admin/me", session.access_token, controller.signal)
      .then((body) => {
        if (controller.signal.aborted) return;
        setCanOpenAdmin(body.isAdmin === true);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setCanOpenAdmin(false);
      });
    return () => controller.abort();
  }, [session?.access_token]);

  const selectedOrg = orgs.find((org) => org.id === orgId) || null;
  const properties = useMemo(() => (selectedOrg?.properties || []).map((property) => ({
    ...property,
    orgId: selectedOrg.id,
  })).sort((a, b) => propertyLabel(a).localeCompare(propertyLabel(b))), [selectedOrg]);
  const property = properties.find((item) => item.id === propertyId) || null;

  useEffect(() => () => dateSelectionController.current?.abort(), [propertyId, session?.access_token]);

  useEffect(() => {
    setPackages([]);
    setPhotosByPackage({});
    requestedPhotos.current.clear();
    setPackagesError("");
    setYear("all");
    setPhotoStatus("all");
    setQuery("");
    setSelectedIds({});
    setSelectingDate("");
    setActionError("");
    setHistoryCapped(false);
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
        setHistoryCapped(body.packages.filter((item) => item.property?.id === property.id).length >= 50);
        setPackages(uniquePropertySessions(body.packages, property.id));
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
  const selectedPhotos = useMemo(
    () => selectedGalleryPhotos(propertyPackages, photosByPackage, selectedIds),
    [propertyPackages, photosByPackage, selectedIds]
  );

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
          const photos = [...new Map(body.photos.map((photo) => [photo.id, photo])).values()];
          setPhotosByPackage((current) => ({ ...current, [item.id]: { loading: false, photos, error: "" } }));
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

  const viewerPhotos = viewer ? filterGalleryPhotos(photosByPackage[viewer.packageId]?.photos, photoStatus, query) : [];
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

  function handleOrgChange(id) {
    setOrgId(id);
    handlePropertyChange("");
  }

  function togglePhotoSelection(packageId, photoId) {
    setSelectedIds((current) => {
      const ids = new Set(current[packageId] || []);
      if (ids.has(photoId)) ids.delete(photoId);
      else ids.add(photoId);
      return { ...current, [packageId]: [...ids] };
    });
  }

  async function toggleDateSelection(dayKey, isSelected) {
    if (!session?.access_token || selectingDate) return;
    const datePackages = propertyPackages.filter((item) => galleryDayKey(item) === dayKey);
    if (!datePackages.length) return;
    if (isSelected) {
      setSelectedIds((current) => updateDatePhotoSelection(
        current,
        datePackages.map((item) => [item.id, photosByPackage[item.id].photos]),
        false
      ));
      return;
    }
    const controller = new AbortController();
    dateSelectionController.current = controller;
    setSelectingDate(dayKey);
    setActionError("");
    try {
      const datePhotos = [];
      for (let offset = 0; offset < datePackages.length; offset += 4) {
        const batch = await Promise.all(datePackages.slice(offset, offset + 4).map(async (item) => {
          const cached = photosByPackage[item.id];
          if (cached && !cached.loading && !cached.error && Array.isArray(cached.photos)) {
            return [item.id, cached.photos];
          }
          const body = await getJson(`/api/original-photos?packageId=${encodeURIComponent(item.id)}`, session.access_token, controller.signal);
          if (!Array.isArray(body.photos)) throw new Error("Unable to load all photos for this date.");
          return [item.id, [...new Map(body.photos.map((photo) => [photo.id, photo])).values()]];
        }));
        datePhotos.push(...batch);
      }
      if (controller.signal.aborted) return;
      for (const [packageId] of datePhotos) requestedPhotos.current.add(packageId);
      setPhotosByPackage((current) => {
        const next = { ...current };
        for (const [packageId, photos] of datePhotos) {
          next[packageId] = { loading: false, photos, error: "" };
        }
        return next;
      });
      setSelectedIds((current) => updateDatePhotoSelection(current, datePhotos, true));
    } catch (error) {
      if (error.name !== "AbortError") setActionError(error.message || "Unable to select all photos for this date.");
    } finally {
      if (dateSelectionController.current === controller) {
        dateSelectionController.current = null;
        setSelectingDate("");
      }
    }
  }

  function triggerDownload(url, filename) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename || "";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function downloadSelected() {
    if (!session?.access_token || !property || selectedPhotos.length === 0 || downloading) return;
    setDownloading(true);
    setActionError("");
    try {
      const response = await fetch("/api/gallery-download", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ propertyId: property.id, photos: selectedPhotos }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Unable to download selected photos.");
      }
      if (!(response.headers.get("content-type") || "").toLowerCase().startsWith("application/zip")) {
        throw new Error("Photo download did not return a ZIP.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const disposition = response.headers.get("content-disposition") || "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || "Gallery Photos.zip";
      triggerDownload(url, filename);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      setActionError(error.message || "Unable to download selected photos.");
    } finally {
      setDownloading(false);
    }
  }

  function handlePropertyChange(id) {
    setPropertyId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("propertyId", id);
    else url.searchParams.delete("propertyId");
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="gallery-page" style={{ "--gallery-header-height": `${headerHeight}px` }}>
      <header ref={headerRef} className="border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:flex-wrap sm:gap-3 sm:py-4 lg:flex-nowrap md:px-6">
          <a href="/" className="inline-flex items-center">
            <img src="/Scout Only Logo Navy Dark NEW.png" alt="SCOUT" className="h-7 w-auto object-contain max-[350px]:h-6 sm:h-10 md:h-11" loading="eager" />
          </a>
          <div className="flex shrink-0 items-center gap-2">
            <PortalNavigation active="gallery" />
            {session && <AccountMenu onSignOut={() => supabase?.auth.signOut()} canOpenAdmin={canOpenAdmin} />}
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
            <div className="gallery-primary-filters">
              <label>Organization
                <select value={orgId} onChange={(event) => handleOrgChange(event.target.value)} disabled={orgsLoading || !orgs.length}>
                  <option value="">Choose an organization</option>
                  {orgs.map((org) => <option key={org.id} value={org.id}>{org.name || "Organization"}</option>)}
                </select>
              </label>
              <label>Property
                <select value={propertyId} onChange={(event) => handlePropertyChange(event.target.value)} disabled={orgsLoading || !orgId || !properties.length}>
                  <option value="">Choose a property</option>
                  {properties.map((item) => <option key={item.id} value={item.id}>{propertyLabel(item)}</option>)}
                </select>
              </label>
            </div>
            {property && <>
              <div className="gallery-desktop-filters">
                <label>Year
                  <select value={year} onChange={(event) => { setYear(event.target.value); setVisibleCount(INITIAL_SESSION_COUNT); setViewer(null); }}>
                    <option value="all">All dates</option>
                    {years.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label>Photo status
                  <select value={photoStatus} onChange={(event) => { setPhotoStatus(event.target.value); setViewer(null); }}>
                    <option value="all">All photos</option>
                    <option value="flagged">Flagged</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </label>
                <label>Find a photo
                  <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setViewer(null); }} placeholder="Search photo names" />
                </label>
              </div>
              <details className="gallery-mobile-filters">
                <summary><SlidersHorizontal size={16} aria-hidden="true" /> Filters</summary>
                <div className="gallery-mobile-filter-fields">
                  <label>Year
                    <select value={year} onChange={(event) => { setYear(event.target.value); setVisibleCount(INITIAL_SESSION_COUNT); setViewer(null); }}>
                      <option value="all">All dates</option>
                      {years.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <label>Photo status
                    <select value={photoStatus} onChange={(event) => { setPhotoStatus(event.target.value); setViewer(null); }}>
                      <option value="all">All photos</option>
                      <option value="flagged">Flagged</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </label>
                  <label>Find a photo
                    <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setViewer(null); }} placeholder="Search photo names" />
                  </label>
                </div>
              </details>
            </>}
          </section>
          {orgsLoading && <div className="gallery-panel">Loading properties…</div>}
          {orgsError && <div className="gallery-panel gallery-error" role="alert">{orgsError}</div>}
          {!orgsLoading && !orgsError && !property && <div className="gallery-panel gallery-empty">{orgId ? "Choose a property to see its photos." : "Choose an organization, then a property, to see its photos."}</div>}
          {property && <>
            <div className="gallery-property-title"><div><p className="gallery-eyebrow">Selected property</p><h2>{property.name || propertyLabel(property)}</h2><p>{[property.addressLine1, property.city, property.state, property.postalCode].filter(Boolean).join(", ")}</p></div><span>{propertyPackages.length} {propertyPackages.length === 1 ? "session" : "sessions"}</span></div>
            <div className="gallery-download-bar"><span>Select photos from any dates below. Your selection stays when you change filters.</span><button type="button" onClick={downloadSelected} disabled={!selectedPhotos.length || downloading}><Download className="h-4 w-4" /> {downloading ? "Preparing ZIP…" : `Download selected (${selectedPhotos.length})`}</button></div>
            {packagesLoading && <div className="gallery-panel">Loading photo history…</div>}
            {packagesError && <div className="gallery-panel gallery-error" role="alert">{packagesError}</div>}
            {actionError && <div className="gallery-panel gallery-error" role="alert">{actionError}</div>}
            {!packagesLoading && !packagesError && propertyPackages.length === 0 && <div className="gallery-panel gallery-empty">No gallery photos are available for this property yet.</div>}
            {!packagesLoading && !packagesError && propertyPackages.length > 0 && filteredPackages.length === 0 && <div className="gallery-panel gallery-empty">No photos match this year.</div>}
            {!packagesLoading && !packagesError && groups.map((group) => <section className="gallery-month" key={group.month} aria-label={group.month}>
              <h2>{group.month}</h2>
              {group.packages.map((item, index) => {
                const photoState = photosByPackage[item.id];
                const shownPhotos = filterGalleryPhotos(photoState?.photos, photoStatus, query);
                const dayKey = galleryDayKey(item);
                const datePackages = propertyPackages.filter((candidate) => galleryDayKey(candidate) === dayKey);
                const dateSelected = allDatePhotosSelected(datePackages, photosByPackage, selectedIds);
                const firstSessionForDate = index === 0 || galleryDayKey(group.packages[index - 1]) !== dayKey;
                return <article className="gallery-session" key={item.id}>
                  <div className="gallery-session-heading"><div><time dateTime={dateValue(item)}>{dateLabel(dateValue(item), { month: "long", day: "numeric", year: "numeric" })}</time><h3>{item.session?.title || "Photo session"}</h3></div><div className="gallery-session-actions"><span>{item.originalPhotoCount} {item.originalPhotoCount === 1 ? "photo" : "photos"}</span>{firstSessionForDate && <button type="button" onClick={() => toggleDateSelection(dayKey, dateSelected)} disabled={Boolean(selectingDate)} aria-label={`${dateSelected ? "Deselect all" : "Select all"} photos from ${dateLabel(dateValue(item), { month: "long", day: "numeric", year: "numeric" })}`}>{selectingDate === dayKey ? "Selecting date…" : dateSelected ? "Deselect date" : "Select all for date"}</button>}</div></div>
                  {(!photoState || photoState.loading) && <p className="gallery-muted">Loading photos…</p>}
                  {photoState?.error && <p className="gallery-error" role="alert">{photoState.error}</p>}
                  {photoState && !photoState.loading && !photoState.error && (shownPhotos.length ? <div className="gallery-grid">{shownPhotos.map((photo) => <div className="gallery-photo-card" key={photo.id}>
                    <button className="gallery-photo" type="button" onClick={() => setViewer({ propertyId, packageId: item.id, index: shownPhotos.findIndex((itemPhoto) => itemPhoto.id === photo.id) })} aria-label={`Open ${photoLabel(photo)}`}>
                      {photo.previewUrl ? <img src={photo.previewUrl} alt="" loading="lazy" /> : <span className="gallery-no-preview">Preview unavailable</span>}
                      <span className="gallery-photo-date">{photoDateLabel(photo.capturedAt || dateValue(item))}</span>
                      {galleryPhotoStatus(photo) && <span className={`gallery-photo-status ${galleryPhotoStatus(photo)}`} title={galleryPhotoStatus(photo) === "pending" ? "Pending review" : galleryPhotoStatus(photo) === "resolved" ? "Resolved" : "Flagged"}>{galleryPhotoStatus(photo) === "resolved" ? <CheckCircle2 size={14} /> : galleryPhotoStatus(photo) === "pending" ? <Search size={14} /> : <Flag size={14} />}<span>{galleryPhotoStatus(photo) === "pending" ? "Pending Review" : galleryPhotoStatus(photo) === "resolved" ? "Resolved" : "Flagged"}</span></span>}
                      <span className="gallery-photo-caption">{photoLabel(photo)}</span>
                    </button>
                    <div className="gallery-photo-actions"><label><input type="checkbox" checked={(selectedIds[item.id] || []).includes(photo.id)} onChange={() => togglePhotoSelection(item.id, photo.id)} /> Select photo</label></div>
                  </div>)}</div> : <p className="gallery-muted">No photos in this session match the current filters.</p>)}
                </article>;
              })}
            </section>)}
            {visibleCount < filteredPackages.length && <button className="gallery-more" type="button" onClick={() => setVisibleCount((count) => count + MORE_SESSION_COUNT)}>Load older sessions</button>}
            {historyCapped && <p className="gallery-limit">Showing photos from the latest 50 report packages for this property.</p>}
          </>}
        </>}
      </main>
      {activePhoto && <div className="gallery-lightbox" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewer(null); }}>
        <div className="gallery-lightbox-inner" role="dialog" aria-modal="true" aria-label="Photo viewer">
          <div className="gallery-lightbox-toolbar"><span>{viewer.index + 1} of {viewerPhotos.length}</span><label className="gallery-lightbox-select"><input type="checkbox" checked={(selectedIds[viewer.packageId] || []).includes(activePhoto.id)} onChange={() => togglePhotoSelection(viewer.packageId, activePhoto.id)} /> Select photo</label><button ref={closeButtonRef} type="button" onClick={() => setViewer(null)} aria-label="Close photo viewer">Close ×</button></div>
          {activePhoto.previewUrl ? <img src={activePhoto.previewUrl} alt={photoLabel(activePhoto)} /> : <p>Preview unavailable for this photo.</p>}
          <div className="gallery-lightbox-footer"><button type="button" onClick={() => setViewer((current) => ({ ...current, index: (current.index - 1 + viewerPhotos.length) % viewerPhotos.length }))} disabled={viewerPhotos.length < 2}>← Previous</button><div><strong>{photoLabel(activePhoto)}</strong><span>{dateLabel(activePhoto.capturedAt, { month: "long", day: "numeric", year: "numeric" })}</span></div><button type="button" onClick={() => setViewer((current) => ({ ...current, index: (current.index + 1) % viewerPhotos.length }))} disabled={viewerPhotos.length < 2}>Next →</button></div>
        </div>
      </div>}
    </div>
  );
}
