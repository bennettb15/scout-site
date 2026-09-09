import {
  FULL_DOCUMENTATION_SESSION_TYPE,
  PUNCHLIST_VISIT_SESSION_TYPE,
  isPunchlistVisitSessionType,
  normalizeReportPackageSessionType,
} from "../../api-lib/reportPackageSession.js";

export const PROPERTY_REPORT_TYPE = "property_report";

export function reportPackageSessionType(reportPackage = {}) {
  return normalizeReportPackageSessionType(
    reportPackage.sessionType || reportPackage.session?.sessionType
  );
}

export function reportPackageTypeLabel(reportPackage = {}) {
  return reportPackageSessionType(reportPackage) === PUNCHLIST_VISIT_SESSION_TYPE
    ? "Punchlist"
    : "Full Documentation";
}

export function shouldShowReportPackageTypeLabel(reportPackage = {}) {
  return reportPackageSessionType(reportPackage) !== FULL_DOCUMENTATION_SESSION_TYPE;
}

export function visibleReportFilesForPackage(reportPackage = {}) {
  const files = Array.isArray(reportPackage.files) ? reportPackage.files : [];
  if (!isPunchlistVisitSessionType(reportPackageSessionType(reportPackage))) return files;
  return files.filter((file) => file?.reportType !== PROPERTY_REPORT_TYPE);
}

export function packageShowsPropertyReport(reportPackage = {}) {
  return visibleReportFilesForPackage(reportPackage).some(
    (file) => file?.reportType === PROPERTY_REPORT_TYPE
  );
}
