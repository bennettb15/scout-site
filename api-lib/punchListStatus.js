function keyValue(value) {
  const text = String(value || "").trim();
  return text ? text.toLowerCase() : "";
}

function normalizedStatus(value) {
  return normalizedExplicitStatus(value) || "active";
}

export function normalizedExplicitStatus(value) {
  const text = String(value || "")
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
  if (text === "pending_review" || text === "pending") return "pending_review";
  if (text === "resolved" || text === "closed") return "resolved";
  if (text === "active" || text === "open" || text === "reopened") return "active";
  return "";
}

export function packageTimestamp(row) {
  return row?.session_completed_at || row?.completed_at || "";
}

export function fieldResolutionStateFromActivity(row) {
  if (row?.activity_type !== "field_resolution_finalized") return null;
  const status = normalizedExplicitStatus(row.to_value);
  if (status !== "resolved" && status !== "pending_review") return null;
  return { status, activity: row, source: "field_resolution", groupId: "" };
}

function shotReopenOperationalStatus(row) {
  if (!row?.snapshot_reopened_in_session) return "";
  return normalizedStatus(row.snapshot_issue_status || row.issue_status);
}

function shotPendingReviewOperationalStatus(row) {
  return normalizedExplicitStatus(row?.snapshot_issue_status || row?.issue_status) === "pending_review"
    ? "pending_review"
    : "";
}

function timeValue(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

function compareOperationalTime(left, right) {
  const leftTime = timeValue(left);
  const rightTime = timeValue(right);
  if (leftTime != null && rightTime != null) return leftTime - rightTime;
  if (leftTime != null) return 1;
  if (rightTime != null) return -1;
  return 0;
}

export function latestStatusOverride({ operationalState, shot, reportPackage }) {
  const activityStatus = operationalState?.status || "";
  const scoutStatus = shotReopenOperationalStatus(shot) || shotPendingReviewOperationalStatus(shot);
  if (!scoutStatus) return activityStatus;
  if (!activityStatus) return scoutStatus;

  // The server's decision for this capture supersedes its sealed field snapshot.
  if (operationalState?.source === "field_resolution" &&
      keyValue(operationalState.activity?.from_value) === keyValue(shot?.session_id)) {
    return activityStatus;
  }

  const packageTime = packageTimestamp(reportPackage) || shot?.updated_at || shot?.captured_at || shot?.created_at;
  const activityTime = operationalState?.activity?.created_at;
  return compareOperationalTime(packageTime, activityTime) > 0 ? scoutStatus : activityStatus;
}
