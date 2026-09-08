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
  isNormalPendingInvite,
  inviteUrl,
  loadInvitePublicDetails,
  portalInviteErrorResponse,
  portalInviteStatus,
  reportsUrl,
  sendPortalAccessAddedEmail,
  sendPortalInviteEmail,
} from "../_portalInviteShared.js";
import {
  PORTAL_ACCESS_ROLES,
  canActorCancelPendingInvite,
  canActorInvitePortalRole,
  canActorChangePortalRole,
  canActorRevokePortalRole,
  inviteRolesForActor,
  membershipNeedsRequiredAdminRepair,
  membershipSummary,
  normalizePortalAccessRole,
  wouldRemoveLastOwner,
} from "../../api-lib/portalAdminAccess.js";
import {
  ORG_ACCESS_SCOPE,
  PROPERTY_ACCESS_SCOPE,
  actorCanManagePropertyScope,
  normalizeAccessScope,
  normalizePropertyIds,
  propertyScopeSummary,
} from "../../api-lib/portalPropertyAccess.js";

const MAX_ORG_NAME_LENGTH = 120;

function validateAccessRole(value) {
  return normalizePortalAccessRole(value, "viewer");
}

function validateRoleChangeValue(value) {
  return normalizePortalAccessRole(value, "");
}

function validUuidSet(values) {
  return normalizePropertyIds(values).filter(validateUuid);
}

function invalidUuidValues(values) {
  return normalizePropertyIds(values).filter((value) => !validateUuid(value));
}

function normalizeRequestedAccessAssignment(body, role) {
  const accessScope = normalizeAccessScope(
    body.accessScope || body.access_scope || body.propertyScope,
    role
  );
  const propertyIds = accessScope === PROPERTY_ACCESS_SCOPE
    ? normalizePropertyIds(body.propertyIds || body.property_ids)
    : [];
  return {
    accessScope,
    propertyIds,
  };
}

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function forbidden(message) {
  return Object.assign(new Error(message), { status: 403 });
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
  const accessScope = normalizeAccessScope(row.access_scope, row.role);
  return {
    id: row.id,
    orgId: row.org_id,
    orgName: orgById.get(row.org_id)?.name || "Organization",
    email: normalizeEmail(row.email),
    role: row.role,
    accessScope,
    propertyIds: accessScope === PROPERTY_ACCESS_SCOPE ? normalizePropertyIds(row.propertyIds || row.property_ids) : [],
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    state: portalInviteStatus(row),
  };
}

function decoratePendingInvitesForActor(rows, context) {
  return rows.map((row) => {
    const actorMembership = actorMembershipForOrg(context, row.orgId);
    const actorRole = actorMembership?.role || "";
    return {
      ...row,
      canCancel: canActorCancelPendingInvite({
        actorRole,
        inviteRole: normalizePortalAccessRole(row.role, ""),
      }) &&
        actorCanManagePropertyScope({
          actorRole,
          actorAccessScope: actorMembership?.access_scope,
          actorPropertyIds: actorMembership?.propertyIds,
          targetRole: row.role,
          targetAccessScope: row.accessScope,
          targetPropertyIds: row.propertyIds,
        }),
    };
  });
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

  return (data || [])
    .filter(isNormalPendingInvite)
    .map((row) => pendingInviteSummary(row, orgById));
}

