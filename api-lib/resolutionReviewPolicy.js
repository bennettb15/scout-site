export function requiresFieldResolutionReview(value) {
  return value !== false;
}

export function canManageResolutionReview(context, orgId) {
  if (context?.isPlatformAdmin) return true;
  return (context?.managementMemberships || []).some((row) =>
    row.org_id === orgId && row.role === "owner"
  );
}
