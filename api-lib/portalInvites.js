import crypto from "node:crypto";
import { portalAccessRoleLabel } from "./portalAdminAccess.js";

export const INVITE_TOKEN_BYTES = 32;
export const INVITE_EXPIRES_DAYS = 7;
export const MIN_INVITE_PASSWORD_LENGTH = 6;

export class PortalInviteError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "PortalInviteError";
    this.code = code;
    this.status = status;
  }
}

export function createInviteToken() {
  return crypto.randomBytes(INVITE_TOKEN_BYTES).toString("base64url");
}

export function hashInviteToken(token) {
  return crypto
    .createHash("sha256")
    .update(String(token || ""), "utf8")
    .digest("hex");
}

export function inviteExpiresAt(now = new Date()) {
  const expiresAt = new Date(now.getTime());
  expiresAt.setUTCDate(expiresAt.getUTCDate() + INVITE_EXPIRES_DAYS);
  return expiresAt.toISOString();
}

export function portalInviteStatus(invite, now = new Date()) {
  if (!invite) return "invalid";
  if (invite.accepted_at) return "accepted";
  if (invite.revoked_at) {
    if (invite.revoked_reason === "canceled") return "canceled";
    return invite.revoked_reason === "replaced" ? "replaced" : "revoked";
  }
  if (new Date(invite.expires_at).getTime() <= now.getTime()) return "expired";
  return "ready";
}

export function isNormalPendingInvite(invite) {
  return Boolean(invite && !invite.accepted_at && !invite.revoked_at);
}

export function invitePublicState(invite, org, authUser, now = new Date()) {
  const state = portalInviteStatus(invite, now);
  if (state !== "ready") return { state };
  if (!org) return { state: "missing_org" };

  return {
    state: "ready",
    accountMode: authUserConfirmedAt(authUser) ? "existing_confirmed" : "password_setup",
  };
}

export function authUserConfirmedAt(user) {
  return user?.email_confirmed_at || user?.confirmed_at || null;
}

export function inviteAdminActionForUser(user, activeMembership) {
  if (!authUserConfirmedAt(user)) return "create_pending_invite";
  return activeMembership ? "already_active" : "grant_existing_confirmed";
}

export function validateInvitePassword(password) {
  if (String(password || "").length < MIN_INVITE_PASSWORD_LENGTH) {
    throw new PortalInviteError(
      "password_too_short",
      `Password must be at least ${MIN_INVITE_PASSWORD_LENGTH} characters.`,
      400
    );
  }
}

export function inviteRoleLabel(role) {
  return portalAccessRoleLabel(role);
}
