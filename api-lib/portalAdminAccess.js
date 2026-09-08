export const PRIMARY_ADMIN_EMAIL = "brian@scoutclear.com";
export const DEFAULT_ADMIN_EMAILS = [
  "bennettb15@gmail.com",
  PRIMARY_ADMIN_EMAIL,
];

export const ORDINARY_ACCESS_ROLES = new Set(["viewer", "field"]);
export const PORTAL_ACCESS_ROLES = new Set(["owner", "manager", "field", "viewer"]);
export const MANAGEMENT_ACCESS_ROLES = new Set(["owner", "manager"]);

export const PORTAL_ACCESS_ROLE_LABELS = {
  field: "Field",
  manager: "Manager",
  owner: "Owner",
  viewer: "Viewer",
};

export const OWNER_INVITE_ROLES = ["viewer", "field", "manager", "owner"];
export const MANAGER_INVITE_ROLES = ["viewer", "field", "manager"];

export function portalAccessRoleLabel(role) {
  return PORTAL_ACCESS_ROLE_LABELS[role] || "Viewer";
}

export function normalizePortalAccessRole(value, fallback = "") {
  const role = String(value || fallback).trim().toLowerCase();
  return PORTAL_ACCESS_ROLES.has(role) ? role : "";
}

export function inviteRolesForActor(actorRole) {
  if (actorRole === "owner") return OWNER_INVITE_ROLES;
  if (actorRole === "manager") return MANAGER_INVITE_ROLES;
  return [];
}

export function canActorInvitePortalRole({ actorRole, targetRole }) {
  return inviteRolesForActor(actorRole).includes(targetRole);
}

export function canActorCancelPendingInvite({ actorRole, inviteRole }) {
  return canActorInvitePortalRole({ actorRole, targetRole: inviteRole });
}

export function canActorChangePortalRole({ actorRole, currentRole, nextRole, isRequiredAdmin = false }) {
  if (isRequiredAdmin) return false;
  if (!PORTAL_ACCESS_ROLES.has(currentRole) || !PORTAL_ACCESS_ROLES.has(nextRole)) return false;
  if (actorRole === "owner") return true;
  if (actorRole !== "manager") return false;
  return currentRole !== "owner" && nextRole !== "owner";
}

export function canActorRevokePortalRole({ actorRole, targetRole, isRequiredAdmin = false }) {
  if (isRequiredAdmin) return false;
  if (!PORTAL_ACCESS_ROLES.has(targetRole)) return false;
  if (actorRole === "owner") return true;
  if (actorRole !== "manager") return false;
  return targetRole !== "owner";
}

export function wouldRemoveLastOwner({ currentRole, nextRole, activeOwnerCount }) {
  return currentRole === "owner" && nextRole !== "owner" && activeOwnerCount <= 1;
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function adminEmailSet() {
  const configured = [
    process.env.SCOUT_PORTAL_ADMIN_EMAILS,
    process.env.PORTAL_ADMIN_EMAILS,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","));

  return new Set(
    [...DEFAULT_ADMIN_EMAILS, ...configured]
      .map((email) => normalizeEmail(email))
      .filter(Boolean)
  );
}

export function isApprovedAdminEmail(email) {
  return adminEmailSet().has(normalizeEmail(email));
}

export function accountStatusSummary(user, statusAvailable) {
  if (!statusAvailable) {
    return {
      state: "unknown",
      label: "Status unavailable",
      detail: "Auth status could not be loaded.",
      lastSignInAt: null,
    };
  }

  if (!user) {
    return {
      state: "unknown",
      label: "Status unavailable",
      detail: "No matching auth account was found.",
      lastSignInAt: null,
    };
  }

  const confirmedAt = user.email_confirmed_at || user.confirmed_at || null;
  const invitedAt = user.invited_at || user.confirmation_sent_at || null;
  return {
    state: confirmedAt ? "confirmed" : "pending",
    label: confirmedAt ? "Confirmed" : "Invited / pending",
    detail: confirmedAt
      ? "Account email is confirmed."
      : invitedAt
        ? "Invite exists; user has not confirmed yet."
        : "User has not confirmed yet.",
    emailConfirmedAt: confirmedAt,
    invitedAt,
    lastSignInAt: user.last_sign_in_at || null,
  };
}

export function membershipSummary(row, profileById, orgById, authById, authStatusAvailable) {
  const profile = profileById.get(row.user_id) || {};
  const email = normalizeEmail(profile.email);
  const authUser = authById.get(row.user_id) || null;
  const role = normalizePortalAccessRole(row.role, "viewer");
  return {
    id: row.id,
    orgId: row.org_id,
    orgName: orgById.get(row.org_id)?.name || "Organization",
    userId: row.user_id,
    email,
    role,
    accessScope: row.access_scope || "org",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    accountStatus: accountStatusSummary(authUser, authStatusAvailable),
    canRevoke:
      ORDINARY_ACCESS_ROLES.has(role) &&
      (row.access_scope || "org") === "org" &&
      row.deleted_at === null &&
      !isApprovedAdminEmail(email),
  };
}

export function membershipNeedsRequiredAdminRepair(row) {
  return (
    !row ||
    row.deleted_at !== null ||
    row.role !== "owner" ||
    (row.access_scope || "org") !== "org"
  );
}
