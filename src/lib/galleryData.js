export function gallerySessionDate(reportPackage) {
  return reportPackage.sessionCompletedAt || reportPackage.session?.completedAt || reportPackage.session?.startedAt || reportPackage.completedAt || "";
}

function timestamp(value) {
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) ? time : 0;
}

export function uniquePropertySessions(packages, propertyId) {
  const newestPackageBySession = new Map();
  for (const item of packages || []) {
    if (item.property?.id !== propertyId || !item.originalPhotoCount) continue;
    const key = item.session?.id || item.id;
    const current = newestPackageBySession.get(key);
    if (!current || timestamp(item.completedAt) > timestamp(current.completedAt)) {
      newestPackageBySession.set(key, item);
    }
  }
  return [...newestPackageBySession.values()].sort((a, b) =>
    timestamp(gallerySessionDate(b)) - timestamp(gallerySessionDate(a)) ||
    timestamp(b.completedAt) - timestamp(a.completedAt)
  );
}

export function filterGalleryPhotos(photos, status = "all", query = "") {
  const term = String(query || "").trim().toLocaleLowerCase();
  return (photos || []).filter((photo) => {
    if (status === "priority" && !photo.isFlagged) return false;
    if (status === "resolved" && !photo.isResolved) return false;
    if (status === "standard" && (photo.isFlagged || photo.isResolved)) return false;
    return !term || String(photo.displayName || "").toLocaleLowerCase().includes(term);
  });
}

export function selectedGalleryPhotos(propertyPackages, photosByPackage, selectedIds) {
  return (propertyPackages || []).flatMap((item) =>
    (photosByPackage?.[item.id]?.photos || [])
      .filter((photo) => (selectedIds?.[item.id] || []).includes(photo.id))
      .map((photo) => ({ packageId: item.id, photoId: photo.id }))
  );
}

export function photoDateLabel(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "Date unknown";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", month: "numeric", day: "numeric", year: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.month}-${byType.day}-${byType.year}`;
}
