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
import {
  createServiceClient,
  methodAllowed,
  sendJson,
} from "../_reportPortalShared.js";
import {
  PortalInviteError,
  authUserConfirmedAt,
  activateInvite,
  assertInviteEmailConfigured,
  createInviteToken,
  getInviteToken,
  hashInviteToken,
  inviteExpiresAt,
  inviteAdminActionForUser,
  inviteRoleLabel,
  inviteUrl,
  loadInvitePublicDetails,
  portalInviteErrorResponse,
  portalInviteStatus,
  reportsUrl,
  sendPortalAccessAddedEmail,
  sendPortalInviteEmail,
} from "../_portalInviteShared.js";
import {
  ORDINARY_ACCESS_ROLES,
  PORTAL_ACCESS_ROLES,
  canActorChangePortalRole,
  canActorRevokePortalRole,
  membershipNeedsRequiredAdminRepair,
  membershipSummary,
  normalizePortalAccessRole,
  wouldRemoveLastOwner,
} from "../../api-lib/portalAdminAccess.js";

const ORDINARY_ACCESS_ONLY_ERROR =
  "Only existing org-level Viewer or Field access can be changed here.";
const MAX_ORG_NAME_LENGTH = 120;

function validateAccessRole(value) {
  const role = normalizePortalAccessRole(value, "viewer");
  return ORDINARY_ACCESS_ROLES.has(role) ? role : "";
}

function validateRoleChangeValue(value) {
  return normalizePortalAccessRole(value, "");
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
    emailConfirmedAt: authUserConfirmedAt(user),
    invitedAt: user.invited_at || null,
    confirmationSentAt: user.confirmation_sent_at || null,
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
  const orgIds = [...orgById.keys()];
  if (!orgIds.length) return [];

  let query = service
    .from("portal_invites")
    .select("id,org_id,email,role,access_scope,created_at,expires_at,accepted_at,revoked_at,revoked_reason")
    .in("org_id", orgIds)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  const { data, error } = await query;

  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }

  return (data || []).map((row) => pendingInviteSummary(row, orgById));
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

function actorRoleForOrg(context, orgId) {
  if (context.isPlatformAdmin) return "owner";
  const membership = (context.managementMemberships || []).find((row) => row.org_id === orgId);
  return membership?.role || "";
}

function manageableOrgIds(context) {
  return context.isPlatformAdmin
    ? null
    : [...new Set((context.managementMemberships || []).map((row) => row.org_id))];
}

async function activeOwnerCount(service, orgId) {
  const { count, error } = await service
    .from("org_memberships")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("role", "owner")
    .is("deleted_at", null)
    .or("access_scope.eq.org,access_scope.is.null");

  if (error) throw error;
  return count || 0;
}

function decorateAccessRowsForActor(rows, context) {
  const ownerCountsByOrg = new Map();
  for (const row of rows) {
    if (row.role !== "owner") continue;
    ownerCountsByOrg.set(row.orgId, (ownerCountsByOrg.get(row.orgId) || 0) + 1);
  }

  return rows.map((row) => {
    const actorRole = actorRoleForOrg(context, row.orgId);
    const isRequiredAdmin = isApprovedAdminEmail(row.email);
    const activeOwnerCountForOrg = ownerCountsByOrg.get(row.orgId) || 0;
    const canChooseRole = (role) =>
      canActorChangePortalRole({
        actorRole,
        currentRole: row.role,
        nextRole: role,
        isRequiredAdmin,
      }) &&
      !wouldRemoveLastOwner({
        currentRole: row.role,
        nextRole: role,
        activeOwnerCount: activeOwnerCountForOrg,
      }) &&
      (role !== "owner" || (row.accessScope || "org") === "org");
    const allowedRoleChanges = Array.from(PORTAL_ACCESS_ROLES).filter(canChooseRole);

    return {
      ...row,
      canChangeRole: allowedRoleChanges.some((role) => role !== row.role),
      allowedRoleChanges,
      canRevoke:
        canActorRevokePortalRole({
          actorRole,
          targetRole: row.role,
          isRequiredAdmin,
        }) &&
        !wouldRemoveLastOwner({
          currentRole: row.role,
          nextRole: "",
          activeOwnerCount: activeOwnerCountForOrg,
        }) &&
        (row.accessScope || "org") === "org",
    };
  });
}

