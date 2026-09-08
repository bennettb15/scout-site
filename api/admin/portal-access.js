import {
  adminEmailSet,
  findAuthUserByEmail,
  isApprovedAdminEmail,
  loadOrg,
  normalizeEmail,
  readJsonBody,
  requirePortalAdmin,
  validateEmail,
  validateUuid,
  ensureUserProfile,
} from "../_portalAdminShared.js";
import { sendJson } from "../_reportPortalShared.js";
import {
  PortalInviteError,
  assertInviteEmailConfigured,
  createInviteToken,
  hashInviteToken,
  inviteExpiresAt,
  inviteRoleLabel,
  inviteUrl,
  portalInviteStatus,
  sendPortalInviteEmail,
} from "../_portalInviteShared.js";

const ORDINARY_ACCESS_ROLES = new Set(["viewer", "field"]);
const PORTAL_ACCESS_ROLES = new Set(["owner", "manager", "field", "viewer"]);
const ORDINARY_ACCESS_ONLY_ERROR =
  "Only existing org-level Client Viewer or Field User access can be changed here.";
const MAX_ORG_NAME_LENGTH = 120;

function validateAccessRole(value) {
  const role = String(value || "viewer").trim().toLowerCase();
  return ORDINARY_ACCESS_ROLES.has(role) ? role : "";
}

function normalizeOrgName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function orgNameKey(value) {
  return normalizeOrgName(value).toLowerCase();
}

function slugFromOrgName(value) {
  return orgNameKey(value)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function userSummary(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: normalizeEmail(user.email),
    createdAt: user.created_at,
    emailConfirmedAt: user.email_confirmed_at || null,
    invitedAt: user.invited_at || null,
    confirmationSentAt: user.confirmation_sent_at || null,
    lastSignInAt: user.last_sign_in_at || null,
  };
}

