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
