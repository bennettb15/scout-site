export const PRIMARY_ADMIN_EMAIL = "brian@scoutclear.com";
export const DEFAULT_ADMIN_EMAILS = [
  "bennettb15@gmail.com",
  PRIMARY_ADMIN_EMAIL,
];

const ORDINARY_ACCESS_ROLES = new Set(["viewer", "field"]);

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
  return {
    id: row.id,
    orgId: row.org_id,
    orgName: orgById.get(row.org_id)?.name || "Organization",
    userId: row.user_id,
    email,
    role: row.role,
    accessScope: row.access_scope || "org",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    accountStatus: accountStatusSummary(authUser, authStatusAvailable),
    canRevoke:
      ORDINARY_ACCESS_ROLES.has(row.role) &&
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
