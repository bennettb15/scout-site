import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  FileText,
  KeyRound,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";
import { hasSupabaseConfig, supabase } from "./lib/supabaseClient";
import {
  canEditPortalPropertyScope,
  checkedPropertyIdsForScopeSelection,
  formatPortalPropertyLabel,
  normalizePortalPropertyScopeDraft,
  normalizePropertyIds as normalizeDisplayPropertyIds,
  portalPropertyScopeDisplay,
  portalPropertyScopeSelectionFromCheckedIds,
  portalPropertyScopeDraftCanSave,
  portalPropertyScopeDraftChanged,
} from "./lib/portalAccessDisplay";

const BRAND = {
  siteTitle: "Portal Access Admin | SCOUT",
  brandNavy: "#1C2742",
  logos: {
    wordmarkOnly: "/Scout Only Logo Navy Dark NEW.png",
  },
};

const ROLE_CHANGE_OPTIONS = [
  { value: "viewer", label: "Viewer" },
  { value: "field", label: "Field" },
  { value: "manager", label: "Manager" },
  { value: "owner", label: "Owner" },
];

const ACCESS_ROLE_LABELS = {
  field: "Field",
  manager: "Manager",
  owner: "Owner",
  viewer: "Viewer",
};
const EMPTY_PROPERTIES = [];

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
  return ACCESS_ROLE_LABELS[role] || role;
}

function selectedAccessTypeLabel(role) {
  return ACCESS_ROLE_LABELS[role] || "Viewer";
}

function selectedPropertySummary(propertyIds, properties) {
  const ids = normalizeDisplayPropertyIds(propertyIds, properties);
  if (!ids.length) return "No properties selected";
  const propertyById = new Map((properties || []).map((property) => [property.id, property]));
  if (ids.length === 1) return formatPortalPropertyLabel(propertyById.get(ids[0]) || {});
  return `${ids.length} properties`;
}

