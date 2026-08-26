import { useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  KeyRound,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";
import { hasSupabaseConfig, supabase } from "./lib/supabaseClient";

const BRAND = {
  siteTitle: "Portal Access Admin | SCOUT",
  brandNavy: "#1C2742",
  logos: {
    wordmarkOnly: "/Scout Only Logo Navy Dark NEW.png",
  },
};

const ACCESS_TYPE_OPTIONS = [
  { value: "viewer", label: "Client Viewer" },
  { value: "field", label: "Field User" },
];

const ACCESS_ROLE_LABELS = {
  field: "Field User",
  manager: "Manager",
  owner: "Owner",
  viewer: "Client Viewer",
};

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

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

function accessLabel(row) {
  const role = row.role || "viewer";
  const scope = row.accessScope || "org";
  return `${ACCESS_ROLE_LABELS[role] || role} / ${scope}`;
}

function selectedAccessTypeLabel(role) {
  return ACCESS_ROLE_LABELS[role] || "Client Viewer";
}

function AccountStatus({ status }) {
  const accountStatus = status || {};
  const state = accountStatus.state || "unknown";
  const isConfirmed = state === "confirmed";
  const isPending = state === "pending";
  const badgeClass = isConfirmed
    ? ""
    : isPending
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-slate-200 bg-slate-50 text-foreground/65";
  const badgeStyle = isConfirmed
    ? {
        backgroundColor: "#f0fdf4",
        borderColor: "#15803d",
        color: "#14532d",
      }
    : undefined;

  return (
    <div className="grid gap-1">
      <span
        className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold leading-none ${badgeClass}`}
        style={badgeStyle}
      >
        {accountStatus.label || "Status unavailable"}
      </span>
      <span className="text-xs leading-relaxed text-foreground/55">
        {accountStatus.lastSignInAt
          ? `Last sign-in ${formatDateTime(accountStatus.lastSignInAt)}`
          : accountStatus.detail || "Last sign-in unavailable."}
      </span>
    </div>
  );
}

export default function PortalAccessAdminPage() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [adminStatus, setAdminStatus] = useState("signed-out");
  const [submitting, setSubmitting] = useState(false);
  const [setupSubmitting, setSetupSubmitting] = useState(false);
  const [adminEmails, setAdminEmails] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [accessRows, setAccessRows] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [selectedAccessRole, setSelectedAccessRole] = useState("viewer");
  const [clientEmail, setClientEmail] = useState("");
  const [newOrgName, setNewOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [setupLinkDetails, setSetupLinkDetails] = useState(null);
  const [copyMessage, setCopyMessage] = useState("");
  const [revokeId, setRevokeId] = useState("");

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

  async function loadAccess(activeSession = session) {
    if (!activeSession?.access_token || adminStatus !== "authorized") return;
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/admin/portal-access", {
        headers: {
          Authorization: `Bearer ${activeSession.access_token}`,
        },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Unable to load portal access.");
      }
      setAdminEmails(body.adminEmails || []);
      setOrgs(body.orgs || []);
      setAccessRows(body.access || []);
      if (!selectedOrgId && body.orgs?.[0]?.id) {
        setSelectedOrgId(body.orgs[0].id);
      }
    } catch (error) {
      setLoadError(error.message || "Unable to load portal access.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadAdminStatus() {
      if (!session?.access_token) {
        setAdminStatus("signed-out");
        setAdminEmails([]);
        setOrgs([]);
        setAccessRows([]);
        setSelectedOrgId("");
        return;
      }

      setAdminStatus("checking");
      setLoadError("");

      try {
        const response = await fetch("/api/admin/me", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
        const body = await response.json().catch(() => ({}));
        if (active) {
          setAdminStatus(response.ok && body.isAdmin === true ? "authorized" : "denied");
        }
      } catch {
        if (active) setAdminStatus("denied");
      }
    }

    loadAdminStatus();

    return () => {
      active = false;
    };
  }, [session?.access_token]);

  useEffect(() => {
    if (session?.access_token && adminStatus === "authorized") loadAccess(session);
  }, [session?.access_token, adminStatus]);

  async function handleSignIn(event) {
    event.preventDefault();
    setAuthError("");
    if (!hasSupabaseConfig || !supabase) {
      setAuthError("Supabase is not configured.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) setAuthError(error.message || "Unable to sign in.");
  }

  async function handleSignOut() {
    await supabase?.auth.signOut();
  }

  async function handleAccessSubmit(action) {
    if (!session?.access_token) return;
    setSubmitting(true);
    setActionMessage("");
    setLoadError("");
    setSetupLinkDetails(null);
    setCopyMessage("");

    try {
      const response = await fetch("/api/admin/portal-access", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          email: clientEmail,
          orgId: selectedOrgId,
          accessRole: selectedAccessRole,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Unable to grant portal access.");
      }
      setClientEmail("");
      setActionMessage(
        body.invited
          ? `Invite email sent to ${body.user.email}; ${selectedAccessTypeLabel(
              body.membership?.role
            )} org-level access is granted for ${body.org.name}.`
          : `Granted existing portal account ${body.user.email} ${selectedAccessTypeLabel(
              body.membership?.role
            )} org-level access to ${body.org.name}.`
      );
      await loadAccess();
    } catch (error) {
      setLoadError(error.message || "Unable to grant portal access.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateSetupLink() {
    if (!session?.access_token) return;
    setSetupSubmitting(true);
    setActionMessage("");
    setLoadError("");
    setSetupLinkDetails(null);
    setCopyMessage("");

    try {
      const response = await fetch("/api/admin/portal-access", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "setupLink",
          email: clientEmail,
          orgId: selectedOrgId,
          accessRole: selectedAccessRole,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Unable to create setup link.");
      }

      setSetupLinkDetails({
        email: body.user.email,
        orgName: body.org.name,
        setupUrl: body.setupUrl,
        setupPath: body.setupPath,
      });
      setActionMessage(
        `Created fallback setup link for ${body.user.email}; ${selectedAccessTypeLabel(
          body.membership?.role
        )} org-level access is granted for ${body.org.name}.`
      );
      await loadAccess();
    } catch (error) {
      setLoadError(error.message || "Unable to create setup link.");
    } finally {
      setSetupSubmitting(false);
    }
  }

  async function handleCreateOrganization(event) {
    event.preventDefault();
    if (!session?.access_token) return;

    setCreatingOrg(true);
    setActionMessage("");
    setLoadError("");
    setSetupLinkDetails(null);
    setCopyMessage("");

    try {
      const response = await fetch("/api/admin/portal-access", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "createOrg",
          name: newOrgName,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Unable to create organization.");
      }

      setNewOrgName("");
      await loadAccess();
      if (body.org?.id) setSelectedOrgId(body.org.id);
      setActionMessage("Created organization. Add properties in ScoutCapture, then invite the client.");
    } catch (error) {
      setLoadError(error.message || "Unable to create organization.");
    } finally {
      setCreatingOrg(false);
    }
  }

  async function handleCopySetupLink() {
    if (!setupLinkDetails?.setupUrl) return;
    setCopyMessage("");

    try {
      await navigator.clipboard.writeText(setupLinkDetails.setupUrl);
      setCopyMessage("Setup link copied.");
    } catch {
      setCopyMessage("Copy failed. Select the link and copy it manually.");
    }
  }

  async function handleRevoke(row) {
    if (!session?.access_token || !row?.canRevoke) return;
    setRevokeId(row.id);
    setActionMessage("");
    setLoadError("");

    try {
      const response = await fetch("/api/admin/portal-access", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orgId: row.orgId,
          userId: row.userId,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Unable to revoke portal access.");
      }
      setActionMessage(`Revoked ${row.email} access to ${row.orgName}.`);
      await loadAccess();
    } catch (error) {
      setLoadError(error.message || "Unable to revoke portal access.");
    } finally {
      setRevokeId("");
    }
  }

  const selectedOrg = useMemo(
    () => orgs.find((org) => org.id === selectedOrgId) || null,
    [orgs, selectedOrgId]
  );

  const visibleRows = useMemo(() => {
    if (!selectedOrgId) return accessRows;
    return accessRows.filter((row) => row.orgId === selectedOrgId);
  }, [accessRows, selectedOrgId]);

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
                Back to Reports
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
        <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <div className="text-sm font-medium text-[var(--brand)]">
              {session && adminStatus === "denied" ? "Client Portal" : "Admin"}
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
              {session && adminStatus === "denied" ? "Access Unavailable" : "Portal Access"}
            </h1>
          </div>
          {session && adminStatus === "authorized" && (
            <button
              type="button"
              onClick={() => loadAccess()}
              disabled={loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
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
              Sign in
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
          </form>
        )}

        {session && adminStatus === "checking" && (
          <div className="rounded-lg border border-border bg-background p-6 text-sm text-foreground/70 shadow-sm">
            Checking admin access...
          </div>
        )}

        {session && adminStatus === "denied" && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 shadow-sm">
            Admin access required.
          </div>
        )}

        {session && adminStatus === "authorized" && (
          <div className="grid gap-4">
            <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground/70 shadow-sm">
              Signed in as{" "}
              <span className="font-semibold text-foreground">
                {session.user?.email || "authenticated user"}
              </span>
              .
            </div>

            {loadError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {loadError}
              </div>
            )}
            {actionMessage && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                {actionMessage}
              </div>
            )}

            <section className="rounded-lg border border-border bg-background p-5 shadow-sm">
              <div className="grid max-w-3xl gap-4">
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Create Organization
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-foreground/60">
                    Create the organization here. Add properties in ScoutCapture.
                  </p>
                </div>
                <form
                  onSubmit={handleCreateOrganization}
                  className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
                >
                  <label className="grid gap-1.5 text-sm font-medium text-foreground">
                    Organization Name
                    <input
                      type="text"
                      value={newOrgName}
                      onChange={(event) => setNewOrgName(event.target.value)}
                      maxLength={120}
                      className="h-11 rounded-lg border border-input bg-background px-3 text-base outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={creatingOrg || !newOrgName.trim()}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
                  >
                    <Plus className="h-4 w-4" />
                    {creatingOrg ? "Creating..." : "Create Organization"}
                  </button>
                </form>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-background p-5 shadow-sm">
              <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px_auto] lg:items-end">
                <label className="grid gap-1.5 text-sm font-medium text-foreground">
                  Client Email
                  <input
                    type="email"
                    autoComplete="email"
                    value={clientEmail}
                    onChange={(event) => {
                      setClientEmail(event.target.value);
                      setSetupLinkDetails(null);
                      setCopyMessage("");
                    }}
                    className="h-11 rounded-lg border border-input bg-background px-3 text-base outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-foreground">
                  Organization
                  <select
                    value={selectedOrgId}
                    onChange={(event) => setSelectedOrgId(event.target.value)}
                    className="h-11 rounded-lg border border-input bg-background px-3 text-base outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
                  >
                    {orgs.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-foreground">
                  Access Type
                  <select
                    value={selectedAccessRole}
                    onChange={(event) => setSelectedAccessRole(event.target.value)}
                    className="h-11 rounded-lg border border-input bg-background px-3 text-base outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
                  >
                    {ACCESS_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-col gap-2 sm:flex-row md:col-span-3 lg:col-span-1">
                  <button
                    type="button"
                    onClick={() => handleAccessSubmit("grantExisting")}
                    disabled={
                      submitting ||
                      setupSubmitting ||
                      !clientEmail ||
                      !selectedOrgId
                    }
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-semibold text-foreground/75 shadow-sm hover:text-foreground disabled:opacity-60"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Grant Access
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAccessSubmit(undefined)}
                    disabled={
                      submitting ||
                      setupSubmitting ||
                      !clientEmail ||
                      !selectedOrgId
                    }
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
                  >
                    <UserPlus className="h-4 w-4" />
                    Invite User
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateSetupLink}
                    disabled={
                      submitting ||
                      setupSubmitting ||
                      !clientEmail ||
                      !selectedOrgId
                    }
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-950 shadow-sm hover:bg-amber-100 disabled:opacity-60"
                  >
                    <KeyRound className="h-4 w-4" />
                    {setupSubmitting ? "Creating..." : "Fallback Setup Link"}
                  </button>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-foreground/60">
                Invite User is the normal first path for new clients. Grant
                Access is for an existing portal account and does not send an
                invite email. Access Type applies org-level Client Viewer or
                Field User access. Use the fallback setup link only when invite
                email delivery is delayed, missing, or rate-limited.
              </p>
              {setupLinkDetails?.setupUrl && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="text-sm font-semibold text-amber-950">
                    Fallback setup link for {setupLinkDetails.email}
                  </div>
                  <p className="mt-1 text-sm text-amber-900/80">
                    Copy this link only if the invite email did not arrive. It opens
                    {setupLinkDetails.setupPath === "/reset-password"
                      ? " the Client Portal password reset page."
                      : " the Client Portal invite setup page."}
                  </p>
                  <div className="mt-3 flex flex-col gap-2 md:flex-row">
                    <input
                      type="text"
                      readOnly
                      value={setupLinkDetails.setupUrl}
                      className="h-11 min-w-0 flex-1 rounded-lg border border-amber-200 bg-background px-3 text-sm text-foreground outline-none"
                      onFocus={(event) => event.target.select()}
                    />
                    <button
                      type="button"
                      onClick={handleCopySetupLink}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white shadow-sm"
                    >
                      <ClipboardList className="h-4 w-4" />
                      Copy Fallback Link
                    </button>
                  </div>
                  {copyMessage && (
                    <p className="mt-2 text-sm font-medium text-amber-950">
                      {copyMessage}
                    </p>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-lg border border-border bg-background shadow-sm">
              <div className="flex flex-col justify-between gap-3 border-b border-border px-5 py-4 md:flex-row md:items-center">
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    {selectedOrg?.name || "Organization"} Access
                  </h2>
                  <p className="mt-1 text-sm text-foreground/60">
                    {visibleRows.length} active user
                    {visibleRows.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {adminEmails.map((adminEmail) => (
                    <span
                      key={adminEmail}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-slate-50 px-2.5 py-1 text-xs font-semibold text-foreground/70"
                    >
                      <ShieldCheck className="h-3.5 w-3.5 text-[var(--brand)]" />
                      {adminEmail}
                    </span>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead className="border-b border-border bg-slate-50 text-xs uppercase text-foreground/55">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Email</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 font-semibold">Access</th>
                      <th className="px-5 py-3 font-semibold">Created</th>
                      <th className="px-5 py-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr key={row.id} className="border-b border-border last:border-b-0">
                        <td className="px-5 py-3 font-medium text-foreground">
                          {row.email || row.userId}
                        </td>
                        <td className="px-5 py-3">
                          <AccountStatus status={row.accountStatus} />
                        </td>
                        <td className="px-5 py-3 text-foreground/70">
                          {accessLabel(row)}
                        </td>
                        <td className="px-5 py-3 text-foreground/70">
                          {formatDate(row.createdAt)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRevoke(row)}
                            disabled={!row.canRevoke || revokeId === row.id}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground/75 shadow-sm hover:text-red-700 disabled:opacity-45"
                            title={
                              row.canRevoke
                                ? "Revoke access"
                                : "This access cannot be revoked here"
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                    {visibleRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-5 py-8 text-center text-sm text-foreground/60"
                        >
                          No active access rows.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