function accountStatusSummary(user, statusAvailable) {
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

async function loadAuthUsersById(service, targetIds) {
  const remaining = new Set(targetIds);
  const byId = new Map();

  for (let page = 1; page <= 20 && remaining.size > 0; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;

    for (const user of data?.users || []) {
      if (remaining.has(user.id)) {
        byId.set(user.id, user);
        remaining.delete(user.id);
      }
    }
    if (!data?.users || data.users.length < 1000) break;
  }

  return byId;
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

function pendingInviteSummary(row, orgById) {
  return {
    id: row.id,
    orgId: row.org_id,
    orgName: orgById.get(row.org_id)?.name || "Organization",
    email: normalizeEmail(row.email),
    role: row.role,
    accessScope: row.access_scope || "org",
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    state: portalInviteStatus(row),
  };
}

async function loadPendingInvites(service, orgById) {
  const { data, error } = await service
    .from("portal_invites")
    .select("id,org_id,email,role,access_scope,created_at,expires_at,accepted_at,revoked_at,revoked_reason")
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }

  return (data || []).map((row) => pendingInviteSummary(row, orgById));
}

export function membershipNeedsRequiredAdminRepair(row) {
  return (
    !row ||
    row.deleted_at !== null ||
    row.role !== "owner" ||
    (row.access_scope || "org") !== "org"
  );
}

async function ensureRequiredAdminOrgAccess(service, orgRows, actorId) {
  const orgIds = [...new Set((orgRows || []).map((row) => row.id).filter(Boolean))];
  if (!orgIds.length) return { repairedCount: 0, missingAdminEmails: [] };

  const adminUsers = [];
  const missingAdminEmails = [];
  for (const email of [...adminEmailSet()].sort()) {
    const user = await findAuthUserByEmail(service, email);
    if (!user?.id) {
      missingAdminEmails.push(email);
      continue;
    }
    await ensureUserProfile(service, user, actorId);
    adminUsers.push({ id: user.id, email });
  }

  const userIds = adminUsers.map((user) => user.id);
  if (!userIds.length) return { repairedCount: 0, missingAdminEmails };

  const { data: existingRows, error: existingError } = await service
    .from("org_memberships")
    .select("id,org_id,user_id,role,access_scope,deleted_at")
    .in("org_id", orgIds)
    .in("user_id", userIds);
  if (existingError) throw existingError;

  const existingByOrgUser = new Map(
    (existingRows || []).map((row) => [`${row.org_id}:${row.user_id}`, row])
  );
  const rowsToRepair = [];
  for (const orgId of orgIds) {
    for (const user of adminUsers) {
      const existing = existingByOrgUser.get(`${orgId}:${user.id}`);
      if (!membershipNeedsRequiredAdminRepair(existing)) continue;
      rowsToRepair.push({
        org_id: orgId,
        user_id: user.id,
        role: "owner",
        access_scope: "org",
        updated_by: actorId,
        deleted_at: null,
      });
    }
  }

  if (!rowsToRepair.length) return { repairedCount: 0, missingAdminEmails };

  const { error: repairError } = await service
    .from("org_memberships")
    .upsert(rowsToRepair, { onConflict: "org_id,user_id" });
  if (repairError) throw repairError;

  return { repairedCount: rowsToRepair.length, missingAdminEmails };
}

async function loadPortalAccess(service) {
  const { data: orgRows, error: orgsError } = await service
    .from("orgs")
    .select("id,name")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (orgsError) {
    throw new Error("Unable to load portal access.");
  }

  const adminAccessSync = await ensureRequiredAdminOrgAccess(service, orgRows || [], null);

  const { data: membershipRows, error: membershipsError } = await service
    .from("org_memberships")
    .select("id,org_id,user_id,role,access_scope,created_at,updated_at,deleted_at")
    .is("deleted_at", null)
    .in("role", Array.from(PORTAL_ACCESS_ROLES))
    .or("access_scope.eq.org,access_scope.is.null")
    .order("created_at", { ascending: false });

  if (membershipsError) throw new Error("Unable to load portal access.");

  const userIds = [...new Set((membershipRows || []).map((row) => row.user_id))];
  const { data: profileRows, error: profilesError } = userIds.length
    ? await service
        .from("users_profile")
        .select("id,email,full_name,deleted_at")
        .in("id", userIds)
    : { data: [], error: null };

  if (profilesError) throw new Error("Unable to load portal users.");

  let authById = new Map();
  let authStatusAvailable = true;
  try {
    authById = userIds.length
      ? await loadAuthUsersById(service, userIds)
      : new Map();
  } catch {
    authStatusAvailable = false;
  }

  const orgById = new Map((orgRows || []).map((row) => [row.id, row]));
  const profileById = new Map((profileRows || []).map((row) => [row.id, row]));
  const accessRows = (membershipRows || []).map((row) =>
    membershipSummary(row, profileById, orgById, authById, authStatusAvailable)
  );
  const pendingInvites = await loadPendingInvites(service, orgById);

  return {
    adminEmails: [...adminEmailSet()].sort(),
    adminAccessSync,
    orgs: (orgRows || []).map((row) => ({
      id: row.id,
      name: row.name,
    })),
    access: accessRows,
    pendingInvites,
  };
}

async function handleGet(req, res, context) {
  try {
    return sendJson(res, 200, await loadPortalAccess(context.service));
  } catch {
    return sendJson(res, 500, { error: "Unable to load portal access." });
  }
}

export async function upsertOrgMembership(service, { orgId, userId, role, actorId }) {
  const { data: existingMembership, error: existingMembershipError } =
    await service
      .from("org_memberships")
      .select("id,role,access_scope,deleted_at")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();

  if (existingMembershipError) throw existingMembershipError;
  if (
    existingMembership &&
    ORDINARY_ACCESS_ROLES.has(role) &&
    (!ORDINARY_ACCESS_ROLES.has(existingMembership.role) ||
      (existingMembership.access_scope || "org") !== "org")
  ) {
    throw new Error(ORDINARY_ACCESS_ONLY_ERROR);
  }

  const { data: membership, error: membershipError } = await service
    .from("org_memberships")
    .upsert(
      {
        org_id: orgId,
        user_id: userId,
        role,
        access_scope: "org",
        updated_by: actorId,
        deleted_at: null,
      },
      { onConflict: "org_id,user_id" }
    )
    .select("id,org_id,user_id,role,access_scope,created_at,updated_at,deleted_at")
    .single();

  if (membershipError) throw membershipError;
  return membership;
}

export function membershipResponse(membership) {
  return {
    id: membership.id,
    orgId: membership.org_id,
    userId: membership.user_id,
    role: membership.role,
    accessScope: membership.access_scope || "org",
    createdAt: membership.created_at,
    updatedAt: membership.updated_at,
  };
}

async function findActiveOrgMembership(service, { orgId, userId }) {
  const { data, error } = await service
    .from("org_memberships")
    .select("id,org_id,user_id,role,access_scope,created_at,updated_at,deleted_at")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function createPendingPortalInvite(
  service,
  { req, org, email, role, actorId, sendEmail = false }
) {
  if (sendEmail) assertInviteEmailConfigured();
  const token = createInviteToken();
  const now = new Date().toISOString();
  const setupUrl = inviteUrl(req, token);

  const { error: replaceError } = await service
    .from("portal_invites")
    .update({
      revoked_at: now,
      revoked_reason: "replaced",
      updated_by: actorId,
    })
    .eq("org_id", org.id)
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);
  if (replaceError) throw replaceError;

  const { data: invite, error: insertError } = await service
    .from("portal_invites")
    .insert({
      org_id: org.id,
      email,
      role,
      access_scope: "org",
      token_hash: hashInviteToken(token),
      created_by: actorId,
      updated_by: actorId,
      last_sent_at: now,
      expires_at: inviteExpiresAt(),
    })
    .select("id,org_id,email,role,access_scope,created_at,expires_at,accepted_at,revoked_at,revoked_reason")
    .single();
  if (insertError) throw insertError;

  if (sendEmail) {
    try {
      await sendPortalInviteEmail({
        email,
        org,
        role,
        setupUrl,
      });
    } catch (error) {
      await service
        .from("portal_invites")
        .update({
          revoked_at: new Date().toISOString(),
          revoked_reason: "email_failed",
          updated_by: actorId,
        })
        .eq("id", invite.id);
      throw error;
    }
  }

  return {
    invite,
    setupUrl,
  };
}

async function grantOrgAccess(req, res, context) {
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const email = validateEmail(body.email);
  const orgId = validateUuid(body.orgId);
  const requestedRole = validateAccessRole(body.accessRole);
  if (!email) return sendJson(res, 400, { error: "Valid email is required." });
  if (!orgId) return sendJson(res, 400, { error: "Valid org ID is required." });
  if (!requestedRole) {
    return sendJson(res, 400, {
      error: "Access type must be Client Viewer or Field User.",
    });
  }
  if (isApprovedAdminEmail(email)) {
    return sendJson(res, 400, {
      error: "Invite User is for Client Viewer and Field User access. Approved admin emails already receive owner access.",
    });
  }

  try {
    const org = await loadOrg(context.service, orgId);
    if (!org) return sendJson(res, 404, { error: "Organization not found." });
    await ensureUserProfile(context.service, context.user, context.user.id);

    const user = await findAuthUserByEmail(context.service, email);
    const activeMembership = user?.id
      ? await findActiveOrgMembership(context.service, { orgId, userId: user.id })
      : null;
    const confirmedAt = user?.email_confirmed_at || user?.confirmed_at || null;
    if (activeMembership && confirmedAt) {
      return sendJson(res, 200, {
        user: userSummary(user),
        invited: false,
        alreadyActive: true,
        org,
        membership: membershipResponse(activeMembership),
      });
    }

    const { invite, setupUrl } = await createPendingPortalInvite(context.service, {
      req,
      org,
      email,
      role: requestedRole,
      actorId: context.user.id,
      sendEmail: true,
    });

    return sendJson(res, 200, {
      user: {
        email,
      },
      invited: true,
      alreadyActive: false,
      alreadyGranted: Boolean(activeMembership),
      org,
      invite: pendingInviteSummary(invite, new Map([[org.id, org]])),
      setupUrl,
      setupPath: "/accept-invite",
    });
  } catch (error) {
    const status = error instanceof PortalInviteError
      ? error.status
      : error.message === ORDINARY_ACCESS_ONLY_ERROR
        ? 400
        : 500;
    return sendJson(res, status, {
      error: error.message || "Unable to grant portal access.",
      code: error.code || undefined,
    });
  }
}

async function grantExistingOrgAccess(req, res, context) {
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const email = validateEmail(body.email);
  const orgId = validateUuid(body.orgId);
  const requestedRole = validateAccessRole(body.accessRole);
  if (!email) return sendJson(res, 400, { error: "Valid email is required." });
  if (!orgId) return sendJson(res, 400, { error: "Valid org ID is required." });
  if (!requestedRole) {
    return sendJson(res, 400, {
      error: "Access type must be Client Viewer or Field User.",
    });
  }

  try {
    const org = await loadOrg(context.service, orgId);
    if (!org) return sendJson(res, 404, { error: "Organization not found." });

    const user = await findAuthUserByEmail(context.service, email);
    if (!user) {
      return sendJson(res, 404, {
        error: "No portal account found. Use Invite user for new clients.",
      });
    }

    await ensureUserProfile(context.service, user, context.user.id);

    const role = isApprovedAdminEmail(email) ? "owner" : requestedRole;
    const membership = await upsertOrgMembership(context.service, {
      orgId,
      userId: user.id,
      role,
      actorId: context.user.id,
    });

    return sendJson(res, 200, {
      user: userSummary(user),
      invited: false,
      org,
      membership: membershipResponse(membership),
    });
  } catch (error) {
    const status = error.message === ORDINARY_ACCESS_ONLY_ERROR
      ? 400
      : 500;
    return sendJson(res, status, {
      error: error.message || "Unable to grant portal access.",
    });
  }
}

async function createSetupLink(req, res, context) {
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const email = validateEmail(body.email);
  const orgId = validateUuid(body.orgId);
  const requestedRole = validateAccessRole(body.accessRole);
  if (!email) return sendJson(res, 400, { error: "Valid email is required." });
  if (!orgId) return sendJson(res, 400, { error: "Valid org ID is required." });
  if (!requestedRole) {
    return sendJson(res, 400, {
      error: "Access type must be Client Viewer or Field User.",
    });
  }
  if (isApprovedAdminEmail(email)) {
    return sendJson(res, 400, {
      error: "Admin setup links cannot be generated here.",
    });
  }

  try {
    const org = await loadOrg(context.service, orgId);
    if (!org) return sendJson(res, 404, { error: "Organization not found." });

    await ensureUserProfile(context.service, context.user, context.user.id);
    const { invite, setupUrl } = await createPendingPortalInvite(context.service, {
      req,
      org,
      email,
      role: requestedRole,
      actorId: context.user.id,
      sendEmail: false,
    });

    return sendJson(res, 200, {
      user: { email },
      org,
      invite: pendingInviteSummary(invite, new Map([[org.id, org]])),
      setupUrl,
      setupPath: "/accept-invite",
      setupType: "portal_invite",
    });
  } catch (error) {
    const status = error instanceof PortalInviteError
      ? error.status
      : error.message === ORDINARY_ACCESS_ONLY_ERROR
        ? 400
        : 500;
    return sendJson(res, status, {
      error: error.message || "Unable to create setup link.",
      code: error.code || undefined,
    });
  }
}

async function createOrganization(req, res, context) {
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const name = normalizeOrgName(body.name);
  const slug = slugFromOrgName(name);
  if (!name) return sendJson(res, 400, { error: "Organization name is required." });
  if (name.length > MAX_ORG_NAME_LENGTH) {
    return sendJson(res, 400, {
      error: `Organization name must be ${MAX_ORG_NAME_LENGTH} characters or fewer.`,
    });
  }
  if (!slug) {
    return sendJson(res, 400, { error: "Organization name must include letters or numbers." });
  }

  try {
    const { data: existingOrgs, error: existingError } = await context.service
      .from("orgs")
      .select("id,name,slug")
      .is("deleted_at", null);
    if (existingError) throw existingError;

    const duplicate = (existingOrgs || []).find(
      (org) => orgNameKey(org.name) === orgNameKey(name) || String(org.slug || "") === slug
    );
    if (duplicate) {
      return sendJson(res, 409, {
        error: `An active organization named ${duplicate.name} already exists.`,
        org: {
          id: duplicate.id,
          name: duplicate.name,
          slug: duplicate.slug,
        },
      });
    }

    await ensureUserProfile(context.service, context.user, context.user.id);

    const { data: org, error: createError } = await context.service
      .from("orgs")
      .insert({
        name,
        slug,
        updated_by: context.user.id,
        deleted_at: null,
      })
      .select("id,name,slug,created_at,updated_at")
      .single();

    if (createError) throw createError;
    await ensureRequiredAdminOrgAccess(context.service, [org], context.user.id);

    return sendJson(res, 201, {
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        createdAt: org.created_at,
        updatedAt: org.updated_at,
      },
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: error.message || "Unable to create organization.",
    });
  }
}