async function loadPortalAccess(context) {
  const allowedOrgIds = manageableOrgIds(context);
  let orgQuery = context.service
    .from("orgs")
    .select("id,name")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (allowedOrgIds) {
    if (!allowedOrgIds.length) {
      return {
        adminEmails: [...adminEmailSet()].sort(),
        adminAccessSync: { repairedCount: 0, missingAdminEmails: [] },
        orgs: [],
        access: [],
        pendingInvites: [],
      };
    }
    orgQuery = orgQuery.in("id", allowedOrgIds);
  }

  const { data: orgRows, error: orgsError } = await orgQuery;

  if (orgsError) {
    throw new Error("Unable to load portal access.");
  }

  const adminAccessSync = context.isPlatformAdmin
    ? await ensureRequiredAdminOrgAccess(context.service, orgRows || [], null)
    : { repairedCount: 0, missingAdminEmails: [] };

  const orgIds = (orgRows || []).map((row) => row.id);
  let membershipQuery = context.service
    .from("org_memberships")
    .select("id,org_id,user_id,role,access_scope,created_at,updated_at,deleted_at")
    .in("org_id", orgIds)
    .is("deleted_at", null)
    .in("role", Array.from(PORTAL_ACCESS_ROLES))
    .or("access_scope.eq.org,access_scope.is.null")
    .order("created_at", { ascending: false });

  const { data: membershipRows, error: membershipsError } = orgIds.length
    ? await membershipQuery
    : { data: [], error: null };

  if (membershipsError) throw new Error("Unable to load portal access.");

  const userIds = [...new Set((membershipRows || []).map((row) => row.user_id))];
  const { data: profileRows, error: profilesError } = userIds.length
    ? await context.service
        .from("users_profile")
        .select("id,email,full_name,deleted_at")
        .in("id", userIds)
    : { data: [], error: null };

  if (profilesError) throw new Error("Unable to load portal users.");

  let authById = new Map();
  let authStatusAvailable = true;
  try {
    authById = userIds.length
      ? await loadAuthUsersById(context.service, userIds)
      : new Map();
  } catch {
    authStatusAvailable = false;
  }

  const orgById = new Map((orgRows || []).map((row) => [row.id, row]));
  const profileById = new Map((profileRows || []).map((row) => [row.id, row]));
  const accessRows = decorateAccessRowsForActor((membershipRows || []).map((row) =>
    membershipSummary(row, profileById, orgById, authById, authStatusAvailable)
  ), context);
  const pendingInvites = await loadPendingInvites(context.service, orgById);

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
    return sendJson(res, 200, await loadPortalAccess(context));
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

async function requireActorManagementRole(context, orgId) {
  const actorRole = actorRoleForOrg(context, orgId);
  if (!actorRole) {
    throw Object.assign(new Error("Owner or Manager access is required for this organization."), {
      status: 403,
    });
  }
  return actorRole;
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

async function findActiveMembershipWithProfile(service, { orgId, userId }) {
  const { data: membership, error: membershipError } = await service
    .from("org_memberships")
    .select("id,org_id,user_id,role,access_scope,created_at,updated_at,deleted_at")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) return { membership: null, profile: null };

  const { data: profile, error: profileError } = await service
    .from("users_profile")
    .select("id,email")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw profileError;

  return { membership, profile };
}

async function createPendingPortalInvite(
  service,
  { req, org, email, role, actorId, sendEmail = false, emailSender = sendPortalInviteEmail }
) {
  if (sendEmail && emailSender === sendPortalInviteEmail) assertInviteEmailConfigured();
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
      await emailSender({
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

async function revokePendingPortalInvites(service, { orgId, email, actorId, reason }) {
  const { error } = await service
    .from("portal_invites")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_reason: reason,
      updated_by: actorId,
    })
    .eq("org_id", orgId)
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);
  if (error) throw error;
}

export async function grantOrgAccess(req, res, context) {
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
      error: "Access type must be Viewer or Field.",
    });
  }
  if (isApprovedAdminEmail(email)) {
    return sendJson(res, 400, {
      error: "Invite User is for Viewer and Field access. Approved admin emails already receive owner access.",
    });
  }

  try {
    const org = await loadOrg(context.service, orgId);
    if (!org) return sendJson(res, 404, { error: "Organization not found." });
    await requireActorManagementRole(context, orgId);
    await ensureUserProfile(context.service, context.user, context.user.id);

    const user = await findAuthUserByEmail(context.service, email);
    const activeMembership = user?.id
      ? await findActiveOrgMembership(context.service, { orgId, userId: user.id })
      : null;
    const inviteAction = inviteAdminActionForUser(user, activeMembership);
    if (inviteAction === "already_active") {
      return sendJson(res, 200, {
        user: userSummary(user),
        invited: false,
        alreadyActive: true,
        org,
        membership: membershipResponse(activeMembership),
      });
    }
    if (inviteAction === "grant_existing_confirmed") {
      if (!context.sendAccessAddedEmail) assertInviteEmailConfigured();
      await ensureUserProfile(context.service, user, context.user.id);
      const membership = await upsertOrgMembership(context.service, {
        orgId,
        userId: user.id,
        role: requestedRole,
        actorId: context.user.id,
      });
      await revokePendingPortalInvites(context.service, {
        orgId,
        email,
        actorId: context.user.id,
        reason: "access_granted",
      });
      const accessEmailSender = context.sendAccessAddedEmail || sendPortalAccessAddedEmail;
      await accessEmailSender({
        email,
        org,
        role: requestedRole,
        reportsUrl: reportsUrl(req),
      });
      return sendJson(res, 200, {
        user: userSummary(user),
        invited: false,
        alreadyActive: false,
        accessGranted: true,
        notificationSent: true,
        org,
        membership: membershipResponse(membership),
      });
    }

    const { invite, setupUrl } = await createPendingPortalInvite(context.service, {
      req,
      org,
      email,
      role: requestedRole,
      actorId: context.user.id,
      sendEmail: true,
      emailSender: context.sendPortalInviteEmail || sendPortalInviteEmail,
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
        : error.status || 500;
    return sendJson(res, status, {
      error: error.message || "Unable to grant portal access.",
      code: error.code || undefined,
    });
  }
}

export async function grantExistingOrgAccess(req, res, context) {
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
      error: "Access type must be Viewer or Field.",
    });
  }

  try {
    const org = await loadOrg(context.service, orgId);
    if (!org) return sendJson(res, 404, { error: "Organization not found." });
    await requireActorManagementRole(context, orgId);

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
      : error.status || 500;
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
      error: "Access type must be Viewer or Field.",
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
    await requireActorManagementRole(context, orgId);

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
        : error.status || 500;
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
    if (!context.isPlatformAdmin) {
      return sendJson(res, 403, { error: "Platform admin access is required to create organizations." });
    }

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

async function changeOrgAccessRole(req, res, context) {
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const orgId = validateUuid(body.orgId);
  const userId = validateUuid(body.userId);
  const requestedRole = validateRoleChangeValue(body.accessRole);
  if (!orgId) return sendJson(res, 400, { error: "Valid org ID is required." });
  if (!userId) return sendJson(res, 400, { error: "Valid user ID is required." });
  if (!requestedRole) return sendJson(res, 400, { error: "Valid role is required." });

  try {
    const actorRole = await requireActorManagementRole(context, orgId);
    const { membership, profile } = await findActiveMembershipWithProfile(context.service, {
      orgId,
      userId,
    });
    if (!membership) {
      return sendJson(res, 404, { error: "Active org access not found." });
    }
    if (isApprovedAdminEmail(profile?.email)) {
      return sendJson(res, 400, { error: "Required admin owner access cannot be changed here." });
    }

    const currentRole = normalizePortalAccessRole(membership.role, "");
    const currentScope = membership.access_scope || "org";
    if (!currentRole || currentScope !== "org") {
      return sendJson(res, 400, {
        error: "Only org-wide portal access can be changed here.",
      });
    }

    const ownerCount = currentRole === "owner"
      ? await activeOwnerCount(context.service, orgId)
      : 0;
    if (
      wouldRemoveLastOwner({
        currentRole,
        nextRole: requestedRole,
        activeOwnerCount: ownerCount,
      })
    ) {
      return sendJson(res, 400, {
        error: "At least one active Owner must remain for this organization.",
      });
    }

    if (
      !canActorChangePortalRole({
        actorRole,
        currentRole,
        nextRole: requestedRole,
      })
    ) {
      return sendJson(res, 403, {
        error: "You do not have permission to change this role.",
      });
    }

    if (requestedRole === currentRole) {
      return sendJson(res, 200, {
        changed: false,
        membership: membershipResponse(membership),
      });
    }

    const { data: updatedMembership, error: updateError } = await context.service
      .from("org_memberships")
      .update({
        role: requestedRole,
        access_scope: "org",
        updated_by: context.user.id,
        deleted_at: null,
      })
      .eq("id", membership.id)
      .is("deleted_at", null)
      .select("id,org_id,user_id,role,access_scope,created_at,updated_at,deleted_at")
      .single();

    if (updateError) throw updateError;

    return sendJson(res, 200, {
      changed: true,
      membership: membershipResponse(updatedMembership),
    });
  } catch (error) {
    return sendJson(res, error.status || 500, {
      error: error.message || "Unable to change portal role.",
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
    const actorRole = await requireActorManagementRole(context, orgId);
    const { membership, profile } = await findActiveMembershipWithProfile(context.service, {
      orgId,
      userId,
    });
    if (isApprovedAdminEmail(profile?.email)) {
      return sendJson(res, 400, { error: "Required admin owner access cannot be revoked here." });
    }

    if (!membership) {
      return sendJson(res, 404, { error: "Active org access not found." });
    }

    const currentRole = normalizePortalAccessRole(membership.role, "");
    if (!currentRole || (membership.access_scope || "org") !== "org") {
      return sendJson(res, 400, {
        error: "Only org-wide portal access can be revoked here.",
      });
    }

    const ownerCount = currentRole === "owner"
      ? await activeOwnerCount(context.service, orgId)
      : 0;
    if (
      wouldRemoveLastOwner({
        currentRole,
        nextRole: "",
        activeOwnerCount: ownerCount,
      })
    ) {
      return sendJson(res, 400, {
        error: "At least one active Owner must remain for this organization.",
      });
    }

    if (
      !canActorRevokePortalRole({
        actorRole,
        targetRole: currentRole,
      })
    ) {
      return sendJson(res, 403, {
        error: "You do not have permission to revoke this access.",
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
    return sendJson(res, error.status || 500, {
      error: error.message || "Unable to revoke portal access.",
    });
  }
}

function isPortalInviteMode(req) {
  if (req.query?.mode === "portalInvite") return true;
  const host = req.headers.host || "localhost";
  const parsed = new URL(req.url || "/", `http://${host}`);
  return parsed.searchParams.get("mode") === "portalInvite";
}

function inviteDetailsResponse({ invite, org, publicState }) {
  return {
    state: publicState.state,
    accountMode: publicState.accountMode || null,
    email: normalizeEmail(invite?.email),
    org: org ? { id: org.id, name: org.name } : null,
    accessRole: invite?.role || null,
    accessLabel: invite?.role ? inviteRoleLabel(invite.role) : null,
    expiresAt: invite?.expires_at || null,
  };
}

async function handlePortalInviteGet(req, res, service) {
  try {
    const details = await loadInvitePublicDetails(service, getInviteToken(req));
    return sendJson(res, 200, inviteDetailsResponse(details));
  } catch (error) {
    return portalInviteErrorResponse(res, error);
  }
}

async function handlePortalInvitePost(req, res, service) {
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, {
      error: "Invalid JSON body.",
      code: "invalid_json",
    });
  }

  try {
    const token = String(body.token || getInviteToken(req) || "").trim();
    const details = await loadInvitePublicDetails(service, token);
    const { user, membership } = await activateInvite({
      service,
      req,
      invite: details.invite,
      org: details.org,
      password: body.password,
      actorId: details.invite?.created_by || null,
      upsertOrgMembership,
    });

    return sendJson(res, 200, {
      state: "accepted",
      user: {
        id: user.id,
        email: normalizeEmail(user.email),
      },
      org: {
        id: details.org.id,
        name: details.org.name,
      },
      membership: membershipResponse(membership),
    });
  } catch (error) {
    return portalInviteErrorResponse(res, error);
  }
}

async function handlePortalInvite(req, res) {
  if (req.method === "OPTIONS") {
    methodAllowed(req, res, ["GET", "POST", "OPTIONS"]);
    return;
  }
  if (!methodAllowed(req, res, ["GET", "POST", "OPTIONS"])) return;

  const service = createServiceClient();
  if (req.method === "GET") return handlePortalInviteGet(req, res, service);
  if (req.method === "POST") return handlePortalInvitePost(req, res, service);
}

export default async function handler(req, res) {
  if (isPortalInviteMode(req)) return handlePortalInvite(req, res);

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
    if (body.action === "changeRole") return changeOrgAccessRole(req, res, context);
    return grantOrgAccess(req, res, context);
  }
  if (req.method === "DELETE") return revokeOrgAccess(req, res, context);
}
