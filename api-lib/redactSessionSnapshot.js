import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function replaceEmail(text, email) {
  if (!email) return text;
  let result = text;
  let index = result.toLowerCase().indexOf(email.toLowerCase());
  while (index !== -1) {
    result = `${result.slice(0, index)}Deleted user${result.slice(index + email.length)}`;
    index = result.toLowerCase().indexOf(email.toLowerCase(), index + "Deleted user".length);
  }
  return result;
}

export function redactAccountValue(value, identity) {
  if (Array.isArray(value)) return value.map((item) => redactAccountValue(item, identity));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactAccountValue(item, identity)])
    );
  }
  if (typeof value !== "string") return value;
  if (identity.userId && value.toLowerCase() === identity.userId.toLowerCase()) return null;
  if (identity.fullName && value.trim().toLowerCase() === identity.fullName.toLowerCase()) {
    return "Deleted user";
  }
  return replaceEmail(value, identity.email);
}

// Completed snapshots embed the raw session JSON as a string. Both that string
// and the outer payload have independent checksums and byte counts.
export function redactSessionSnapshot(sourceBytes, identity) {
  if (!identity?.email || !identity?.userId) {
    throw new Error("Account email and user ID are required for snapshot redaction.");
  }
  const sourceText = Buffer.from(sourceBytes).toString("utf8");
  const payload = JSON.parse(sourceText);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      typeof payload.rawSessionJSON !== "string") {
    throw new Error("Unsupported session snapshot payload.");
  }
  if (!sourceText.toLowerCase().includes(identity.email.toLowerCase()) &&
      !sourceText.toLowerCase().includes(identity.userId.toLowerCase()) &&
      !(identity.fullName && sourceText.toLowerCase().includes(identity.fullName.toLowerCase()))) {
    return null;
  }
  const originalRawBytes = Buffer.from(payload.rawSessionJSON);
  if (sha256(originalRawBytes) !== payload.rawSessionJSONSHA256 ||
      originalRawBytes.length !== payload.rawSessionJSONByteCount) {
    throw new Error("Source snapshot raw metadata failed integrity validation.");
  }
  const raw = JSON.parse(payload.rawSessionJSON);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Unsupported raw session metadata.");
  }
  const redactedRaw = redactAccountValue(raw, identity);
  const rawBytes = Buffer.from(JSON.stringify(redactedRaw));
  const redactedPayload = redactAccountValue(payload, identity);
  redactedPayload.rawSessionJSON = rawBytes.toString("utf8");
  redactedPayload.rawSessionJSONSHA256 = sha256(rawBytes);
  redactedPayload.rawSessionJSONByteCount = rawBytes.length;
  const payloadBytes = Buffer.from(JSON.stringify(redactedPayload));
  const redactedText = payloadBytes.toString("utf8").toLowerCase();
  if (redactedText.includes(identity.email.toLowerCase()) ||
      redactedText.includes(identity.userId.toLowerCase())) {
    throw new Error("Snapshot still contains account attribution after redaction.");
  }
  return {
    bytes: payloadBytes,
    rawSessionJSONSHA256: redactedPayload.rawSessionJSONSHA256,
    rawSessionJSONByteCount: rawBytes.length,
    snapshotPayloadSHA256: sha256(payloadBytes),
    payloadByteSize: payloadBytes.length,
  };
}