function accessRowKey(row) {
  return `${row.orgId || ""}:${String(row.email || "").trim().toLowerCase()}`;
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

function inviteStatusMeta(row) {
  if (row.state === "expired") {
    return {
      label: "Expired",
      badgeClass: "border-red-200 bg-red-50 text-red-700",
      detail: "Invite expired before acceptance.",
    };
  }
  if (row.state === "replaced") {
    return {
      label: "Replaced",
      badgeClass: "border-slate-200 bg-slate-50 text-foreground/65",
      detail: "A newer invite replaced this one.",
    };
  }
  if (row.state === "canceled") {
    return {
      label: "Canceled",
      badgeClass: "border-slate-200 bg-slate-50 text-foreground/65",
      detail: "Invite was canceled.",
    };
  }
  if (row.state === "revoked") {
    return {
      label: "Canceled",
      badgeClass: "border-slate-200 bg-slate-50 text-foreground/65",
      detail: "Invite was canceled.",
    };
  }
  return {
    label: "Invited",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-900",
    detail: row.hasActiveAccess
      ? "Access is assigned; account setup is pending."
      : "Invite sent; access activates after acceptance.",
  };
}

function InviteStatus({ row }) {
  const meta = inviteStatusMeta(row);

  return (
    <div className="grid gap-1">
      <span
        className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold leading-none ${meta.badgeClass}`}
      >
        {meta.label}
      </span>
      <span className="text-xs leading-relaxed text-foreground/55">
        {meta.detail}
      </span>
    </div>
  );
}

function RoleSelect({ row, disabled, onChange }) {
  const allowedRoles = new Set(row.allowedRoleChanges || []);
  const canChange = row.canChangeRole && allowedRoles.size > 0;

  if (!canChange) {
    return (
      <div className="grid gap-1">
        <span className="font-medium text-foreground/75">{accessLabel(row)}</span>
        <span className="text-xs text-foreground/45">
          Role changes unavailable
        </span>
      </div>
    );
  }

  return (
    <label className="grid max-w-[220px] gap-1">
      <span className="sr-only">Role for {row.email || row.userId}</span>
      <select
        value={row.role || "viewer"}
        disabled={disabled}
        onChange={(event) => onChange(row, event.target.value)}
        className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground shadow-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15 disabled:opacity-60"
      >
        {ROLE_CHANGE_OPTIONS.filter((option) => allowedRoles.has(option.value)).map(
          (option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          )
        )}
      </select>
      <span className="text-xs text-foreground/45">
        Role
      </span>
    </label>
  );
}

function PropertyScopeSummary({
  role,
  accessScope,
  propertyIds,
  properties,
  allowedScopes,
  disabled,
  onEdit,
}) {
  const scope = role === "owner" ? "org" : accessScope === "property" ? "property" : "org";
  const ids = Array.isArray(propertyIds) ? propertyIds : [];
  const allowed = new Set(
    Array.isArray(allowedScopes) && allowedScopes.length ? allowedScopes : ["org", "property"]
  );
  if (!(properties || []).length && scope !== "property") {
    allowed.delete("property");
  }
  const canChangeScope = role !== "owner" && allowed.size > 0 && !disabled;
  const display = portalPropertyScopeDisplay({
    role,
    accessScope: scope,
    propertyIds: ids,
    properties,
    propertySummary: selectedPropertySummary(ids, properties),
  });
  const isSelectedPropertyScope = display.mainText === "Selected properties";

  return (
    <div className="flex max-w-[300px] items-start justify-between gap-3">
      <div className="grid min-w-0 gap-1">
        <span
          className="block text-sm font-medium leading-snug text-foreground/75"
          style={isSelectedPropertyScope ? { color: "#2563eb" } : undefined}
        >
          {display.mainText}
        </span>
        <span className="block text-xs leading-snug text-foreground/45">
          {display.subText}
        </span>
      </div>
      {canChangeScope && onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-foreground/75 shadow-sm hover:text-[var(--brand)]"
        >
          Edit
        </button>
      )}
    </div>
  );
}

function PropertyScopeEditor({
  row,
  role,
  accessScope,
  propertyIds,
  properties,
  allowedScopes,
  disabled,
  onChange,
  onSave,
  onCancel,
  expanded = false,
}) {
  const scope = role === "owner" ? "org" : accessScope === "property" ? "property" : "org";
  const ids = Array.isArray(propertyIds) ? propertyIds : [];
  const [draft, setDraft] = useState(() =>
    normalizePortalPropertyScopeDraft({ role, accessScope: scope, propertyIds: ids, properties })
  );
  const allowed = new Set(
    Array.isArray(allowedScopes) && allowedScopes.length ? allowedScopes : ["org", "property"]
  );
  if (!(properties || []).length && scope !== "property") {
    allowed.delete("property");
  }
  const canChangeScope = role !== "owner" && allowed.size > 0 && !disabled;
  const batchMode = typeof onSave === "function";
  const activeSelection = batchMode ? draft : { accessScope: scope, propertyIds: ids };
  const activeScope = activeSelection.accessScope === "property" ? "property" : "org";
  const allPropertyIds = normalizeDisplayPropertyIds(
    (properties || []).map((property) => property.id),
    properties
  );
  const checkedIds = checkedPropertyIdsForScopeSelection({
    role,
    accessScope: activeScope,
    propertyIds: activeSelection.propertyIds,
    properties,
  });
  const checkedIdSet = new Set(checkedIds);
  const canUseOrgScope = allowed.has("org");
  const allPropertiesChecked =
    allPropertyIds.length > 0 && checkedIds.length === allPropertyIds.length;
  const display = portalPropertyScopeDisplay({
    role,
    accessScope: activeScope,
    propertyIds: activeSelection.propertyIds,
    properties,
    propertySummary: selectedPropertySummary(activeSelection.propertyIds, properties),
  });
  const currentRow = row || { role, accessScope: scope, propertyIds: ids, canChangeScope };
  const draftCanSave = portalPropertyScopeDraftCanSave(currentRow, activeSelection, properties);
  const draftHasChanges = portalPropertyScopeDraftChanged(currentRow, activeSelection, properties);
  const zeroSelected = activeScope === "property" && checkedIds.length === 0;
  const propertyIdsKey = ids.join("|");
  const propertiesKey = (properties || []).map((property) => property.id).join("|");

  useEffect(() => {
    setDraft(
      normalizePortalPropertyScopeDraft({ role, accessScope: scope, propertyIds: ids, properties })
    );
  }, [role, scope, propertyIdsKey, propertiesKey]);

  function updateSelectionFromCheckedIds(nextCheckedIds) {
    const selection = portalPropertyScopeSelectionFromCheckedIds({
      checkedPropertyIds: nextCheckedIds,
      properties,
      canUseOrgScope,
    });
    if (batchMode) setDraft(selection);
    else onChange?.(selection.accessScope, selection.propertyIds);
  }

  function handlePropertyToggle(propertyId, checked) {
    const nextIds = checked
      ? normalizeDisplayPropertyIds([...checkedIds, propertyId], properties)
      : checkedIds.filter((id) => id !== propertyId);
    updateSelectionFromCheckedIds(nextIds);
  }

  function handleAllPropertiesToggle(checked) {
    if (checked) {
      updateSelectionFromCheckedIds(allPropertyIds);
      return;
    }
    updateSelectionFromCheckedIds(checkedIds.slice(0, 1));
  }

  async function handleSave() {
    if (!draftCanSave) return;
    await onSave(activeSelection.accessScope, activeSelection.propertyIds);
  }

  function handleCancel() {
    setDraft(
      normalizePortalPropertyScopeDraft({ role, accessScope: scope, propertyIds: ids, properties })
    );
    onCancel?.();
  }

  return (
    <div className={`grid gap-3 ${expanded ? "w-full" : "max-w-[380px]"}`}>
      <div className={`rounded-lg border border-border bg-slate-50 ${expanded ? "p-4" : "p-2"}`}>
        <div className={`mb-3 flex flex-col gap-1 ${expanded ? "" : "px-2 pt-1"}`}>
          <span className="text-sm font-semibold text-foreground/75">
            Selected properties
          </span>
          <span className="text-xs text-foreground/45">
            {checkedIds.length
              ? `${checkedIds.length} selected`
              : "No properties selected"}
          </span>
        </div>
        {(properties || []).length ? (
          <div className="grid gap-1">
            {canUseOrgScope && (
              <label className="flex items-start gap-2 rounded-md bg-background px-3 py-2.5 text-sm font-semibold leading-snug text-foreground/80">
                <input
                  type="checkbox"
                  checked={allPropertiesChecked}
                  disabled={!canChangeScope || allPropertyIds.length === 0}
                  onChange={(event) => handleAllPropertiesToggle(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border text-[var(--brand)]"
                />
                <span>All properties</span>
              </label>
            )}
            <div className={`${expanded ? "max-h-72" : "max-h-40"} overflow-auto`}>
              {properties.map((property) => (
                <label
                  key={property.id}
                  className="flex items-start gap-2 rounded-md px-3 py-2.5 text-sm font-medium leading-snug text-foreground/75 hover:bg-background"
                  title={formatPortalPropertyLabel(property)}
                >
                  <input
                    type="checkbox"
                    checked={checkedIdSet.has(property.id)}
                    disabled={!canChangeScope}
                    onChange={(event) => handlePropertyToggle(property.id, event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-border text-[var(--brand)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block whitespace-normal break-words">
                      {formatPortalPropertyLabel(property)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-2 py-1.5 text-xs text-foreground/55">
            No properties available.
          </div>
        )}
        {zeroSelected && (
          <p className="mt-3 text-xs font-medium text-amber-800">
            At least one property is required.
          </p>
        )}
      </div>
      <div
        className={
          batchMode
            ? "flex justify-end gap-2"
            : "grid min-w-0 gap-1"
        }
      >
        {!batchMode && (
          <>
            <span className="block text-xs font-semibold text-foreground/55">
              {display.mainText}
            </span>
            <span className="block text-xs text-foreground/45">
              {display.subText}
            </span>
          </>
        )}
        {batchMode && (
          <div className="flex shrink-0 justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={disabled}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-foreground/60 shadow-sm disabled:opacity-45"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={disabled || !draftCanSave}
              className="inline-flex h-8 items-center justify-center rounded-lg bg-[var(--brand)] px-2.5 text-xs font-semibold text-white shadow-sm disabled:opacity-45"
              title={
                zeroSelected
                  ? "At least one property is required"
                  : draftHasChanges
                  ? "Save property scope changes"
                  : "No property scope changes to save"
              }
            >
              Save
            </button>
          </div>
        )}
      </div>
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
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [adminEmails, setAdminEmails] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [accessRows, setAccessRows] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [selectedAccessRole, setSelectedAccessRole] = useState("viewer");
  const [selectedAccessScope, setSelectedAccessScope] = useState("org");
  const [selectedPropertyIds, setSelectedPropertyIds] = useState([]);
  const [clientEmail, setClientEmail] = useState("");
  const [newOrgName, setNewOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [setupLinkDetails, setSetupLinkDetails] = useState(null);
  const [copyMessage, setCopyMessage] = useState("");
  const [revokeId, setRevokeId] = useState("");
  const [cancelInviteId, setCancelInviteId] = useState("");
  const [roleChangeId, setRoleChangeId] = useState("");
  const [scopeChangeId, setScopeChangeId] = useState("");
  const [scopeEditRowId, setScopeEditRowId] = useState("");

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
      setPendingInvites(body.pendingInvites || []);
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
        setPendingInvites([]);
        setSelectedOrgId("");
        setIsPlatformAdmin(false);
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
          setIsPlatformAdmin(response.ok && body.isPlatformAdmin === true);
        }
      } catch {
        if (active) {
          setAdminStatus("denied");
          setIsPlatformAdmin(false);
        }
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

  function mergePendingInvite(invite) {
    if (!invite?.id) return;
    setPendingInvites((current) => [
      invite,
      ...current.filter(
        (row) =>
          row.id !== invite.id &&
          !(
            row.orgId === invite.orgId &&
            String(row.email || "").toLowerCase() === String(invite.email || "").toLowerCase()
          )
      ),
    ]);
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
          accessScope: selectedAccessRole === "owner" ? "org" : selectedAccessScope,
          propertyIds:
            selectedAccessRole !== "owner" && selectedAccessScope === "property"
              ? selectedPropertyIds
              : [],
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Unable to grant portal access.");
      }
      setClientEmail("");
      setActionMessage(
        body.alreadyActive
          ? `${body.user.email} already has ${selectedAccessTypeLabel(
              body.membership?.role
            )} org-level access to ${body.org.name}.`
          : body.accessGranted
          ? `Granted existing portal account ${body.user.email} ${selectedAccessTypeLabel(
              body.membership?.role
            )} access to ${body.org.name} and sent a sign-in email.`
          : body.invited
          ? `Invite email sent to ${body.user.email}; ${selectedAccessTypeLabel(
              body.invite?.role
            )} ${body.alreadyGranted
              ? "access is already assigned and account setup will finish when they accept it."
              : "access will activate after they accept it."}`
          : `Granted existing portal account ${body.user.email} ${selectedAccessTypeLabel(
              body.membership?.role
            )} org-level access to ${body.org.name}.`
      );
      mergePendingInvite(body.invite);
      await loadAccess(session);
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
          accessScope: selectedAccessRole === "owner" ? "org" : selectedAccessScope,
          propertyIds:
            selectedAccessRole !== "owner" && selectedAccessScope === "property"
              ? selectedPropertyIds
              : [],
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
          body.invite?.role
        )} access will activate after they accept it.`
      );
      mergePendingInvite(body.invite);
      await loadAccess(session);
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
      await loadAccess(session);
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
      await loadAccess(session);
    } catch (error) {
      setLoadError(error.message || "Unable to revoke portal access.");
    } finally {
      setRevokeId("");
    }
  }

  async function handleRoleChange(row, nextRole) {
    if (!session?.access_token || !row?.canChangeRole || row.role === nextRole) return;
    setRoleChangeId(row.id);
    setActionMessage("");
    setLoadError("");

    try {
      const response = await fetch("/api/admin/portal-access", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "changeRole",
          orgId: row.orgId,
          userId: row.userId,
          accessRole: nextRole,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Unable to change portal role.");
      }
      setActionMessage(
        `Changed ${row.email || row.userId} to ${selectedAccessTypeLabel(
          body.membership?.role || nextRole
        )} for ${row.orgName}.`
      );
      await loadAccess(session);
    } catch (error) {
      setLoadError(error.message || "Unable to change portal role.");
      await loadAccess(session);
    } finally {
      setRoleChangeId("");
    }
  }

  async function handleScopeChange(row, nextScope, nextPropertyIds) {
    if (!session?.access_token || !row?.canChangeScope || row.role === "owner") return false;
    const normalizedScope = nextScope === "property" ? "property" : "org";
    const normalizedPropertyIds = normalizedScope === "property" ? nextPropertyIds : [];
    if (
      normalizedScope === row.accessScope &&
      JSON.stringify([...(row.propertyIds || [])].sort()) ===
        JSON.stringify([...normalizedPropertyIds].sort())
    ) {
      return true;
    }

    setScopeChangeId(row.id);
    setActionMessage("");
    setLoadError("");

    try {
      const response = await fetch("/api/admin/portal-access", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "changeScope",
          orgId: row.orgId,
          userId: row.userId,
          accessScope: normalizedScope,
          propertyIds: normalizedPropertyIds,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Unable to change property scope.");
      }
      setActionMessage(
        `Changed ${row.email || row.userId} property scope for ${row.orgName}.`
      );
      await loadAccess(session);
      return true;
    } catch (error) {
      setLoadError(error.message || "Unable to change property scope.");
      await loadAccess(session);
      return false;
    } finally {
      setScopeChangeId("");
    }
  }

  async function handleExpandedScopeSave(row, nextScope, nextPropertyIds) {
    const changed = await handleScopeChange(row, nextScope, nextPropertyIds);
    if (changed) setScopeEditRowId("");
  }

  async function handleCancelInvite(row) {
    if (!session?.access_token || !row?.id || !row?.canCancel) return;
    setCancelInviteId(row.id);
    setActionMessage("");
    setLoadError("");

    try {
      const response = await fetch("/api/admin/portal-access", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "cancelInvite",
          inviteId: row.id,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Unable to cancel invite.");
      }
      setPendingInvites((current) => current.filter((invite) => invite.id !== row.id));
      setActionMessage(`Canceled invite for ${row.email} to ${row.orgName}.`);
      await loadAccess(session);
    } catch (error) {
      setLoadError(error.message || "Unable to cancel invite.");
      await loadAccess(session);
    } finally {
      setCancelInviteId("");
    }
  }

  const selectedOrg = useMemo(
    () => orgs.find((org) => org.id === selectedOrgId) || null,
    [orgs, selectedOrgId]
  );
  const selectedOrgProperties = useMemo(
    () => selectedOrg?.properties || EMPTY_PROPERTIES,
    [selectedOrg]
  );

  const inviteRoleOptions = useMemo(() => {
    const allowedRoles = Array.isArray(selectedOrg?.inviteRoles)
      ? new Set(selectedOrg.inviteRoles)
      : new Set();
    return ROLE_CHANGE_OPTIONS.filter((option) => allowedRoles.has(option.value));
  }, [selectedOrg]);

  useEffect(() => {
    if (!inviteRoleOptions.length) return;
    if (!inviteRoleOptions.some((option) => option.value === selectedAccessRole)) {
      setSelectedAccessRole(inviteRoleOptions[0].value);
    }
  }, [inviteRoleOptions, selectedAccessRole]);

  useEffect(() => {
    if (selectedAccessRole === "owner") {
      setSelectedAccessScope("org");
      setSelectedPropertyIds([]);
      return;
    }
    if (selectedAccessScope === "property" && selectedOrgProperties.length === 0) {
      setSelectedAccessScope("org");
    }
    setSelectedPropertyIds((current) => {
      const allowedIds = new Set(selectedOrgProperties.map((property) => property.id));
      const next = current.filter((propertyId) => allowedIds.has(propertyId));
      return next.length === current.length ? current : next;
    });
  }, [selectedAccessRole, selectedAccessScope, selectedOrgProperties]);

  useEffect(() => {
    setScopeEditRowId("");
  }, [selectedOrgId]);

  const inviteScopeIncomplete =
    selectedAccessRole !== "owner" &&
    selectedAccessScope === "property" &&
    selectedPropertyIds.length === 0;

  const visibleRows = useMemo(() => {
    if (!selectedOrgId) return accessRows;
    return accessRows.filter((row) => row.orgId === selectedOrgId);
  }, [accessRows, selectedOrgId]);

  const visiblePendingInvites = useMemo(() => {
    if (!selectedOrgId) return pendingInvites;
    return pendingInvites.filter((row) => row.orgId === selectedOrgId);
  }, [pendingInvites, selectedOrgId]);

  const activeAdminRows = useMemo(() => {
    const approvedAdmins = new Set(adminEmails);
    return visibleRows.filter(
      (row) =>
        approvedAdmins.has(row.email) &&
        row.role === "owner" &&
        (row.accessScope || "org") === "org"
    );
  }, [adminEmails, visibleRows]);

  const unifiedAccessRows = useMemo(() => {
    const pendingKeys = new Set(visiblePendingInvites.map(accessRowKey));
    const activeRows = visibleRows
      .filter((row) => {
        const isOrdinaryPendingAccess =
          row.accountStatus?.state !== "confirmed" &&
          Boolean(ACCESS_ROLE_LABELS[row.role]);
        return !(isOrdinaryPendingAccess && pendingKeys.has(accessRowKey(row)));
      })
      .map((row) => ({
        ...row,
        rowType: "active",
        sortAt: row.createdAt || row.updatedAt,
      }));

    const inviteRows = visiblePendingInvites.map((invite) => ({
      ...invite,
      rowType: "invite",
      hasActiveAccess: visibleRows.some((row) => accessRowKey(row) === accessRowKey(invite)),
      sortAt: invite.createdAt,
    }));

    return [...inviteRows, ...activeRows].sort((left, right) => {
      const leftTime = new Date(left.sortAt || 0).getTime();
      const rightTime = new Date(right.sortAt || 0).getTime();
      return rightTime - leftTime;
    });
  }, [visiblePendingInvites, visibleRows]);

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
                <FileText className="h-4 w-4" />
                Reports
              </a>
              <a
                href="/punch-list"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground/75 shadow-sm hover:text-foreground"
              >
                <ClipboardList className="h-4 w-4" />
                Punch List
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
              onClick={() => loadAccess(session)}
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

            {isPlatformAdmin && (
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
            )}

            <section className="rounded-lg border border-border bg-background p-5 shadow-sm">
              <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_190px_260px_auto] lg:items-start">
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
                    disabled={!inviteRoleOptions.length}
                    className="h-11 rounded-lg border border-input bg-background px-3 text-base outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
                  >
                    {inviteRoleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-1.5 text-sm font-medium text-foreground">
                  Property Scope
                  <PropertyScopeEditor
                    role={selectedAccessRole}
                    accessScope={selectedAccessScope}
                    propertyIds={selectedPropertyIds}
                    properties={selectedOrgProperties}
                    disabled={submitting || setupSubmitting}
                    onChange={(nextScope, nextPropertyIds) => {
                      setSelectedAccessScope(nextScope);
                      setSelectedPropertyIds(nextPropertyIds);
                    }}
                  />
                </div>
                <div className="flex flex-col gap-2 pt-6 sm:flex-row md:col-span-3 lg:col-span-1">
                  <button
                    type="button"
                    onClick={() => handleAccessSubmit("grantExisting")}
                    disabled={
                      submitting ||
                      setupSubmitting ||
                      !clientEmail ||
                      !selectedOrgId ||
                      !inviteRoleOptions.length ||
                      inviteScopeIncomplete
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
                      !selectedOrgId ||
                      !inviteRoleOptions.length ||
                      inviteScopeIncomplete
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
                      !selectedOrgId ||
                      !inviteRoleOptions.length ||
                      inviteScopeIncomplete
                    }
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-950 shadow-sm hover:bg-amber-100 disabled:opacity-60"
                  >
                    <KeyRound className="h-4 w-4" />
                    {setupSubmitting ? "Creating..." : "Fallback Setup Link"}
                  </button>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-foreground/60">
                Invite User sends a Scout-branded setup invite for new portal
                users, or grants access immediately when the email already has a
                confirmed portal account. Grant Access is for an existing portal
                account when no notification is needed. Use the fallback setup
                link only when you need to copy the same setup flow manually.
              </p>
              {setupLinkDetails?.setupUrl && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="text-sm font-semibold text-amber-950">
                    Fallback setup link for {setupLinkDetails.email}
                  </div>
                  <p className="mt-1 text-sm text-amber-900/80">
                    Copy this link only if the invite email did not arrive. It opens
                    the Client Portal invite setup page and activates access only
                    after the recipient accepts it.
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
                    {visibleRows.length} active access row
                    {visibleRows.length === 1 ? "" : "s"};{" "}
                    {visiblePendingInvites.length} pending invite
                    {visiblePendingInvites.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeAdminRows.map((adminRow) => (
                    <span
                      key={adminRow.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-slate-50 px-2.5 py-1 text-xs font-semibold text-foreground/70"
                    >
                      <ShieldCheck className="h-3.5 w-3.5 text-[var(--brand)]" />
                      {adminRow.email}
                    </span>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-left text-sm">
                  <thead className="border-b border-border bg-slate-50 text-xs uppercase text-foreground/55">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Email</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 font-semibold">Role</th>
                      <th className="px-5 py-3 font-semibold">Properties</th>
                      <th className="px-5 py-3 font-semibold">Created</th>
                      <th className="px-5 py-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unifiedAccessRows.map((row) => {
                      const canEditScope =
                        row.rowType === "active" && canEditPortalPropertyScope(row);
                      const isScopeEditing = canEditScope && scopeEditRowId === row.id;

                      return (
                        <Fragment key={`${row.rowType}:${row.id}`}>
                          <tr className="border-b border-border last:border-b-0">
                            <td className="px-5 py-3 font-medium text-foreground">
                              {row.email || row.userId}
                            </td>
                            <td className="px-5 py-3">
                              {row.rowType === "invite" ? (
                                <InviteStatus row={row} />
                              ) : (
                                <AccountStatus status={row.accountStatus} />
                              )}
                            </td>
                            <td className="px-5 py-3 text-foreground/70">
                              {row.rowType === "invite" ? (
                                <span className="font-medium text-foreground/75">
                                  {selectedAccessTypeLabel(row.role)}
                                </span>
                              ) : (
                                <RoleSelect
                                  row={row}
                                  disabled={roleChangeId === row.id}
                                  onChange={handleRoleChange}
                                />
                              )}
                            </td>
                            <td className="px-5 py-3 text-foreground/70">
                              <PropertyScopeSummary
                                role={row.role}
                                accessScope={row.accessScope}
                                propertyIds={row.propertyIds || []}
                                properties={selectedOrgProperties}
                                allowedScopes={row.allowedAccessScopes}
                                disabled={
                                  row.rowType === "invite" ||
                                  scopeChangeId === row.id ||
                                  !canEditScope
                                }
                                onEdit={() => setScopeEditRowId(row.id)}
                              />
                            </td>
                            <td className="px-5 py-3 text-foreground/70">
                              {formatDate(row.createdAt)}
                            </td>
                            <td className="px-5 py-3 text-right">
                              {row.rowType === "invite" ? (
                                <button
                                  type="button"
                                  onClick={() => handleCancelInvite(row)}
                                  disabled={!row.canCancel || cancelInviteId === row.id}
                                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground/75 shadow-sm hover:text-red-700 disabled:opacity-45"
                                  title={
                                    row.canCancel
                                      ? "Cancel pending invite"
                                      : "This invite cannot be canceled here"
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                  {cancelInviteId === row.id ? "Canceling..." : "Cancel"}
                                </button>
                              ) : (
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
                              )}
                            </td>
                          </tr>
                          {isScopeEditing && (
                            <tr className="border-b border-border bg-slate-50/70">
                              <td colSpan={6} className="px-5 py-4">
                                <PropertyScopeEditor
                                  row={row}
                                  role={row.role}
                                  accessScope={row.accessScope}
                                  propertyIds={row.propertyIds || []}
                                  properties={selectedOrgProperties}
                                  allowedScopes={row.allowedAccessScopes}
                                  disabled={scopeChangeId === row.id}
                                  expanded
                                  onSave={(nextScope, nextPropertyIds) =>
                                    handleExpandedScopeSave(row, nextScope, nextPropertyIds)
                                  }
                                  onCancel={() => setScopeEditRowId("")}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {unifiedAccessRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-5 py-8 text-center text-sm text-foreground/60"
                        >
                          No access rows or pending invites.
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
