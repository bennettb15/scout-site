// Captions belong to the selected photo, rather than the item's current wording.
export function photoFlagReason(photo) {
  return String(photo?.preview?.flagReason || photo?.note || "").trim() ||
    (photo?.activityId ? "No completion note recorded" : "No flag reason recorded");
}
