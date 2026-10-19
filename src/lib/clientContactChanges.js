export function formatClientPhone(value) {
  const phone = String(value || "").trim();
  if (/[a-z]/i.test(phone)) return phone;
  const digits = phone.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10) return phone;
  return `(${local.slice(0, 3)})${local.slice(3, 6)}-${local.slice(6)}`;
}

export function contactDraftForProperty(property, drafts) {
  return drafts[property.id] || {
    clientEmail: property.clientEmail || "",
    clientPhone: formatClientPhone(property.clientPhone),
  };
}

export function changedClientProperties(properties, drafts) {
  return (properties || []).filter((property) => {
    if (!property.canEdit) return false;
    const draft = contactDraftForProperty(property, drafts);
    return draft.clientEmail.trim() !== (property.clientEmail || "") ||
      formatClientPhone(draft.clientPhone) !== formatClientPhone(property.clientPhone);
  });
}

export async function saveClientContactChanges({ properties, drafts, accessToken, request = fetch }) {
  const changed = changedClientProperties(properties, drafts);
  const saved = [];
  const failed = [];

  for (let start = 0; start < changed.length; start += 4) {
    const batch = changed.slice(start, start + 4);
    const results = await Promise.all(batch.map(async (property) => {
      const draft = contactDraftForProperty(property, drafts);
      try {
        const response = await request("/api/client-details", {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            propertyId: property.id,
            revision: property.revision,
            clientEmail: draft.clientEmail,
            clientPhone: formatClientPhone(draft.clientPhone),
          }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.property) {
          throw new Error(body.error || "Unable to save contact details.");
        }
        return { property: body.property };
      } catch (error) {
        return { property, error: error.message || "Unable to save contact details." };
      }
    }));
    for (const result of results) {
      if (result.error) failed.push(result);
      else saved.push(result.property);
    }
  }

  return { saved, failed };
}
