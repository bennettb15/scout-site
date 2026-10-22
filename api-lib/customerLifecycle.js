import { normalizeEmail } from "./portalAdminAccess.js";

export const PRIVATE_CUSTOMER_EMAILS = new Set([
  "brian@scoutclear.com",
  "bennettb15@gmail.com",
]);

export function canManageCustomerLifecycle(email) {
  return PRIVATE_CUSTOMER_EMAILS.has(normalizeEmail(email));
}

export function pilotEndFromSignature(signedAt) {
  const time = new Date(signedAt).getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(time + 30 * 24 * 60 * 60 * 1000).toISOString();
}

export function lifecycleExpiry(row, now = new Date()) {
  if (!row) return null;
  const ongoingStart = row.ongoing_started_at
    ? new Date(row.ongoing_started_at).getTime()
    : NaN;
  if (Number.isFinite(ongoingStart) && ongoingStart <= now.getTime()) {
    return row.ongoing_expires_at || null;
  }
  return row.pilot_expires_at || null;
}

export function lifecycleStatus(row, now = new Date()) {
  if (!row) return "untracked";
  const expiry = lifecycleExpiry(row, now);
  if (expiry && row.access_ended_at && new Date(expiry).getTime() <= new Date(row.access_ended_at).getTime()) {
    return "access-ended";
  }
  if (expiry && new Date(expiry).getTime() <= now.getTime()) return "expired";
  if (row.ongoing_started_at && new Date(row.ongoing_started_at).getTime() <= now.getTime()) {
    return "ongoing";
  }
  if (!expiry) return "untracked";
  return "pilot";
}
