import { createHash } from "node:crypto";
import process from "node:process";
import { Resend } from "resend";
import { scanAccountSnapshots } from "./accountDeletionSnapshots.js";
import { storageObjectExists } from "./storageObjectExists.js";

const TRANSFER_LIMIT = 30;
const WORK_BUDGET_MS = 120_000;
const ORGANIZATION_BUCKETS = new Set([
  "scoutcapture-originals",
  "scoutcapture-session-snapshots",
  "scoutcapture-deliverables",
]);

function assertResult(result, operation) {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`);
  return result.data;
}

function transferPath(requestId, bucket, objectName) {
  const hash = createHash("sha256").update(`${bucket}\0${objectName}`).digest("hex");
  return `account-deletion-transfer/${requestId}/${hash}`;
}

export async function transferObject(service, row, isStillOwned) {
  if (!ORGANIZATION_BUCKETS.has(row.bucket_id)) {
    throw new Error("Unreviewed Storage bucket in account cleanup.");
  }
  const storage = service.storage.from(row.bucket_id);
  const originalExists = await storageObjectExists(storage, row.object_name);
  let temporaryExists = await storageObjectExists(storage, row.temporary_name);

  if (isStillOwned) {
    if (!originalExists) throw new Error("Owned source object disappeared during account cleanup.");
    if (!temporaryExists) {
      assertResult(await storage.copy(row.object_name, row.temporary_name), "Copy retained object");
      temporaryExists = true;
    }
    assertResult(await storage.remove([row.object_name]), "Remove user-owned Storage object");
  }

  if (temporaryExists && !(await storageObjectExists(storage, row.object_name))) {
    assertResult(await storage.copy(row.temporary_name, row.object_name), "Restore organization Storage object");
  }
  if (!(await storageObjectExists(storage, row.object_name))) {
    throw new Error("Retained organization Storage object was not restored.");
  }
  return temporaryExists;
}

async function sendCompletion(email) {
  if (!email) return;
  const from = process.env.SCOUT_INVITE_FROM_EMAIL || process.env.CONTACT_FROM_EMAIL;
  if (!process.env.RESEND_API_KEY || !from) {
    throw new Error("Account deletion confirmation email is not configured.");
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from,
    to: email,
    subject: "Your SCOUT account has been deleted",
    text: "Your Scout Capture and Reports Portal login has been deleted. Shared property captures and reports remain with active organizations as their business records. An organization with no active customer users is scheduled for data deletion after 90 days. Contact your organization administrator if you have questions.",
  });
  if (error) throw error;
}

export async function processAccountDeletion(service, request, { notifyCompletion = sendCompletion } = {}) {
  const requestId = request.id;
  const userId = request.user_id;
  const deadline = Date.now() + WORK_BUDGET_MS;
  assertResult(await service.from("account_deletion_requests")
    .update({ status: "processing", started_at: request.started_at || new Date().toISOString(), last_error: null })
    .eq("id", requestId), "Mark deletion processing");

  try {
    if (userId) {
      let snapshotScanComplete = false;
      while (!snapshotScanComplete && Date.now() < deadline) {
        snapshotScanComplete = await scanAccountSnapshots(
          service, requestId, userId, request.request_email, request.request_full_name
        );
      }
      if (!snapshotScanComplete) return { status: "processing", snapshotsScanned: true };

      const owned = assertResult(
        await service.rpc("account_deletion_owned_objects", { target_user_id: userId }),
        "Read owned Storage objects"
      ) || [];
      const ownedKeys = new Set(owned.map((row) => `${row.bucket_id}\0${row.object_name}`));
      if (owned.length) {
        assertResult(await service.from("account_deletion_storage_transfers").upsert(
          owned.map((object) => ({
            request_id: requestId,
            bucket_id: object.bucket_id,
            object_name: object.object_name,
            temporary_name: transferPath(requestId, object.bucket_id, object.object_name),
          })),
          { onConflict: "request_id,bucket_id,object_name", ignoreDuplicates: true }
        ), "Journal Storage transfers");
      }

      let transferred = 0;
      while (Date.now() < deadline) {
        const pending = assertResult(await service.from("account_deletion_storage_transfers")
          .select("bucket_id,object_name,temporary_name")
          .eq("request_id", requestId)
          .eq("status", "pending")
          .limit(TRANSFER_LIMIT + 1), "Read pending Storage transfers") || [];
        for (const row of pending.slice(0, TRANSFER_LIMIT)) {
          const hasTemporaryCopy = await transferObject(
            service, row, ownedKeys.has(`${row.bucket_id}\0${row.object_name}`)
          );
          const stillOwned = assertResult(
            await service.rpc("account_deletion_owned_objects", { target_user_id: userId }),
            "Verify Storage ownership transfer"
          ) || [];
          if (stillOwned.some((item) => item.bucket_id === row.bucket_id && item.object_name === row.object_name)) {
            throw new Error("Storage object still belongs to the deleted account.");
          }
          if (hasTemporaryCopy) {
            assertResult(await service.storage.from(row.bucket_id).remove([row.temporary_name]),
              "Remove temporary Storage copy");
          }
          assertResult(await service.from("account_deletion_storage_transfers")
            .update({ status: "complete" })
            .eq("request_id", requestId)
            .eq("bucket_id", row.bucket_id)
            .eq("object_name", row.object_name), "Complete Storage transfer");
          transferred += 1;
          if (Date.now() >= deadline) break;
        }
        if (Date.now() >= deadline) return { status: "processing", transferred };
        if (pending.length <= TRANSFER_LIMIT) break;
      }
      if (Date.now() >= deadline) return { status: "processing", transferred };

      const remaining = assertResult(
        await service.rpc("account_deletion_owned_objects", { target_user_id: userId }),
        "Verify no owned Storage objects remain"
      ) || [];
      if (remaining.length) return { status: "processing", transferred };

      assertResult(await service.rpc("redact_user_account_metadata", { target_user_id: userId }),
        "Remove retained metadata attribution");
      assertResult(await service.rpc("prepare_user_account_hard_delete", { target_user_id: userId }),
        "Remove account references");
      assertResult(await service.auth.admin.deleteUser(userId, false), "Hard-delete Supabase Auth user");
    }

    await notifyCompletion(request.request_email);
    assertResult(await service.from("account_deletion_requests")
      .update({
        status: "completed",
        request_email: null,
        request_full_name: null,
        completed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", requestId), "Complete deletion request");
    assertResult(await service.from("account_deletion_storage_transfers")
      .delete().eq("request_id", requestId), "Remove Storage transfer journal");
    return { status: "completed" };
  } catch (error) {
    await service.from("account_deletion_requests")
      .update({ status: "failed", last_error: String(error.message || error).slice(0, 500) })
      .eq("id", requestId);
    throw error;
  }
}

export async function processRequestedAccountDeletion(service, { requestId, userId }) {
  if (!requestId || !userId) throw new Error("Request and user IDs are required.");
  // Claim only the account that submitted this request. The conditional update
  // and the scheduled worker's row lock make overlapping invocations safe.
  const request = assertResult(await service.from("account_deletion_requests")
    .update({ status: "processing", started_at: new Date().toISOString(), last_error: null })
    .eq("id", requestId)
    .eq("user_id", userId)
    .in("status", ["pending", "failed"])
    .select("id,user_id,request_email,request_full_name,status,started_at")
    .maybeSingle(), "Claim requested account deletion");
  if (!request) return { status: "already_processing_or_completed" };
  return processAccountDeletion(service, request);
}

export async function processNextAccountDeletion(service) {
  const requests = assertResult(
    await service.rpc("claim_next_account_deletion"),
    "Claim deletion request"
  ) || [];
  if (!requests.length) return { status: "idle" };
  return processAccountDeletion(service, requests[0]);
}
