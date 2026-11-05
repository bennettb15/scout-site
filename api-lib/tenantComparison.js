export const TENANT_BUCKET = 'scoutcapture-on-demand';
export const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
export function tenantPath(row) {
  const folder = row.kind === 'punchlist_all' ? 'punchlists' : 'tenant-comparisons';
  return `orgs/${row.org_id}/properties/${row.property_id}/${folder}/${row.id}.pdf`;
}
export function selectComparisonPackages(packages, beforeId, afterId) {
  const before = packages.find((p) => p.id === beforeId);
  const after = afterId ? packages.find((p) => p.id === afterId) : packages[0];
  if (!before || !after || before.id === after.id) throw new Error('Choose two different report versions.');
  if (before.sessionType !== 'full_documentation') throw new Error('Choose a Full Documentation baseline.');
  if (before.org_id !== after.org_id || before.property_id !== after.property_id) throw new Error('Reports must belong to the same property and organization.');
  const start = new Date(before.session_completed_at).getTime();
  const end = new Date(after.session_completed_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw new Error('The end version must follow the baseline.');
  return { before, after };
}
