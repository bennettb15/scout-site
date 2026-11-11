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

export function galleryPhotoStatus(photo) {
  if (photo?.isResolved) return "resolved";
  if (String(photo?.issueStatus || photo?.issue_status || "").toLowerCase() === "pending_review") return "pending";
  if (photo?.isFlagged) return "flagged";
  return null;
}

export function filterGalleryPhotos(photos, status = "all", query = "") {
  const term = String(query || "").trim().toLocaleLowerCase();
  return (photos || []).filter((photo) => {
    if (status === "flagged" && (!photo.isFlagged || galleryPhotoStatus(photo) === "resolved")) return false;
    if (status === "resolved" && galleryPhotoStatus(photo) !== "resolved") return false;
    return !term || String(photo.displayName || "").toLocaleLowerCase().includes(term);
  });
}

export function galleryDayKey(reportPackage) {
  return photoDateLabel(gallerySessionDate(reportPackage));
}

export function allDatePhotosSelected(datePackages, photosByPackage, selectedIds) {
  let photoCount = 0;
  for (const item of datePackages) {
    const state = photosByPackage[item.id];
    if (!state || state.loading || state.error || !Array.isArray(state.photos)) return false;
    const selected = new Set(selectedIds[item.id] || []);
    photoCount += state.photos.length;
    if (state.photos.some((photo) => !selected.has(photo.id))) return false;
  }
  return photoCount > 0;
}

export function updateDatePhotoSelection(selectedIds, datePhotos, select) {
  const next = { ...selectedIds };
  for (const [packageId, photos] of datePhotos) {
    const ids = new Set(next[packageId] || []);
    for (const photo of photos) {
      if (select) ids.add(photo.id);
      else ids.delete(photo.id);
    }
    next[packageId] = [...ids];
  }
  return next;
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
