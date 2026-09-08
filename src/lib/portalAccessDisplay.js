export function normalizeDisplayText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function formatPortalPropertyLocation(property = {}) {
  const address = normalizeDisplayText(
    property.addressLine1 || property.address_line1 || property.address
  );
  const city = normalizeDisplayText(property.city);
  const state = normalizeDisplayText(property.state);
  const postalCode = normalizeDisplayText(property.postalCode || property.postal_code);
  const cityState = [city, state].filter(Boolean).join(", ");
  const cityStatePostal = [cityState, postalCode].filter(Boolean).join(" ");
  return [address, cityStatePostal].filter(Boolean).join(", ");
}

export function formatPortalPropertyLabel(property = {}) {
  const name = normalizeDisplayText(property.name);
  const location = formatPortalPropertyLocation(property);
  if (name && location) return `${name} - ${location}`;
  return name || location || "Unnamed property";
}

export function portalPropertyScopeDisplay({
  accessScope = "org",
  propertyIds = [],
  role = "",
  properties = [],
  propertySummary = "",
} = {}) {
  const scope = role === "owner" || accessScope !== "property" ? "org" : "property";
  if (scope === "org") {
    return {
      mainText: "All properties",
      subText: role === "owner" ? "Owner access is org-wide" : "Org-wide scope",
    };
  }

  const ids = normalizePropertyIds(propertyIds, properties);
  const propertyById = new Map((properties || []).map((property) => [property.id, property]));
  if (ids.length === 1) {
    return {
      mainText: "Selected properties",
      subText: `1 selected: ${formatPortalPropertyLabel(propertyById.get(ids[0]) || {})}`,
    };
  }
  if (ids.length > 1) {
    return {
      mainText: "Selected properties",
      subText: `${ids.length} selected`,
    };
  }
  return {
    mainText: "Selected properties",
    subText: normalizeDisplayText(propertySummary) || "No properties selected",
  };
}

export function normalizePropertyIds(values, properties = []) {
  const allowedIds = new Set((properties || []).map((property) => property.id).filter(Boolean));
  const ids = Array.isArray(values) ? values : [];
  return [
    ...new Set(
      ids
        .map((value) => String(value || "").trim())
        .filter((value) => value && (!allowedIds.size || allowedIds.has(value)))
    ),
  ];
}

export function nextPortalPropertyScopeSelection({
  currentPropertyIds = [],
  nextScope,
  properties = [],
}) {
  const scope = nextScope === "property" ? "property" : "org";
  if (scope === "org") {
    return { accessScope: "org", propertyIds: [] };
  }

  const ids = normalizePropertyIds(currentPropertyIds, properties);
  return {
    accessScope: "property",
    propertyIds: ids.length ? ids : (properties[0]?.id ? [properties[0].id] : []),
  };
}

export function nextPortalPropertyToggleSelection({
  currentPropertyIds = [],
  propertyId,
  checked,
  properties = [],
}) {
  const ids = normalizePropertyIds(currentPropertyIds, properties);
  const nextIds = checked
    ? normalizePropertyIds([...ids, propertyId], properties)
    : ids.filter((id) => id !== propertyId);
  return {
    accessScope: "property",
    propertyIds: nextIds.length ? nextIds : ids,
  };
}

export function canEditPortalPropertyScope(row = {}) {
  return row.role !== "owner" && row.canChangeScope === true;
}

export function normalizePortalPropertyScopeDraft({
  accessScope = "org",
  propertyIds = [],
  role = "",
  properties = [],
} = {}) {
  if (role === "owner") {
    return { accessScope: "org", propertyIds: [] };
  }
  return nextPortalPropertyScopeSelection({
    currentPropertyIds: propertyIds,
    nextScope: accessScope,
    properties,
  });
}

export function portalPropertyScopeDraftChanged(current = {}, draft = {}, properties = []) {
  const currentSelection = normalizePortalPropertyScopeDraft({
    role: current.role,
    accessScope: current.accessScope,
    propertyIds: current.propertyIds,
    properties,
  });
  const draftSelection = normalizePortalPropertyScopeDraft({
    role: current.role,
    accessScope: draft.accessScope,
    propertyIds: draft.propertyIds,
    properties,
  });
  return (
    currentSelection.accessScope !== draftSelection.accessScope ||
    JSON.stringify([...currentSelection.propertyIds].sort()) !==
      JSON.stringify([...draftSelection.propertyIds].sort())
  );
}

export function portalPropertyScopeDraftCanSave(current = {}, draft = {}, properties = []) {
  if (!canEditPortalPropertyScope(current)) return false;
  const selection = normalizePortalPropertyScopeDraft({
    role: current.role,
    accessScope: draft.accessScope,
    propertyIds: draft.propertyIds,
    properties,
  });
  if (selection.accessScope === "property" && selection.propertyIds.length === 0) {
    return false;
  }
  return portalPropertyScopeDraftChanged(current, selection, properties);
}
