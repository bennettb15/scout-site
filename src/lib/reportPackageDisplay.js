import {
  PUNCHLIST_VISIT_SESSION_TYPE,
  normalizeReportPackageSessionType,
} from "../../api-lib/reportPackageSession.js";

export const PROPERTY_REPORT_TYPE = "property_report";

export function reportPackageSessionType(reportPackage = {}) {
  return normalizeReportPackageSessionType(
    reportPackage.sessionType || reportPackage.session?.sessionType
  );
}

export function reportPackageTypeLabel(reportPackage = {}) {
  if (reportPackageSessionType(reportPackage) === PUNCHLIST_VISIT_SESSION_TYPE) return "Punchlist";
  if (reportPackage.fullDocumentationMode === "follow_up") return "Follow-Up";
  return "Full";
}

export function shouldShowReportPackageTypeLabel() {
  return true;
}

export function filterReportPackagesByType(reportPackages = [], selectedType = "All") {
  if (selectedType === "All") return reportPackages || [];
  return (reportPackages || []).filter(
    (reportPackage) => reportPackageTypeLabel(reportPackage) === selectedType
  );
}

export function visibleReportFilesForPackage(reportPackage = {}) {
  const files = Array.isArray(reportPackage.files) ? reportPackage.files : [];
  return files;
}

export function packageShowsPropertyReport(reportPackage = {}) {
  return visibleReportFilesForPackage(reportPackage).some(
    (file) => file?.reportType === PROPERTY_REPORT_TYPE
  );
}
