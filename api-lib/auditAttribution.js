import { normalizeEmail } from "./portalAdminAccess.js";

export const SYSTEM_ACTOR_LABEL = "System";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeAuditEmail(value) {
  const email = normalizeEmail(value);
  return EMAIL_PATTERN.test(email) ? email : "";
}

function firstEmail(...values) {
  for (const value of values) {
    const email = normalizeAuditEmail(value);
    if (email) return email;
  }
  return "";
}

function valueAtPath(object, path) {
  return path.reduce((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return current[key];
  }, object);
}

function firstPathValue(object, paths) {
  for (const path of paths) {
    const value = valueAtPath(object, path);
    if (value != null && value !== "") return value;
  }
  return "";
}

export function actorEmailFromSnapshot(rawSession = {}, payload = {}) {
  return firstEmail(
    firstPathValue(payload, [
      ["completedByEmail"],
      ["completed_by_email"],
      ["uploadedByEmail"],
      ["uploaded_by_email"],
      ["capturedByEmail"],
      ["captured_by_email"],
      ["userEmail"],
      ["user_email"],
      ["accountEmail"],
      ["account_email"],
      ["session", "completedByEmail"],
      ["session", "uploadedByEmail"],
      ["session", "capturedByEmail"],
      ["user", "email"],
      ["account", "email"],
      ["actor", "email"],
      ["uploader", "email"],
      ["completedBy", "email"],
      ["capturedBy", "email"],
    ]),
    firstPathValue(rawSession, [
      ["completedByEmail"],
      ["completed_by_email"],
      ["uploadedByEmail"],
      ["uploaded_by_email"],
      ["capturedByEmail"],
      ["captured_by_email"],
      ["userEmail"],
      ["user_email"],
      ["accountEmail"],
      ["account_email"],
      ["createdByEmail"],
      ["created_by_email"],
      ["session", "completedByEmail"],
      ["session", "uploadedByEmail"],
      ["session", "capturedByEmail"],
      ["user", "email"],
      ["account", "email"],
      ["actor", "email"],
      ["uploader", "email"],
      ["completedBy", "email"],
      ["capturedBy", "email"],
    ])
  );
}

export function actorEmailFromShotSnapshot(shot = {}, sessionEmail = "") {
  return firstEmail(
    firstPathValue(shot, [
      ["capturedByEmail"],
      ["captured_by_email"],
      ["uploadedByEmail"],
      ["uploaded_by_email"],
      ["userEmail"],
      ["user_email"],
      ["actor", "email"],
      ["uploader", "email"],
      ["capturedBy", "email"],
    ]),
    sessionEmail
  );
}

export function actorEmailFromProfileMap(userId, profileEmailById) {
  if (!userId || !profileEmailById) return "";
  return normalizeAuditEmail(profileEmailById.get(userId));
}

export function auditActorLabel({ email, userId, profileEmailById } = {}) {
  return (
    normalizeAuditEmail(email) ||
    actorEmailFromProfileMap(userId, profileEmailById) ||
    SYSTEM_ACTOR_LABEL
  );
}

export function profileEmailMap(profileRows = []) {
  return new Map(
    (profileRows || [])
      .map((row) => [row.id, normalizeAuditEmail(row.email)])
      .filter(([id, email]) => id && email)
  );
}

export function attributionForAction(action, actorLabel) {
  const label = String(actorLabel || "").trim() || SYSTEM_ACTOR_LABEL;
  if (action === "uploaded") return `Uploaded by ${label}`;
  if (action === "last_updated") return `Last updated by ${label}`;
  if (action === "submitted") return `Submitted by ${label}`;
  if (action === "approved") return `Approved by ${label}`;
  if (action === "rejected") return `Rejected by ${label}`;
  if (action === "reopened") return `Reopened by ${label}`;
  if (action === "note_added") return `Note added by ${label}`;
  return `Captured by ${label}`;
}

export function capturedAttributionForPunchListRow({ shot, reportPackage } = {}) {
  const actorEmail = normalizeAuditEmail(shot?.captured_by_email) ||
    normalizeAuditEmail(reportPackage?.captured_by_email) ||
    SYSTEM_ACTOR_LABEL;
  return {
    action: "captured",
    actorEmail,
    label: attributionForAction("captured", actorEmail),
  };
}

export function activityActorEmail(row, profileEmailById, fallbackEmail = "") {
  return auditActorLabel({
    email: fallbackEmail,
    userId: row?.created_by || row?.createdBy,
    profileEmailById,
  });
}

export function publicActivityAttributionFields(row, options = {}) {
  return {
    createdBy: row?.created_by || row?.createdBy || null,
    actorEmail: options.actorEmail || row?.actorEmail || row?.actor_email || SYSTEM_ACTOR_LABEL,
    createdAt: row?.created_at || row?.createdAt || null,
  };
}

export function submittedByEmailForCompletionActivity(activity) {
  return activity?.actorEmail || activity?.actor_email || null;
}

export function workflowAttributionForPunchListRow({ operationalState, workflowActivityRows } = {}) {
  if (operationalState?.source === "workflow" && operationalState.activity?.actorEmail) {
    return {
      action: "last_updated",
      actorEmail: operationalState.activity.actorEmail,
      label: attributionForAction("last_updated", operationalState.activity.actorEmail),
    };
  }

  const latestWorkflowActivity = (workflowActivityRows || []).find((row) => row?.actorEmail);
  if (!latestWorkflowActivity) return null;
  return {
    action: "last_updated",
    actorEmail: latestWorkflowActivity.actorEmail,
    label: attributionForAction("last_updated", latestWorkflowActivity.actorEmail),
  };
}

export function completionAttributionForPunchListRow({ operationalState, completionState } = {}) {
  if (operationalState?.source !== "completion") return null;
  if (operationalState.status === "active" && operationalState.activity?.actorEmail) {
    return {
      action: "last_updated",
      actorEmail: operationalState.activity.actorEmail,
      label: attributionForAction("last_updated", operationalState.activity.actorEmail),
    };
  }

  const actorEmail = completionState?.submission?.actorEmail || completionState?.submission?.actor_email;
  if (!actorEmail) return null;
  return {
    action: "uploaded",
    actorEmail,
    label: attributionForAction("uploaded", actorEmail),
  };
}

export function actorIdsFromVisibleAttributionRows(rows = []) {
  return [
    ...new Set(
      (rows || [])
        .map((row) => row?.created_by || row?.createdBy || row?.actorId)
        .filter(Boolean)
    ),
  ];
}

export function reportPackageActorId(row) {
  return row?.completed_by || row?.uploaded_by || row?.created_by || "";
}

export function capturedByEmailForReportPackage({
  packageRow,
  snapshotMetadata,
  profileEmailById,
} = {}) {
  return auditActorLabel({
    email: snapshotMetadata?.capturedByEmail,
    userId: reportPackageActorId(packageRow),
    profileEmailById,
  });
}
