import process from "node:process";

export function deletionEnabledFor(email) {
  if (process.env.ACCOUNT_DELETION_ENABLED === "true") return true;
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;
  return String(process.env.ACCOUNT_DELETION_PILOT_EMAILS || "")
    .split(",")
    .some((candidate) => candidate.trim().toLowerCase() === normalized);
}
