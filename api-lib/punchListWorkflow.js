export function shouldWriteWorkflowActivity({
  field, currentValue, nextValue, displayedFromValue, forceActivity = false,
}) {
  if (forceActivity || (currentValue || null) !== (nextValue || null)) return true;
  // A carried-forward photo can display an older value than the observation.
  // Changing that visible value still needs a durable activity row.
  return (field === "priority" || field === "trade") &&
    displayedFromValue != null &&
    String(displayedFromValue).trim().toLowerCase() !== String(nextValue ?? "").trim().toLowerCase();
}
