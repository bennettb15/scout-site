export const ORG_ACCESS_SCOPE = "org";
export const PROPERTY_ACCESS_SCOPE = "property";

export function normalizeAccessScope(value, role = "") {
  if (role === "owner") return ORG_ACCESS_SCOPE;
  return String(value || "").trim().toLowerCase() === PROPERTY_ACCESS_SCOPE
    ? PROPERTY_ACCESS_SCOPE
    : ORG_ACCESS_SCOPE;
}

export function normalizePropertyIds(values) {
  const list = Array.isArray(values) ? values : [];
  return [...new Set(list.map((value) => String(value || "").trim()).filter(Boolean))];
}

export function portalAccessAllowsProperty({ role, accessScope, propertyIds } = {}, propertyId) {
  if (!propertyId) return false;
  if (role === "owner") return true;
  if (normalizeAccessScope(accessScope, role) === ORG_ACCESS_SCOPE) return true;
  return new Set(normalizePropertyIds(propertyIds)).has(String(propertyId));
}

export function actorCanManagePropertyScope({
  actorRole,
  actorAccessScope,
  actorPropertyIds,
  targetRole,
  targetAccessScope,
  targetPropertyIds,
}) {
  if (actorRole === "owner") return true;
  if (actorRole !== "manager" || targetRole === "owner") return false;
  const actorScope = normalizeAccessScope(actorAccessScope, actorRole);
  const targetScope = normalizeAccessScope(targetAccessScope, targetRole);
  if (actorScope === ORG_ACCESS_SCOPE) return true;
  if (targetScope !== PROPERTY_ACCESS_SCOPE) return false;

  const actorAllowed = new Set(normalizePropertyIds(actorPropertyIds));
  const targetIds = normalizePropertyIds(targetPropertyIds);
  return targetIds.length > 0 && targetIds.every((id) => actorAllowed.has(id));
}

export function visiblePropertyIdsForAccess(accessRows, orgId) {
  const ids = new Set();
  let allProperties = false;
  for (const row of accessRows || []) {
    if (row.org_id !== orgId && row.orgId !== orgId) continue;
    const role = row.role;
    const accessScope = row.access_scope || row.accessScope;
    if (role === "owner" || normalizeAccessScope(accessScope, role) === ORG_ACCESS_SCOPE) {
      allProperties = true;
      continue;
    }
    for (const propertyId of normalizePropertyIds(row.propertyIds || row.property_ids)) {
      ids.add(propertyId);
    }
  }
  return allProperties ? null : ids;
}

export function propertyScopeSummary({ accessScope, propertyIds, propertyById } = {}) {
  const ids = normalizePropertyIds(propertyIds);
  if (normalizeAccessScope(accessScope) === ORG_ACCESS_SCOPE) return "All properties";
  if (!ids.length) return "No properties selected";
  if (ids.length === 1) return propertyById?.get(ids[0])?.name || "1 property";
  return `${ids.length} properties`;
}

export function filterRowsByPortalPropertyAccess(rows, accessRows) {
  return (rows || []).filter((row) =>
    (accessRows || []).some((access) =>
      (access.org_id || access.orgId) === row.org_id &&
      portalAccessAllowsProperty(
        {
          role: access.role,
          accessScope: access.access_scope || access.accessScope,
          propertyIds: access.propertyIds || access.property_ids,
        },
        row.property_id
      )
    )
  );
}

export function filterRowsByCurrentPortalPropertyAccess(rows, accessRows, currentPropertyIds) {
  const currentIds = currentPropertyIds instanceof Set
    ? currentPropertyIds
    : new Set(normalizePropertyIds(currentPropertyIds));
  return filterRowsByPortalPropertyAccess(rows, accessRows).filter((row) =>
    currentIds.has(String(row.property_id || ""))
  );
}