async function loadOrgProperties(service, orgIds) {
  if (!orgIds.length) return [];
  const { data, error } = await service
    .from("properties")
    .select("id,org_id,name,address_line1,city,state,postal_code")
    .in("org_id", orgIds)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function loadPropertyGrantsByOrgUser(service, orgIds, userIds) {
  if (!orgIds.length || !userIds.length) return new Map();
  const { data, error } = await service
    .from("property_access_grants")
    .select("org_id,user_id,property_id,deleted_at")
    .in("org_id", orgIds)
    .in("user_id", userIds)
    .is("deleted_at", null);

  if (error) throw error;
  const byOrgUser = new Map();
  for (const row of data || []) {
    const key = `${row.org_id}:${row.user_id}`;
    const ids = byOrgUser.get(key) || [];
    ids.push(row.property_id);
    byOrgUser.set(key, ids);
  }
  return byOrgUser;
}

async function loadActivePropertyGrantIds(service, { orgId, userId }) {
  const { data, error } = await service
    .from("property_access_grants")
    .select("property_id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (error) throw error;
  return normalizePropertyIds((data || []).map((row) => row.property_id));
}

async function loadInvitePropertyGrantsByInviteId(service, inviteIds) {
  if (!inviteIds.length) return new Map();
  const { data, error } = await service
    .from("portal_invite_property_grants")
    .select("invite_id,property_id")
    .in("invite_id", inviteIds);

  if (error) {
    if (error.code === "42P01") return new Map();
    throw error;
  }

  const byInviteId = new Map();
  for (const row of data || []) {
    const ids = byInviteId.get(row.invite_id) || [];
    ids.push(row.property_id);
    byInviteId.set(row.invite_id, ids);
  }
  return byInviteId;
}

function publicProperty(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    addressLine1: row.address_line1 || "",
    city: row.city || "",
    state: row.state || "",
    postalCode: row.postal_code || "",
  };
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

function actorMembershipForOrg(context, orgId) {
  if (context.isPlatformAdmin) {
    return {
      role: "owner",
      access_scope: ORG_ACCESS_SCOPE,
      propertyIds: [],
    };
  }
  return (context.managementMemberships || []).find((row) => row.org_id === orgId) || null;
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
    const actorMembership = actorMembershipForOrg(context, row.orgId);
    const actorRole = actorMembership?.role || "";
    const isRequiredAdmin = isApprovedAdminEmail(row.email);
    const activeOwnerCountForOrg = ownerCountsByOrg.get(row.orgId) || 0;
    const canManageCurrentScope = actorCanManagePropertyScope({
      actorRole,
      actorAccessScope: actorMembership?.access_scope,
      actorPropertyIds: actorMembership?.propertyIds,
      targetRole: row.role,
      targetAccessScope: row.accessScope,
      targetPropertyIds: row.propertyIds,
    });
    const canSetOrgScope = actorCanManagePropertyScope({
      actorRole,
      actorAccessScope: actorMembership?.access_scope,
      actorPropertyIds: actorMembership?.propertyIds,
      targetRole: row.role,
      targetAccessScope: ORG_ACCESS_SCOPE,
      targetPropertyIds: [],
    });
    const canSetPropertyScope = actorRole === "owner" || actorRole === "manager";
    const allowedAccessScopes = row.role === "owner" || isRequiredAdmin || !canManageCurrentScope
      ? []
      : [
          ...(canSetOrgScope ? [ORG_ACCESS_SCOPE] : []),
          ...(canSetPropertyScope ? [PROPERTY_ACCESS_SCOPE] : []),
        ];
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
      (role !== "owner" || (row.accessScope || "org") === "org") &&
      actorCanManagePropertyScope({
        actorRole,
        actorAccessScope: actorMembership?.access_scope,
        actorPropertyIds: actorMembership?.propertyIds,
        targetRole: role,
        targetAccessScope: role === "owner" ? ORG_ACCESS_SCOPE : row.accessScope,
        targetPropertyIds: row.propertyIds,
      });
    const allowedRoleChanges = Array.from(PORTAL_ACCESS_ROLES).filter(canChooseRole);

    return {
      ...row,
      canChangeRole: allowedRoleChanges.some((role) => role !== row.role),
      allowedRoleChanges,
      canChangeScope: allowedAccessScopes.length > 0,
      allowedAccessScopes,
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
        canManageCurrentScope,
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

  const propertyRows = await loadOrgProperties(context.service, orgIds);
  const propertiesByOrgId = new Map();
  const propertyById = new Map();
  for (const property of propertyRows) {
    const publicRow = publicProperty(property);
    propertyById.set(property.id, publicRow);
    const rows = propertiesByOrgId.get(property.org_id) || [];
    rows.push(publicRow);
    propertiesByOrgId.set(property.org_id, rows);
  }

  const propertyGrantsByOrgUser = await loadPropertyGrantsByOrgUser(
    context.service,
    orgIds,
    userIds
  );
  const orgById = new Map((orgRows || []).map((row) => [row.id, row]));
  const profileById = new Map((profileRows || []).map((row) => [row.id, row]));
  const accessRows = decorateAccessRowsForActor(
    (membershipRows || []).map((row) => {
      const propertyIds =
        normalizeAccessScope(row.access_scope, row.role) === PROPERTY_ACCESS_SCOPE
          ? normalizePropertyIds(propertyGrantsByOrgUser.get(`${row.org_id}:${row.user_id}`) || [])
          : [];
      return {
        ...membershipSummary(row, profileById, orgById, authById, authStatusAvailable),
        accessScope: normalizeAccessScope(row.access_scope, row.role),
        propertyIds,
        propertySummary: propertyScopeSummary({
          accessScope: normalizeAccessScope(row.access_scope, row.role),
          propertyIds,
          propertyById,
        }),
      };
    }),
    context
  );
  const pendingInvites = await loadPendingInvites(context.service, orgById);
  const invitePropertyGrantsByInviteId = await loadInvitePropertyGrantsByInviteId(
    context.service,
    pendingInvites.map((invite) => invite.id)
  );
  const pendingInvitesWithProperties = decoratePendingInvitesForActor(pendingInvites.map((invite) => {
    const propertyIds =
      invite.accessScope === PROPERTY_ACCESS_SCOPE
        ? normalizePropertyIds(invitePropertyGrantsByInviteId.get(invite.id) || [])
        : [];
    return {
      ...invite,
      propertyIds,
      propertySummary: propertyScopeSummary({
        accessScope: invite.accessScope,
        propertyIds,
        propertyById,
      }),
    };
  }), context);

  return {
    adminEmails: [...adminEmailSet()].sort(),
    adminAccessSync,
    orgs: (orgRows || []).map((row) => {
      const actorMembership = actorMembershipForOrg(context, row.id);
      const actorRole = actorMembership?.role || "";
      let properties = propertiesByOrgId.get(row.id) || [];
      if (
        actorRole === "manager" &&
        normalizeAccessScope(actorMembership?.access_scope, actorRole) === PROPERTY_ACCESS_SCOPE
      ) {
        const allowedPropertyIds = new Set(normalizePropertyIds(actorMembership?.propertyIds));
        properties = properties.filter((property) => allowedPropertyIds.has(property.id));
      }
      return {
        id: row.id,
        name: row.name,
        actorRole,
        inviteRoles: inviteRolesForActor(actorRole),
        properties,
      };
    }),
    access: accessRows,
    pendingInvites: pendingInvitesWithProperties,
  };
}

async function handleGet(req, res, context) {
  try {
    return sendJson(res, 200, await loadPortalAccess(context));
  } catch {
    return sendJson(res, 500, { error: "Unable to load portal access." });
  }
}

async function syncPropertyAccessGrants(service, { orgId, userId, propertyIds, actorId }) {
  const nextIds = new Set(validUuidSet(propertyIds));
  const { data: existingRows, error: existingError } = await service
    .from("property_access_grants")
    .select("id,property_id,deleted_at")
    .eq("org_id", orgId)
    .eq("user_id", userId);

  if (existingError) throw existingError;

  const existingActive = new Map(
    (existingRows || [])
      .filter((row) => !row.deleted_at)
      .map((row) => [row.property_id, row])
  );
  const toRevoke = [...existingActive.keys()].filter((propertyId) => !nextIds.has(propertyId));
  if (toRevoke.length) {
    const { error } = await service
      .from("property_access_grants")
      .update({ deleted_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .in("property_id", toRevoke)
      .is("deleted_at", null);
    if (error) throw error;
  }

  const toInsert = [...nextIds].filter((propertyId) => !existingActive.has(propertyId));
  if (toInsert.length) {
    const { error } = await service
      .from("property_access_grants")
      .insert(
        toInsert.map((propertyId) => ({
          org_id: orgId,
          user_id: userId,
          property_id: propertyId,
          granted_by: actorId,
          deleted_at: null,
        }))
      );
    if (error) throw error;
  }
}

export async function upsertOrgMembership(
  service,
  { orgId, userId, role, actorId, accessScope = ORG_ACCESS_SCOPE, propertyIds = [] }
) {
  const normalizedScope = normalizeAccessScope(accessScope, role);
  const { data: existingMembership, error: existingMembershipError } =
    await service
      .from("org_memberships")
      .select("id,role,access_scope,deleted_at")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();

  if (existingMembershipError) throw existingMembershipError;
  const { data: membership, error: membershipError } = await service
    .from("org_memberships")
    .upsert(
      {
        org_id: orgId,
        user_id: userId,
        role,
        access_scope: normalizedScope,
        updated_by: actorId,
        deleted_at: null,
      },
      { onConflict: "org_id,user_id" }
    )
    .select("id,org_id,user_id,role,access_scope,created_at,updated_at,deleted_at")
    .single();

  if (membershipError) throw membershipError;
  await syncPropertyAccessGrants(service, {
    orgId,
    userId,
    propertyIds: normalizedScope === PROPERTY_ACCESS_SCOPE ? propertyIds : [],
    actorId,
  });
  return membership;
}

export function membershipResponse(membership) {
  return {
    id: membership.id,
    orgId: membership.org_id,
    userId: membership.user_id,
    role: membership.role,
    accessScope: membership.access_scope || "org",
    propertyIds: membership.propertyIds || [],
    propertySummary: membership.propertySummary || null,
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
  if (!data) return null;
  data.propertyIds = normalizeAccessScope(data.access_scope, data.role) === PROPERTY_ACCESS_SCOPE
    ? await loadActivePropertyGrantIds(service, { orgId, userId })
    : [];
  return data;
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
  membership.propertyIds =
    normalizeAccessScope(membership.access_scope, membership.role) === PROPERTY_ACCESS_SCOPE
      ? await loadActivePropertyGrantIds(service, { orgId, userId })
      : [];

  const { data: profile, error: profileError } = await service
    .from("users_profile")
    .select("id,email")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw profileError;

  return { membership, profile };
}

async function assertPropertiesBelongToOrg(service, { orgId, propertyIds }) {
  const ids = validUuidSet(propertyIds);
  if (!ids.length) return [];

  const { data, error } = await service
    .from("properties")
    .select("id")
    .eq("org_id", orgId)
    .in("id", ids)
    .is("deleted_at", null);

  if (error) throw error;
  const foundIds = new Set((data || []).map((row) => row.id));
  const missingIds = ids.filter((propertyId) => !foundIds.has(propertyId));
  if (missingIds.length) {
    throw badRequest("Selected properties must belong to this organization.");
  }
  return ids;
}

async function resolveAccessAssignment(service, { orgId, role, body }) {
  const requested = normalizeRequestedAccessAssignment(body, role);
  if (role === "owner") {
    return { accessScope: ORG_ACCESS_SCOPE, propertyIds: [] };
  }

  if (requested.accessScope !== PROPERTY_ACCESS_SCOPE) {
    return { accessScope: ORG_ACCESS_SCOPE, propertyIds: [] };
  }

  if (invalidUuidValues(requested.propertyIds).length) {
    throw badRequest("Selected properties must be valid property IDs.");
  }
  if (!requested.propertyIds.length) {
    throw badRequest("Select at least one property or choose all properties.");
  }

  return {
    accessScope: PROPERTY_ACCESS_SCOPE,
    propertyIds: await assertPropertiesBelongToOrg(service, {
      orgId,
      propertyIds: requested.propertyIds,
    }),
  };
}

async function assertActorCanAssignRole(
  service,
  context,
  { orgId, targetRole, targetAccessScope = ORG_ACCESS_SCOPE, targetPropertyIds = [], existingMembership, email }
) {
  const actorMembership = actorMembershipForOrg(context, orgId);
  const actorRole = await requireActorManagementRole(context, orgId);
  const existingRole = normalizePortalAccessRole(existingMembership?.role, "");
  const existingScope = normalizeAccessScope(existingMembership?.access_scope, existingRole);

  if (isApprovedAdminEmail(email)) {
    throw badRequest("Required admin owner access is managed automatically.");
  }

  if (!canActorInvitePortalRole({ actorRole, targetRole })) {
    throw forbidden("You do not have permission to grant this role.");
  }

  if (
    !actorCanManagePropertyScope({
      actorRole,
      actorAccessScope: actorMembership?.access_scope,
      actorPropertyIds: actorMembership?.propertyIds,
      targetRole,
      targetAccessScope,
      targetPropertyIds,
    })
  ) {
    throw forbidden("You do not have permission to grant access for this property scope.");
  }

  if (!existingMembership) return;
  if (!existingRole) {
    throw badRequest("Only portal access can be changed here.");
  }
  if (!canActorChangePortalRole({ actorRole, currentRole: existingRole, nextRole: targetRole })) {
    throw forbidden("You do not have permission to change this role.");
  }
  if (
    !actorCanManagePropertyScope({
      actorRole,
      actorAccessScope: actorMembership?.access_scope,
      actorPropertyIds: actorMembership?.propertyIds,
      targetRole: existingRole,
      targetAccessScope: existingScope,
      targetPropertyIds: existingMembership.propertyIds,
    })
  ) {
    throw forbidden("You do not have permission to change this user's current property scope.");
  }
  if (existingRole === targetRole) return;
  if (
    wouldRemoveLastOwner({
      currentRole: existingRole,
      nextRole: targetRole,
      activeOwnerCount: await activeOwnerCount(service, orgId),
    })
  ) {
    throw badRequest("At least one active Owner must remain for this organization.");
  }
}

async function createPendingPortalInvite(
  service,
  {
    req,
    org,
    email,
    role,
    accessScope = ORG_ACCESS_SCOPE,
    propertyIds = [],
    actorId,
    sendEmail = false,
    emailSender = sendPortalInviteEmail,
  }
) {
  if (sendEmail && emailSender === sendPortalInviteEmail) assertInviteEmailConfigured();
  const token = createInviteToken();
  const now = new Date().toISOString();
  const setupUrl = inviteUrl(req, token);
  const normalizedScope = normalizeAccessScope(accessScope, role);
  const normalizedPropertyIds = normalizedScope === PROPERTY_ACCESS_SCOPE
    ? normalizePropertyIds(propertyIds)
    : [];

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
      access_scope: normalizedScope,
      token_hash: hashInviteToken(token),
      created_by: actorId,
      updated_by: actorId,
      last_sent_at: now,
      expires_at: inviteExpiresAt(),
    })
    .select("id,org_id,email,role,access_scope,created_at,expires_at,accepted_at,revoked_at,revoked_reason")
    .single();
  if (insertError) throw insertError;

  if (normalizedPropertyIds.length) {
    const { error: grantError } = await service
      .from("portal_invite_property_grants")
      .insert(
        normalizedPropertyIds.map((propertyId) => ({
          invite_id: invite.id,
          org_id: org.id,
          property_id: propertyId,
        }))
      );
    if (grantError) throw grantError;
  }

  invite.propertyIds = normalizedPropertyIds;

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
      error: "Valid role is required.",
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
    const assignment = await resolveAccessAssignment(context.service, {
      orgId,
      role: requestedRole,
      body,
    });
    await assertActorCanAssignRole(context.service, context, {
      orgId,
      targetRole: requestedRole,
      targetAccessScope: assignment.accessScope,
      targetPropertyIds: assignment.propertyIds,
      existingMembership: activeMembership,
      email,
    });
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
        accessScope: assignment.accessScope,
        propertyIds: assignment.propertyIds,
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
      accessScope: assignment.accessScope,
      propertyIds: assignment.propertyIds,
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
      error: "Valid role is required.",
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

    const actorRole = await requireActorManagementRole(context, orgId);
    const role = isApprovedAdminEmail(email) ? "owner" : requestedRole;
    const activeMembership = await findActiveOrgMembership(context.service, { orgId, userId: user.id });
    const assignment = await resolveAccessAssignment(context.service, {
      orgId,
      role,
      body,
    });
    if (!isApprovedAdminEmail(email)) {
      await assertActorCanAssignRole(context.service, context, {
        orgId,
        targetRole: role,
        targetAccessScope: assignment.accessScope,
        targetPropertyIds: assignment.propertyIds,
        existingMembership: activeMembership,
        email,
      });
    } else if (actorRole !== "owner") {
      return sendJson(res, 403, {
        error: "Only Owners can grant required admin owner access.",
      });
    }
    const membership = await upsertOrgMembership(context.service, {
      orgId,
      userId: user.id,
      role,
      accessScope: assignment.accessScope,
      propertyIds: assignment.propertyIds,
      actorId: context.user.id,
    });

    return sendJson(res, 200, {
      user: userSummary(user),
      invited: false,
      org,
      membership: membershipResponse(membership),
    });
  } catch (error) {
    const status = error.status || 500;
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
      error: "Valid role is required.",
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
    const assignment = await resolveAccessAssignment(context.service, {
      orgId,
      role: requestedRole,
      body,
    });
    await assertActorCanAssignRole(context.service, context, {
      orgId,
      targetRole: requestedRole,
      targetAccessScope: assignment.accessScope,
      targetPropertyIds: assignment.propertyIds,
      existingMembership: null,
      email,
    });

    await ensureUserProfile(context.service, context.user, context.user.id);
    const { invite, setupUrl } = await createPendingPortalInvite(context.service, {
      req,
      org,
      email,
      role: requestedRole,
      accessScope: assignment.accessScope,
      propertyIds: assignment.propertyIds,
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
      : error.status || 500;
    return sendJson(res, status, {
      error: error.message || "Unable to create setup link.",
      code: error.code || undefined,
    });
  }
}

async function cancelPendingInvite(req, res, context) {
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const inviteId = validateUuid(body.inviteId);
  if (!inviteId) return sendJson(res, 400, { error: "Valid invite ID is required." });

  try {
    const { data: invite, error: inviteError } = await context.service
      .from("portal_invites")
      .select("id,org_id,email,role,access_scope,created_at,expires_at,accepted_at,revoked_at,revoked_reason")
      .eq("id", inviteId)
      .maybeSingle();

    if (inviteError) {
      if (inviteError.code === "42P01") {
        return sendJson(res, 404, { error: "Pending invite not found." });
      }
      throw inviteError;
    }
    if (!invite) return sendJson(res, 404, { error: "Pending invite not found." });
    if (invite.accepted_at) {
      return sendJson(res, 409, { error: "This invite has already been accepted." });
    }
    if (invite.revoked_at) {
      return sendJson(res, 200, {
        canceled: false,
        alreadyCanceled: true,
        invite: pendingInviteSummary(invite, new Map()),
      });
    }

    const invitePropertyIds =
      normalizeAccessScope(invite.access_scope, invite.role) === PROPERTY_ACCESS_SCOPE
        ? normalizePropertyIds(
            (await loadInvitePropertyGrantsByInviteId(context.service, [invite.id])).get(invite.id) || []
          )
        : [];
    const actorMembership = actorMembershipForOrg(context, invite.org_id);
    const actorRole = await requireActorManagementRole(context, invite.org_id);
    if (
      !canActorCancelPendingInvite({
        actorRole,
        inviteRole: normalizePortalAccessRole(invite.role, ""),
      }) ||
      !actorCanManagePropertyScope({
        actorRole,
        actorAccessScope: actorMembership?.access_scope,
        actorPropertyIds: actorMembership?.propertyIds,
        targetRole: invite.role,
        targetAccessScope: invite.access_scope,
        targetPropertyIds: invitePropertyIds,
      })
    ) {
      return sendJson(res, 403, {
        error: "You do not have permission to cancel this invite.",
      });
    }

    const canceledAt = new Date().toISOString();
    const { data: canceledInvite, error: cancelError } = await context.service
      .from("portal_invites")
      .update({
        revoked_at: canceledAt,
        revoked_reason: "canceled",
        updated_by: context.user.id,
      })
      .eq("id", invite.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .select("id,org_id,email,role,access_scope,created_at,expires_at,accepted_at,revoked_at,revoked_reason")
      .maybeSingle();

    if (cancelError) throw cancelError;
    if (!canceledInvite) {
      return sendJson(res, 409, { error: "This invite is no longer pending." });
    }

    return sendJson(res, 200, {
      canceled: true,
      invite: pendingInviteSummary(canceledInvite, new Map()),
    });
  } catch (error) {
    return sendJson(res, error.status || 500, {
      error: error.message || "Unable to cancel invite.",
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
    const actorMembership = actorMembershipForOrg(context, orgId);
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
    const currentScope = normalizeAccessScope(membership.access_scope, currentRole);
    if (!currentRole) {
      return sendJson(res, 400, {
        error: "Only portal access can be changed here.",
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
      }) ||
      !actorCanManagePropertyScope({
        actorRole,
        actorAccessScope: actorMembership?.access_scope,
        actorPropertyIds: actorMembership?.propertyIds,
        targetRole: currentRole,
        targetAccessScope: currentScope,
        targetPropertyIds: membership.propertyIds,
      }) ||
      !actorCanManagePropertyScope({
        actorRole,
        actorAccessScope: actorMembership?.access_scope,
        actorPropertyIds: actorMembership?.propertyIds,
        targetRole: requestedRole,
        targetAccessScope: requestedRole === "owner" ? ORG_ACCESS_SCOPE : currentScope,
        targetPropertyIds: requestedRole === "owner" ? [] : membership.propertyIds,
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

    const updatedMembership = await upsertOrgMembership(context.service, {
      orgId,
      userId,
      role: requestedRole,
      accessScope: requestedRole === "owner" ? ORG_ACCESS_SCOPE : currentScope,
      propertyIds: requestedRole === "owner" ? [] : membership.propertyIds,
      actorId: context.user.id,
    });
    updatedMembership.propertyIds = requestedRole === "owner" ? [] : membership.propertyIds;

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

async function changeOrgAccessScope(req, res, context) {
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
    const actorMembership = actorMembershipForOrg(context, orgId);
    const { membership, profile } = await findActiveMembershipWithProfile(context.service, {
      orgId,
      userId,
    });
    if (!membership) {
      return sendJson(res, 404, { error: "Active org access not found." });
    }
    if (isApprovedAdminEmail(profile?.email)) {
      return sendJson(res, 400, { error: "Required admin owner access cannot be scoped here." });
    }

    const currentRole = normalizePortalAccessRole(membership.role, "");
    if (!currentRole) {
      return sendJson(res, 400, { error: "Only portal access can be scoped here." });
    }
    if (currentRole === "owner") {
      return sendJson(res, 400, { error: "Owner access must remain org-wide." });
    }

    const assignment = await resolveAccessAssignment(context.service, {
      orgId,
      role: currentRole,
      body,
    });

    const canManageCurrent = actorCanManagePropertyScope({
      actorRole,
      actorAccessScope: actorMembership?.access_scope,
      actorPropertyIds: actorMembership?.propertyIds,
      targetRole: currentRole,
      targetAccessScope: membership.access_scope,
      targetPropertyIds: membership.propertyIds,
    });
    const canManageNext = actorCanManagePropertyScope({
      actorRole,
      actorAccessScope: actorMembership?.access_scope,
      actorPropertyIds: actorMembership?.propertyIds,
      targetRole: currentRole,
      targetAccessScope: assignment.accessScope,
      targetPropertyIds: assignment.propertyIds,
    });
    if (!canManageCurrent || !canManageNext) {
      return sendJson(res, 403, {
        error: "You do not have permission to change this property scope.",
      });
    }

    const updatedMembership = await upsertOrgMembership(context.service, {
      orgId,
      userId,
      role: currentRole,
      accessScope: assignment.accessScope,
      propertyIds: assignment.propertyIds,
      actorId: context.user.id,
    });
    updatedMembership.propertyIds = assignment.propertyIds;

    return sendJson(res, 200, {
      changed: true,
      membership: membershipResponse(updatedMembership),
    });
  } catch (error) {
    return sendJson(res, error.status || 500, {
      error: error.message || "Unable to change property scope.",
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
    const actorMembership = actorMembershipForOrg(context, orgId);
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
    if (!currentRole) {
      return sendJson(res, 400, {
        error: "Only portal access can be revoked here.",
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
      }) ||
      !actorCanManagePropertyScope({
        actorRole,
        actorAccessScope: actorMembership?.access_scope,
        actorPropertyIds: actorMembership?.propertyIds,
        targetRole: currentRole,
        targetAccessScope: membership.access_scope,
        targetPropertyIds: membership.propertyIds,
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
    if (body.action === "changeScope") return changeOrgAccessScope(req, res, context);
    if (body.action === "cancelInvite") return cancelPendingInvite(req, res, context);
    return grantOrgAccess(req, res, context);
  }
  if (req.method === "DELETE") return revokeOrgAccess(req, res, context);
}
