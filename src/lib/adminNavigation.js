const ADMIN_PATHS = new Set(["/admin/portal-access", "/admin/customers"]);

export function normalizeAdminPath(pathname) {
  return String(pathname || "").replace(/\/+$/, "") || "/";
}

export function canNavigateAdminInPlace(currentPath, targetPath, event) {
  return ADMIN_PATHS.has(normalizeAdminPath(currentPath)) &&
    ADMIN_PATHS.has(normalizeAdminPath(targetPath)) &&
    event.button === 0 && !event.defaultPrevented &&
    !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function navigateAdminPage(event, href) {
  const target = normalizeAdminPath(href);
  const current = normalizeAdminPath(window.location.pathname);
  if (!canNavigateAdminInPlace(current, target, event)) return;
  event.preventDefault();
  if (current === target) return;
  window.history.pushState(null, "", target);
  window.dispatchEvent(new Event("admin-route-change"));
  window.scrollTo(0, 0);
}
