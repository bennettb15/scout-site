import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  Download,
  FileText,
  Flag,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { hasSupabaseConfig, supabase } from "./lib/supabaseClient";

const BRAND = {
  siteTitle: "Punch List | SCOUT",
  brandNavy: "#1C2742",
  logos: {
    wordmarkOnly: "/Scout Only Logo Navy Dark NEW.png",
  },
};

const ALL = "all";
const TAB_OPEN = "open";
const TAB_RESOLVED = "resolved";

const PRIORITY_LABELS = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const TRADE_LABELS = {
  carpentry: "Carpentry",
  concrete: "Concrete",
  drywall: "Drywall",
  electrical: "Electrical",
  fire_protection: "Fire Protection",
  flooring: "Flooring",
  general: "General",
  hvac: "HVAC",
  masonry: "Masonry",
  painting: "Painting",
  plumbing: "Plumbing",
  roofing: "Roofing",
  sitework: "Sitework",
  steel: "Steel",
};

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatShortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function textValue(value) {
  const text = String(value || "").trim();
  return text || "";
}

function optionLabel(value, labels) {
  const key = textValue(value).toLowerCase();
  return labels[key] || textValue(value) || "General";
}

function propertyLine(property) {
  if (!property) return "Property";
  const cityState = [property.city, property.state].filter(Boolean).join(", ");
  const address = [property.addressLine1, cityState, property.postalCode]
    .filter(Boolean)
    .join(" ");
  return property.name || address || "Property";
}

function propertyOptionLabel(property) {
  if (!property) return "Property";
  const cityState = [property.city, property.state].filter(Boolean).join(", ");
  const address = [property.addressLine1, cityState, property.postalCode]
    .filter(Boolean)
    .join(" ");
  if (property.name && address) return `${property.name} · ${address}`;
  return property.name || address || "Property";
}

function locationLine(row) {
  const angle = row.angleIndex ? `A${row.angleIndex}` : "";
  return [row.building, row.elevation, row.detailType, angle]
    .map(textValue)
    .filter(Boolean)
    .join(" | ");
}

function issueCode(row) {
  if (row.shotKey) return row.shotKey;
  if (row.angleIndex) return `A${row.angleIndex}`;
  return row.shotId ? row.shotId.slice(0, 8).toUpperCase() : "ISSUE";
}

function priorityClasses(priority) {
  switch (String(priority || "").toLowerCase()) {
    case "critical":
      return "border-red-200 bg-red-50 text-red-800";
    case "high":
      return "border-orange-200 bg-orange-50 text-orange-800";
    case "low":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "medium":
    default:
      return "border-amber-200 bg-amber-50 text-amber-900";
  }
}

function statusLabel(status) {
  if (status === "resolved") return "Resolved";
  if (status === "resolved_pending_verification") return "Pending";
  return "Open";
}

function sourceLabel(source) {
  return source === "observation" ? "Observation" : "Flagged photo";
}