async function revokeOrgAccess(req, res, context) {
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const orgId = validateUuid(body.orgId);
  const userId = validateUuid(body.userId);
  if (!orgId) return sendJson(res, 400, { error: "Valid org ID is required." });
  if (!userId) return sendJson(res, 400, { error: "Valid user ID is required." });

  try {
    const { data: profile, error: profileError } = await context.service
      .from("users_profile")
      .select("id,email")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (isApprovedAdminEmail(profile?.email)) {
      return sendJson(res, 400, { error: "Approved admin access cannot be revoked here." });
    }

    const { data: membership, error: membershipError } = await context.service
      .from("org_memberships")
      .select("id,role,access_scope,deleted_at")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership) {
      return sendJson(res, 404, { error: "Active org access not found." });
    }
    if (
      !ORDINARY_ACCESS_ROLES.has(membership.role) ||
      (membership.access_scope || "org") !== "org"
    ) {
      return sendJson(res, 400, {
        error: "Only ordinary org-level portal access can be revoked here.",
      });
    }

    const { error: revokeError } = await context.service
      .from("org_memberships")
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: context.user.id,
      })
      .eq("id", membership.id)
      .is("deleted_at", null);

    if (revokeError) throw revokeError;
    return sendJson(res, 200, { revoked: true });
  } catch (error) {
    return sendJson(res, 500, {
      error: error.message || "Unable to revoke portal access.",
    });
  }
}

export default async function handler(req, res) {
  const context = await requirePortalAdmin(req, res, [
    "GET",
    "POST",
    "DELETE",
    "OPTIONS",
  ]);
  if (!context) return;

  if (req.method === "GET") return handleGet(req, res, context);
  if (req.method === "POST") {
    let body = {};
    try {
      body = await readJsonBody(req);
    } catch {
      return sendJson(res, 400, { error: "Invalid JSON body." });
    }

    req.body = body;
    if (body.action === "createOrg") return createOrganization(req, res, context);
    if (body.action === "setupLink") return createSetupLink(req, res, context);
    if (body.action === "grantExisting") return grantExistingOrgAccess(req, res, context);
    return grantOrgAccess(req, res, context);
  }
  if (req.method === "DELETE") return revokeOrgAccess(req, res, context);
}
