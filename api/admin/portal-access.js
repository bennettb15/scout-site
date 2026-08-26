import {
  adminEmailSet,
  findAuthUserByEmail,
  inviteRedirectTo,
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

const ORDINARY_ACCESS_ROLES = new Set(["viewer", "field"]);
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

function membershipSummary(row, profileById, orgById, authById, authStatusAvailable) {
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

async function loadPortalAccess(service) {
  const [
    { data: orgRows, error: orgsError },
    { data: membershipRows, error: membershipsError },
  ] = await Promise.all([
    service
      .from("orgs")
      .select("id,name")
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    service
      .from("org_memberships")
      .select("id,org_id,user_id,role,access_scope,created_at,updated_at,deleted_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  if (orgsError || membershipsError) {
    throw new Error("Unable to load portal access.");
  }

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

  return {
    adminEmails: [...adminEmailSet()].sort(),
    orgs: (orgRows || []).map((row) => ({
      id: row.id,
      name: row.name,
    })),
    access: accessRows,
  };
}

async function handleGet(req, res, context) {
  try {
    return sendJson(res, 200, await loadPortalAccess(context.service));
  } catch {
    return sendJson(res, 500, { error: "Unable to load portal access." });
  }
}

async function ensureInvitedUser(service, email, req) {
  const existing = await findAuthUserByEmail(service, email);
  if (existing) {
    return { user: existing, invited: false };
  }

  const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: inviteRedirectTo(req),
  });
  if (error) throw error;
  if (!data?.user?.id) {
    throw new Error("Supabase did not return an invited user.");
  }
  return { user: data.user, invited: true };
}

async function generateSetupLinkUser(service, email, req) {
  const existing = await findAuthUserByEmail(service, email);
  const redirectTo = existing
    ? inviteRedirectTo(req).replace(/\/accept-invite$/, "/reset-password")
    : inviteRedirectTo(req);
  const { data, error } = await service.auth.admin.generateLink({
    type: existing ? "recovery" : "invite",
    email,
    options: {
      redirectTo,
    },
  });

  if (error) throw error;
  if (!data?.user?.id || !data?.properties?.action_link) {
    throw new Error("Supabase did not return a setup link.");
  }

  return {
    user: data.user,
    setupUrl: data.properties.action_link,
    setupPath: existing ? "/reset-password" : "/accept-invite",
    setupType: existing ? "recovery" : "invite",
  };
}

async function upsertOrgMembership(service, { orgId, userId, role, actorId }) {
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

function membershipResponse(membership) {
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

  try {
    const org = await loadOrg(context.service, orgId);
    if (!org) return sendJson(res, 404, { error: "Organization not found." });

    const { user, invited } = await ensureInvitedUser(context.service, email, req);
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
      invited,
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

    const { user, setupUrl, setupPath, setupType } = await generateSetupLinkUser(
      context.service,
      email,
      req
    );
    await ensureUserProfile(context.service, user, context.user.id);

    const membership = await upsertOrgMembership(context.service, {
      orgId,
      userId: user.id,
      role: requestedRole,
      actorId: context.user.id,
    });

    return sendJson(res, 200, {
      user: userSummary(user),
      org,
      membership: membershipResponse(membership),
      setupUrl,
      setupPath,
      setupType,
    });
  } catch (error) {
    const status = error.message === ORDINARY_ACCESS_ONLY_ERROR
      ? 400
      : 500;
    return sendJson(res, status, {
      error: error.message || "Unable to create setup link.",
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