function compactCount(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function uniqueOptions(rows, getter, labeler) {
  const byId = new Map();
  for (const row of rows) {
    const value = getter(row);
    const id = value?.id || value;
    if (id && !byId.has(id)) {
      byId.set(id, {
        id,
        label: labeler ? labeler(value) : String(value),
        value,
      });
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function IssueThumbnail({ row, large = false }) {
  const sizeClass = large ? "h-44 w-full" : "h-20 w-20";
  const label = locationLine(row) || row.title || "Punch list photo";
  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-slate-100 text-foreground/45`}
    >
      {row.preview?.previewUrl ? (
        <img
          src={row.preview.previewUrl}
          alt={label}
          className="h-full w-full object-cover"
        />
      ) : (
        <Camera className={large ? "h-8 w-8" : "h-5 w-5"} />
      )}
    </div>
  );
}

function ReadOnlyField({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase text-foreground/45">
        {label}
      </div>
      <div className="mt-1 min-h-5 text-sm font-semibold text-foreground">
        {value || "None"}
      </div>
    </div>
  );
}

function RowDetail({ row, onDownloadOriginal, downloadId }) {
  if (!row) {
    return (
      <div className="rounded-lg border border-border bg-background p-5 text-sm text-foreground/60 shadow-sm">
        Select an issue to view details.
      </div>
    );
  }

  const originalDownload = row.preview?.originalDownload || {};
  const reportHref = row.packageId ? `/reports` : "";

  return (
    <aside className="rounded-lg border border-border bg-background p-4 shadow-sm">
      <IssueThumbnail row={row} large />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${priorityClasses(
            row.priority
          )}`}
        >
          {optionLabel(row.priority, PRIORITY_LABELS)}
        </span>
        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
          {statusLabel(row.status)}
        </span>
        <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
          Read Only
        </span>
      </div>

      <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground">
        {row.title || "Flagged observation"}
      </h2>
      {row.reason && row.reason !== row.title && (
        <p className="mt-2 text-sm leading-6 text-foreground/70">{row.reason}</p>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <ReadOnlyField label="Location" value={locationLine(row)} />
        <ReadOnlyField label="Code" value={issueCode(row)} />
        <ReadOnlyField label="Property" value={propertyLine(row.property)} />
        <ReadOnlyField label="Organization" value={row.org?.name} />
        <ReadOnlyField label="Trade" value={optionLabel(row.trade, TRADE_LABELS)} />
        <ReadOnlyField label="Source" value={sourceLabel(row.source)} />
        <ReadOnlyField label="Captured" value={formatDateTime(row.capturedAt)} />
        <ReadOnlyField
          label={row.status === "resolved" ? "Resolved" : "Updated"}
          value={formatDateTime(row.resolvedAt || row.updatedAt)}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {originalDownload.available && (
          <button
            type="button"
            onClick={() => onDownloadOriginal(row)}
            disabled={downloadId === row.id}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Original
          </button>
        )}
        {reportHref && (
          <a
            href={reportHref}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground/75 shadow-sm hover:text-foreground"
          >
            <FileText className="h-4 w-4" />
            Reports
          </a>
        )}
      </div>
    </aside>
  );
}

function IssueRow({ row, selected, onSelect, onDownloadOriginal, downloadId }) {
  const originalDownload = row.preview?.originalDownload || {};
  const metaLine = [
    propertyLine(row.property),
    row.org?.name,
    formatDateTime(row.capturedAt || row.updatedAt),
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    <article
      className={`rounded-lg border bg-background p-3 shadow-sm transition ${
        selected ? "border-[var(--brand)] ring-2 ring-[var(--brand)]/10" : "border-border"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full gap-3 text-left"
        aria-expanded={selected}
      >
        <IssueThumbnail row={row} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${priorityClasses(
                row.priority
              )}`}
            >
              {optionLabel(row.priority, PRIORITY_LABELS)}
            </span>
            <span className="text-xs font-semibold text-foreground/50">
              {statusLabel(row.status)}
            </span>
          </div>
          <div className="mt-2 truncate text-sm font-bold uppercase tracking-normal text-foreground">
            {locationLine(row) || "Location not set"} | {issueCode(row)}
          </div>
          <div className="mt-1 line-clamp-2 text-sm font-semibold text-foreground">
            <Flag className="mr-1 inline h-3.5 w-3.5 fill-red-600 text-red-600" />
            {row.title || row.reason || "Flagged observation"}
          </div>
          <div className="mt-1 truncate text-xs font-medium text-foreground/55">
            {metaLine}
          </div>
        </div>
        <ChevronDown
          className={`mt-1 h-4 w-4 shrink-0 text-foreground/40 transition md:hidden ${
            selected ? "rotate-180" : ""
          }`}
        />
      </button>
      {selected && (
        <div className="mt-3 grid gap-3 border-t border-border pt-3 md:hidden">
          {row.reason && row.reason !== row.title && (
            <p className="text-sm leading-6 text-foreground/70">{row.reason}</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <ReadOnlyField label="Trade" value={optionLabel(row.trade, TRADE_LABELS)} />
            <ReadOnlyField label="Updated" value={formatShortDate(row.resolvedAt || row.updatedAt)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {originalDownload.available && (
              <button
                type="button"
                onClick={() => onDownloadOriginal(row)}
                disabled={downloadId === row.id}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--brand)] px-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Original
              </button>
            )}
            {row.packageId && (
              <a
                href="/reports"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground/70 shadow-sm"
              >
                <FileText className="h-4 w-4" />
                Reports
              </a>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

export default function ScoutPunchListPage() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [rows, setRows] = useState([]);
  const [punchListError, setPunchListError] = useState("");
  const [punchListLoading, setPunchListLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState(TAB_OPEN);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState(ALL);
  const [selectedPriority, setSelectedPriority] = useState(ALL);
  const [selectedTrade, setSelectedTrade] = useState(ALL);
  const [selectedRowId, setSelectedRowId] = useState("");
  const [downloadId, setDownloadId] = useState("");

  useEffect(() => {
    document.title = BRAND.siteTitle;
    document.documentElement.style.setProperty("--brand", BRAND.brandNavy);
    document.documentElement.style.setProperty("--brand-ink", "#23243A");
  }, []);

  useEffect(() => {
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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
    });

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  async function loadPunchList(activeSession = session) {
    if (!activeSession?.access_token) return;
    setPunchListLoading(true);
    setPunchListError("");
    try {
      const response = await fetch("/api/punch-list", {
        headers: {
          Authorization: `Bearer ${activeSession.access_token}`,
        },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(body.rows)) {
        throw new Error(body.error || "Unable to load punch list.");
      }
      setRows(body.rows);
    } catch (error) {
      setPunchListError(error.message || "Unable to load punch list.");
      setRows([]);
    } finally {
      setPunchListLoading(false);
    }
  }

  useEffect(() => {
    if (session?.access_token) {
      loadPunchList(session);
    } else {
      setRows([]);
      setSelectedOrgId("");
      setSelectedPropertyId(ALL);
      setPunchListError("");
    }
  }, [session?.access_token]);

  async function handleSignIn(event) {
    event.preventDefault();
    setAuthError("");
    if (!hasSupabaseConfig || !supabase) {
      setAuthError("Supabase is not configured for this site.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setAuthError(error.message || "Unable to sign in.");
    }
  }

  async function handleSignOut() {
    await supabase?.auth.signOut();
    setRows([]);
    setSelectedOrgId("");
    setSelectedPropertyId(ALL);
  }

  async function handleDownloadOriginal(row) {
    if (!session?.access_token || !row.preview?.originalDownload?.apiPath) return;
    setDownloadId(row.id);
    setPunchListError("");
    try {
      const response = await fetch(row.preview.originalDownload.apiPath, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.downloadUrl) {
        throw new Error(body.error || "Unable to prepare original photo download.");
      }
      window.location.assign(body.downloadUrl);
    } catch (error) {
      setPunchListError(error.message || "Unable to prepare original photo download.");
    } finally {
      setDownloadId("");
    }
  }

  const orgOptions = useMemo(
    () => uniqueOptions(rows, (row) => row.org, (org) => org.name || "Organization"),
    [rows]
  );

  useEffect(() => {
    if (orgOptions.length === 0) {
      if (selectedOrgId) setSelectedOrgId("");
      return;
    }
    if (!selectedOrgId || !orgOptions.some((option) => option.id === selectedOrgId)) {
      setSelectedOrgId(orgOptions[0].id);
    }
  }, [orgOptions, selectedOrgId]);

  const orgFilteredRows = useMemo(() => {
    if (!selectedOrgId) return rows;
    return rows.filter((row) => row.org?.id === selectedOrgId);
  }, [rows, selectedOrgId]);

  const propertyOptions = useMemo(
    () => uniqueOptions(orgFilteredRows, (row) => row.property, propertyOptionLabel),
    [orgFilteredRows]
  );

  useEffect(() => {
    if (
      selectedPropertyId !== ALL &&
      !propertyOptions.some((option) => option.id === selectedPropertyId)
    ) {
      setSelectedPropertyId(ALL);
    }
  }, [propertyOptions, selectedPropertyId]);

  const priorityOptions = useMemo(
    () =>
      uniqueOptions(
        orgFilteredRows,
        (row) => row.priority || "medium",
        (priority) => optionLabel(priority, PRIORITY_LABELS)
      ),
    [orgFilteredRows]
  );

  const tradeOptions = useMemo(
    () =>
      uniqueOptions(
        orgFilteredRows,
        (row) => row.trade || "general",
        (trade) => optionLabel(trade, TRADE_LABELS)
      ),
    [orgFilteredRows]
  );

  const tabRows = useMemo(() => {
    const wantsResolved = selectedTab === TAB_RESOLVED;
    return orgFilteredRows.filter((row) =>
      wantsResolved ? row.status === "resolved" : row.status !== "resolved"
    );
  }, [orgFilteredRows, selectedTab]);

  const filteredRows = useMemo(() => {
    return tabRows.filter((row) => {
      if (selectedPropertyId !== ALL && row.property?.id !== selectedPropertyId) return false;
      if (selectedPriority !== ALL && row.priority !== selectedPriority) return false;
      if (selectedTrade !== ALL && row.trade !== selectedTrade) return false;
      return true;
    });
  }, [selectedPriority, selectedPropertyId, selectedTrade, tabRows]);

  useEffect(() => {
    if (filteredRows.length === 0) {
      if (selectedRowId) setSelectedRowId("");
      return;
    }
    if (!selectedRowId || !filteredRows.some((row) => row.id === selectedRowId)) {
      setSelectedRowId(filteredRows[0].id);
    }
  }, [filteredRows, selectedRowId]);

  const selectedRow = useMemo(
    () => filteredRows.find((row) => row.id === selectedRowId) || null,
    [filteredRows, selectedRowId]
  );

  const openCount = orgFilteredRows.filter((row) => row.status !== "resolved").length;
  const resolvedCount = orgFilteredRows.filter((row) => row.status === "resolved").length;

  return (
    <div
      style={{ "--brand": BRAND.brandNavy, "--brand-ink": "#23243A" }}
      className="min-h-screen bg-slate-50 text-foreground"
    >
      <header className="border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <a href="/" className="inline-flex items-center">
            <img
              src={BRAND.logos.wordmarkOnly}
              alt="SCOUT"
              className="h-10 w-auto object-contain md:h-11"
              loading="eager"
            />
          </a>
          {session && (
            <div className="flex items-center gap-2">
              <a
                href="/reports"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground/75 shadow-sm hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
                Reports
              </a>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground/75 shadow-sm hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
        <div className="mb-6 flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
          <div>
            <div className="text-sm font-medium text-[var(--brand)]">
              Client Portal
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
              Punch List
            </h1>
            {session && (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                {orgOptions.length > 1 && (
                  <label className="grid gap-1 text-xs font-semibold text-foreground/60">
                    Organization
                    <select
                      value={selectedOrgId}
                      onChange={(event) => {
                        setSelectedOrgId(event.target.value);
                        setSelectedPropertyId(ALL);
                      }}
                      className="h-9 max-w-[220px] rounded-lg border border-input bg-background px-3 text-sm font-semibold text-foreground shadow-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
                    >
                      {orgOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="grid gap-1 text-xs font-semibold text-foreground/60">
                  Property
                  <select
                    value={selectedPropertyId}
                    onChange={(event) => setSelectedPropertyId(event.target.value)}
                    disabled={propertyOptions.length === 0}
                    className="h-9 max-w-[280px] rounded-lg border border-input bg-background px-3 text-sm font-semibold text-foreground shadow-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
                  >
                    <option value={ALL}>All Properties</option>
                    {propertyOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-foreground/60">
                  Priority
                  <select
                    value={selectedPriority}
                    onChange={(event) => setSelectedPriority(event.target.value)}
                    className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-semibold text-foreground shadow-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
                  >
                    <option value={ALL}>All Priorities</option>
                    {priorityOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-foreground/60">
                  Trade
                  <select
                    value={selectedTrade}
                    onChange={(event) => setSelectedTrade(event.target.value)}
                    className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-semibold text-foreground shadow-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
                  >
                    <option value={ALL}>All Trades</option>
                    {tradeOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>
          {session && (
            <button
              type="button"
              onClick={() => loadPunchList()}
              disabled={punchListLoading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${punchListLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          )}
        </div>

        {authLoading && (
          <div className="rounded-lg border border-border bg-background p-6 text-sm text-foreground/70 shadow-sm">
            Checking session...
          </div>
        )}

        {!authLoading && !session && (
          <form
            onSubmit={handleSignIn}
            className="max-w-md rounded-lg border border-border bg-background p-5 shadow-sm"
          >
            <div className="text-base font-semibold text-foreground">
              Sign in to view punch list
            </div>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                Email
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-11 rounded-lg border border-input bg-background px-3 text-base outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 rounded-lg border border-input bg-background px-3 text-base outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
                />
              </label>
            </div>
            {authError && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {authError}
              </p>
            )}
            <button
              type="submit"
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white shadow-sm"
            >
              Sign In
            </button>
            <a
              href="/forgot-password"
              className="mt-3 block text-center text-sm font-semibold text-[var(--brand)] hover:underline"
            >
              Forgot password?
            </a>
          </form>
        )}

        {session && (
          <section className="grid gap-4">
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-background px-4 py-3 shadow-sm md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-foreground/70">
                Signed in as{" "}
                <span className="font-semibold text-foreground">
                  {session.user?.email || "authenticated user"}
                </span>
                . {compactCount(filteredRows.length, "visible issue")}.
              </div>
              <div className="inline-flex w-fit rounded-lg border border-border bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setSelectedTab(TAB_OPEN)}
                  className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-semibold ${
                    selectedTab === TAB_OPEN
                      ? "bg-[var(--brand)] text-white shadow-sm"
                      : "text-foreground/65"
                  }`}
                >
                  <ClipboardList className="h-4 w-4" />
                  Open {openCount}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTab(TAB_RESOLVED)}
                  className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-semibold ${
                    selectedTab === TAB_RESOLVED
                      ? "bg-[var(--brand)] text-white shadow-sm"
                      : "text-foreground/65"
                  }`}
                >
                  Resolved {resolvedCount}
                </button>
              </div>
            </div>

            {punchListError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {punchListError}
              </div>
            )}

            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-foreground/45 md:hidden">
              <ClipboardList className="h-3.5 w-3.5" />
              Filters are above
            </div>

            {!punchListLoading && filteredRows.length === 0 && (
              <div className="rounded-lg border border-border bg-background p-6 text-sm text-foreground/70 shadow-sm">
                No punch list items match the selected filters.
              </div>
            )}

            {punchListLoading && rows.length === 0 && (
              <div className="rounded-lg border border-border bg-background p-6 text-sm text-foreground/70 shadow-sm">
                Loading punch list...
              </div>
            )}

            {filteredRows.length > 0 && (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="grid gap-2">
                  {filteredRows.map((row) => (
                    <IssueRow
                      key={row.id}
                      row={row}
                      selected={row.id === selectedRowId}
                      onSelect={() => setSelectedRowId(row.id)}
                      onDownloadOriginal={handleDownloadOriginal}
                      downloadId={downloadId}
                    />
                  ))}
                </div>
                <div className="hidden lg:block">
                  <div className="sticky top-4">
                    <RowDetail
                      row={selectedRow}
                      onDownloadOriginal={handleDownloadOriginal}
                      downloadId={downloadId}
                    />
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
