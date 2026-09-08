export function reportPackagePropertyId(reportPackage = {}) {
  return String(reportPackage.property?.id || "").trim();
}

export function allowedPropertyIdsFromOptions(propertyOptions = []) {
  return new Set(
    (propertyOptions || [])
      .map((property) => String(property?.id || "").trim())
      .filter(Boolean)
  );
}

export function filterReportPackagesByAllowedProperties(
  reportPackages = [],
  propertyOptions = [],
  hasExplicitPropertyOptions = false
) {
  if (!hasExplicitPropertyOptions) return reportPackages || [];
  const allowedPropertyIds = allowedPropertyIdsFromOptions(propertyOptions);
  return (reportPackages || []).filter((reportPackage) =>
    allowedPropertyIds.has(reportPackagePropertyId(reportPackage))
  );
}

export function filterReportPackagesBySelectedProperty(
  reportPackages = [],
  selectedPropertyId = "",
  allPropertiesValue = "all"
) {
  if (selectedPropertyId === allPropertiesValue) return reportPackages || [];
  return (reportPackages || []).filter(
    (reportPackage) => reportPackagePropertyId(reportPackage) === selectedPropertyId
  );
}
