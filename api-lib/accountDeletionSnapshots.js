import { Blob, Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { redactAccountValue, redactSessionSnapshot } from "./redactSessionSnapshot.js";
import { storageObjectExists } from "./storageObjectExists.js";

export const SNAPSHOT_SCAN_LIMIT = 20;
const SNAPSHOT_CONCURRENCY = 4;
const JOURNAL_TABLE = "account_deletion_snapshot_redactions";

function assertResult(result, action) {
  if (result.error) throw new Error(`${action}: ${result.error.message}`);
  return result.data;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function downloadBytes(storage, path) {
  const file = assertResult(await storage.download(path), "Download session snapshot");
  return Buffer.from(await file.arrayBuffer());
}

async function readSnapshotRow(service, snapshotId) {
  return assertResult(await service.from("session_snapshots")
    .select("id,snapshot_payload_sha256,raw_session_json_sha256,payload_byte_size,manifest")
    .eq("id", snapshotId).single(), "Read session snapshot integrity row");
}

async function verifyRowAndObject(service, snapshot, journal, storage) {
  const bytes = await downloadBytes(storage, journal.object_name);
  if (sha256(bytes) !== journal.redacted_sha256 || bytes.length !== journal.payload_byte_size) {
    throw new Error("Redacted session snapshot failed Storage readback.");
  }
  const row = await readSnapshotRow(service, snapshot.id);
  if (row.snapshot_payload_sha256 !== journal.redacted_sha256 ||
      row.raw_session_json_sha256 !== journal.raw_session_json_sha256 ||
      Number(row.payload_byte_size) !== journal.payload_byte_size ||
      !isDeepStrictEqual(row.manifest, journal.redacted_manifest)) {
    throw new Error("Redacted session snapshot failed database readback.");
  }
}

// The journal makes a Storage overwrite and its separate database checksum
// update recoverable if a worker stops between the two operations.
export async function redactSnapshotObject(service, requestId, snapshot, identity) {
  if (snapshot.payload_storage_bucket !== "scoutcapture-session-snapshots") {
    throw new Error("Unexpected session snapshot Storage bucket.");
  }
  const storage = service.storage.from(snapshot.payload_storage_bucket);
  let journal = assertResult(await service.from(JOURNAL_TABLE).select("*")
    .eq("request_id", requestId).eq("snapshot_id", snapshot.id).maybeSingle(),
  "Read snapshot redaction journal");
  const currentBytes = await downloadBytes(storage, snapshot.payload_storage_path);
  const currentHash = sha256(currentBytes);

  if (!journal) {
    if (currentHash !== snapshot.snapshot_payload_sha256 ||
        currentBytes.length !== Number(snapshot.payload_byte_size)) {
      throw new Error("Source snapshot does not match database integrity fields.");
    }
    const sourcePayload = JSON.parse(currentBytes.toString("utf8"));
    if (sourcePayload.rawSessionJSONSHA256 !== snapshot.raw_session_json_sha256) {
      throw new Error("Source snapshot raw checksum does not match database.");
    }
    const redactedManifest = redactAccountValue(snapshot.manifest || {}, identity);
    const storageRedaction = redactSessionSnapshot(currentBytes, identity);
    if (!storageRedaction && isDeepStrictEqual(snapshot.manifest || {}, redactedManifest)) return false;
    const redacted = storageRedaction || {
      bytes: currentBytes,
      snapshotPayloadSHA256: currentHash,
      rawSessionJSONSHA256: sourcePayload.rawSessionJSONSHA256,
      payloadByteSize: currentBytes.length,
    };
    const temporaryName = `account-deletion-redaction/${requestId}/${snapshot.id}.json`;
    journal = {
      request_id: requestId,
      snapshot_id: snapshot.id,
      bucket_id: snapshot.payload_storage_bucket,
      object_name: snapshot.payload_storage_path,
      temporary_name: temporaryName,
      original_sha256: currentHash,
      redacted_sha256: redacted.snapshotPayloadSHA256,
      raw_session_json_sha256: redacted.rawSessionJSONSHA256,
      payload_byte_size: redacted.payloadByteSize,
      redacted_manifest: redactedManifest,
      status: "pending",
    };
    assertResult(await service.from(JOURNAL_TABLE).insert(journal), "Journal snapshot redaction");
  } else if (journal.bucket_id !== snapshot.payload_storage_bucket ||
             journal.object_name !== snapshot.payload_storage_path) {
    throw new Error("Snapshot redaction journal path changed.");
  }

  if (currentHash !== journal.original_sha256 && currentHash !== journal.redacted_sha256) {
    throw new Error("Session snapshot changed outside account cleanup.");
  }
  if (currentHash === journal.original_sha256 &&
      journal.original_sha256 !== journal.redacted_sha256) {
    const redacted = redactSessionSnapshot(currentBytes, identity);
    if (!redacted || redacted.snapshotPayloadSHA256 !== journal.redacted_sha256 ||
        redacted.rawSessionJSONSHA256 !== journal.raw_session_json_sha256 ||
        redacted.payloadByteSize !== journal.payload_byte_size) {
      throw new Error("Snapshot redaction output changed during retry.");
    }
    const temporary = await storageObjectExists(storage, journal.temporary_name);
    if (!temporary) {
      assertResult(await storage.copy(journal.object_name, journal.temporary_name),
        "Back up original snapshot");
    }
    assertResult(await storage.upload(journal.object_name,
      new Blob([redacted.bytes], { type: "application/json" }),
      { upsert: true, contentType: "application/json" }), "Store redacted snapshot");
  }

  const row = await readSnapshotRow(service, snapshot.id);
  if (row.snapshot_payload_sha256 === journal.original_sha256) {
    const updated = assertResult(await service.from("session_snapshots")
      .update({
        snapshot_payload_sha256: journal.redacted_sha256,
        raw_session_json_sha256: journal.raw_session_json_sha256,
        payload_byte_size: journal.payload_byte_size,
        manifest: journal.redacted_manifest,
        updated_by: null,
      })
      .eq("id", snapshot.id)
      .eq("snapshot_payload_sha256", journal.original_sha256)
      .select("id").maybeSingle(), "Update session snapshot checksums");
    if (!updated) throw new Error("Session snapshot changed during checksum update.");
  } else if (row.snapshot_payload_sha256 !== journal.redacted_sha256) {
    throw new Error("Session snapshot checksum changed outside account cleanup.");
  }

  await verifyRowAndObject(service, snapshot, journal, storage);
  if (await storageObjectExists(storage, journal.temporary_name)) {
    assertResult(await storage.remove([journal.temporary_name]), "Remove original snapshot backup");
  }
  assertResult(await service.from(JOURNAL_TABLE).update({ status: "complete" })
    .eq("request_id", requestId).eq("snapshot_id", snapshot.id), "Complete snapshot redaction");
  return true;
}

export async function scanAccountSnapshots(service, requestId, userId, email, fullName = null, { redactSnapshot = redactSnapshotObject } = {}) {
  if (!userId || !email) throw new Error("Account identity is required for snapshot scan.");
  const request = assertResult(await service.from("account_deletion_requests")
    .select("snapshot_scan_cursor,snapshot_scan_complete")
    .eq("id", requestId).single(), "Read snapshot scan progress");
  if (request.snapshot_scan_complete) return true;

  const memberships = assertResult(await service.from("org_memberships")
    .select("org_id").eq("user_id", userId), "Read former organization memberships") || [];
  const orgIds = [...new Set(memberships.map((row) => row.org_id).filter(Boolean))];
  if (!orgIds.length) {
    assertResult(await service.from("account_deletion_requests")
      .update({ snapshot_scan_complete: true }).eq("id", requestId),
    "Complete empty snapshot scan");
    return true;
  }

  let query = service.from("session_snapshots")
    .select("id,org_id,payload_storage_bucket,payload_storage_path,payload_byte_size,raw_session_json_sha256,snapshot_payload_sha256,manifest")
    .in("org_id", orgIds).order("id", { ascending: true }).limit(SNAPSHOT_SCAN_LIMIT);
  if (request.snapshot_scan_cursor) query = query.gt("id", request.snapshot_scan_cursor);
  const snapshots = assertResult(await query, "List organization snapshots for account cleanup") || [];
  for (let offset = 0; offset < snapshots.length; offset += SNAPSHOT_CONCURRENCY) {
    const batch = snapshots.slice(offset, offset + SNAPSHOT_CONCURRENCY);
    const outcomes = await Promise.allSettled(batch.map((snapshot) =>
      redactSnapshot(service, requestId, snapshot, { userId, email, fullName })
    ));
    const failure = outcomes.find((outcome) => outcome.status === "rejected");
    if (failure) throw failure.reason;
    assertResult(await service.from("account_deletion_requests")
      .update({ snapshot_scan_cursor: batch.at(-1).id }).eq("id", requestId),
    "Advance snapshot scan cursor");
  }
  if (snapshots.length < SNAPSHOT_SCAN_LIMIT) {
    assertResult(await service.from("account_deletion_requests")
      .update({ snapshot_scan_complete: true }).eq("id", requestId),
    "Complete snapshot scan");
    return true;
  }
  return false;
}
