const PORTAL_CONTEXT_KEY_PREFIX = "scout:client-portal-context:v1";

function contextKey(session) {
  const scope = session?.user?.id || session?.user?.email || "";
  return scope ? `${PORTAL_CONTEXT_KEY_PREFIX}:${scope}` : "";
}

function cleanId(value) {
  const text = String(value || "").trim();
  return text || "";
}

export function readPortalContext(session) {
  const key = contextKey(session);
  if (!key || typeof window === "undefined" || !window.localStorage) {
    return { orgId: "", propertyId: "" };
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { orgId: "", propertyId: "" };
    const value = JSON.parse(raw);
    return {
      orgId: cleanId(value?.orgId),
      propertyId: cleanId(value?.propertyId),
    };
  } catch {
    return { orgId: "", propertyId: "" };
  }
}

export function writePortalContext(session, nextContext) {
  const key = contextKey(session);
  if (!key || typeof window === "undefined" || !window.localStorage) return;

  const currentContext = readPortalContext(session);
  const orgId =
    nextContext?.orgId === undefined ? currentContext.orgId : cleanId(nextContext.orgId);
  const propertyId =
    nextContext?.propertyId === undefined
      ? currentContext.propertyId
      : cleanId(nextContext.propertyId);

  try {
    window.localStorage.setItem(key, JSON.stringify({ orgId, propertyId }));
  } catch {
    // Browser storage is a convenience only; selection still falls back safely.
  }
}
