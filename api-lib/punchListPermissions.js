import { portalAccessAllowsProperty } from "./portalPropertyAccess.js";

export const COMPLETION_REVIEWER_ROLES = ["viewer", "manager", "owner"];

export function portalRoleCanReviewCompletion(role) {
  return COMPLETION_REVIEWER_ROLES.includes(String(role || "").trim().toLowerCase());
}

export function portalRoleCanReviewCompletionAction(role, action) {
  const normalizedAction = String(action || "").trim().toLowerCase();
  return ["approve", "reject"].includes(normalizedAction) && portalRoleCanReviewCompletion(role);
}

export function portalAccessCanReviewCompletion(portalAccess, orgId, propertyId) {
  if (!portalAccess || !orgId || !propertyId) return false;
  if (portalAccess.isApprovedAdmin) return true;
  return (portalAccess.rows || []).some(
    (row) =>
      (row.org_id === orgId || row.orgId === orgId) &&
      portalRoleCanReviewCompletion(row.role) &&
      portalAccessAllowsProperty(
        {
          role: row.role,
          accessScope: row.access_scope || row.accessScope,
          propertyIds: row.propertyIds || row.property_ids,
        },
        propertyId
      )
  );
}

export function canReviewCompletionForPunchListRow(row) {
  return Boolean(row?.status === "pending_review" && row?.permissions?.canReviewCompletion);
}
