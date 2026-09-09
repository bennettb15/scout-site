export const FULL_DOCUMENTATION_SESSION_TYPE = "full_documentation";
export const PUNCHLIST_VISIT_SESSION_TYPE = "punchlist_visit";

const SESSION_TYPE_ALIASES = new Map([
  [FULL_DOCUMENTATION_SESSION_TYPE, FULL_DOCUMENTATION_SESSION_TYPE],
  ["full", FULL_DOCUMENTATION_SESSION_TYPE],
  ["documentation", FULL_DOCUMENTATION_SESSION_TYPE],
  ["full_documentation_report", FULL_DOCUMENTATION_SESSION_TYPE],
  ["property_documentation", FULL_DOCUMENTATION_SESSION_TYPE],
  ["property_report", FULL_DOCUMENTATION_SESSION_TYPE],
  [PUNCHLIST_VISIT_SESSION_TYPE, PUNCHLIST_VISIT_SESSION_TYPE],
  ["punchlist", PUNCHLIST_VISIT_SESSION_TYPE],
  ["punch_list", PUNCHLIST_VISIT_SESSION_TYPE],
  ["punchlist_report", PUNCHLIST_VISIT_SESSION_TYPE],
  ["punchlist_update", PUNCHLIST_VISIT_SESSION_TYPE],
  ["punch_list_visit", PUNCHLIST_VISIT_SESSION_TYPE],
]);

function normalizedToken(value) {
  return String(value ?? "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .replace(/__+/g, "_")
    .toLowerCase();
}

export function normalizeReportPackageSessionType(
  value,
  fallback = FULL_DOCUMENTATION_SESSION_TYPE
) {
  const token = normalizedToken(value);
  if (!token) return fallback;
  return SESSION_TYPE_ALIASES.get(token) || fallback;
}

function sessionTypeCandidateFromObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return (
    value.sessionType ||
    value.session_type ||
    value.reportSessionType ||
    value.report_session_type ||
    value.packageSessionType ||
    value.package_session_type ||
    value.metadata?.sessionType ||
    value.metadata?.session_type ||
    value.sessionMetadata?.sessionType ||
    value.sessionMetadata?.session_type ||
    value.session_metadata?.sessionType ||
    value.session_metadata?.session_type ||
    value.packageMetadata?.sessionType ||
    value.packageMetadata?.session_type ||
    value.package_metadata?.sessionType ||
    value.package_metadata?.session_type ||
    ""
  );
}

export function reportPackageSessionTypeFromSources(...sources) {
  for (const source of sources) {
    const candidate =
      typeof source === "string" ? source : sessionTypeCandidateFromObject(source);
    const normalized = normalizeReportPackageSessionType(candidate, "");
    if (normalized) return normalized;
  }
  return FULL_DOCUMENTATION_SESSION_TYPE;
}

export function isPunchlistVisitSessionType(value) {
  return normalizeReportPackageSessionType(value) === PUNCHLIST_VISIT_SESSION_TYPE;
}
