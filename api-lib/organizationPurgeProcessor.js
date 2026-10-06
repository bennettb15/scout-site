import { adminEmailSet } from "./portalAdminAccess.js";

const REMOVE_LIMIT = 50;
const WORK_BUDGET_MS = 100_000;
const READ_PAGE_SIZE = 500;
const APPROVED_BUCKETS = new Set([
  "scoutcapture-originals",
  "scoutcapture-session-snapshots",
  "scoutcapture-deliverables",
]);

function assertResult(result, operation) {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`);
  return result.data;
}

async function readAllObjects(service, orgId) {
  const rows = [];
  for (let offset = 0; ; offset += READ_PAGE_SIZE) {
    const page = assertResult(await service
      .rpc("organization_purge_storage_objects", { target_org_id: orgId })
      .range(offset, offset + READ_PAGE_SIZE - 1), "List organization Storage objects") || [];
    rows.push(...page);
    if (page.length < READ_PAGE_SIZE) return rows;
  }
}

export async function processNextOrganizationPurge(service) {
  const trustedAdminEmails = [...adminEmailSet()];
  if (!trustedAdminEmails.length) throw new Error("Platform admin exclusion list is missing.");
  const deadline = Date.now() + WORK_BUDGET_MS;
  const orgId = assertResult(await service.rpc("claim_next_organization_purge", {
    trusted_admin_emails: trustedAdminEmails,
  }), "Claim organization purge");
  if (!orgId) return { status: "idle" };

  try {
    const objects = await readAllObjects(service, orgId);
    const unreviewed = objects.find((row) => !APPROVED_BUCKETS.has(row.bucket_id));
    if (unreviewed) throw new Error("Unreviewed organization Storage bucket.");

    let removed = 0;
    for (let offset = 0; offset < objects.length && Date.now() < deadline; offset += REMOVE_LIMIT) {
      const batch = objects.slice(offset, offset + REMOVE_LIMIT);
      for (const bucketId of new Set(batch.map((row) => row.bucket_id))) {
        const paths = batch.filter((row) => row.bucket_id === bucketId)
          .map((row) => row.object_name);
        assertResult(await service.storage.from(bucketId).remove(paths),
          "Remove organization Storage files");
      }
      removed += batch.length;
      assertResult(await service.from("organization_retention_schedule")
        .update({ updated_at: new Date().toISOString() })
        .eq("org_id", orgId).eq("status", "purging"), "Renew organization purge lease");
    }

    if (removed < objects.length) return { status: "purging", orgId, removed };
    const remaining = await readAllObjects(service, orgId);
    if (remaining.length) return { status: "purging", orgId, removed };
    assertResult(await service.rpc("finish_organization_purge", {
      target_org_id: orgId,
      trusted_admin_emails: trustedAdminEmails,
    }), "Delete inactive organization records");
    return { status: "completed", orgId };
  } catch (error) {
    await service.from("organization_retention_schedule")
      .update({ last_error: String(error.message || error).slice(0, 500) })
      .eq("org_id", orgId);
    throw error;
  }
}
