import { Resend } from "resend";
import {
  authenticateRequest,
  getQueryValue,
  sendJson,
} from "./_reportPortalShared.js";
import {
  ensureUserProfile,
  findAuthUserByEmail,
  loadOrg,
  normalizeEmail,
} from "./_portalAdminShared.js";
import {
  INVITE_EXPIRES_DAYS,
  PortalInviteError,
  authUserConfirmedAt,
  createInviteToken,
  hashInviteToken,
  inviteExpiresAt,
  inviteAdminActionForUser,
  invitePublicState,
  inviteRoleLabel,
  isNormalPendingInvite,
  portalInviteStatus,
  validateInvitePassword,
} from "../api-lib/portalInvites.js";
import {
  PROPERTY_ACCESS_SCOPE,
  normalizeAccessScope,
  normalizePropertyIds,
} from "../api-lib/portalPropertyAccess.js";

export const PORTAL_EMAIL_LOGO_URL = "https://scoutclear.com/scout-logo-email.png";

export {
  INVITE_EXPIRES_DAYS,
  PortalInviteError,
  authUserConfirmedAt,
  createInviteToken,
  hashInviteToken,
  inviteExpiresAt,
  inviteAdminActionForUser,
  invitePublicState,
  inviteRoleLabel,
  isNormalPendingInvite,
  portalInviteStatus,
  validateInvitePassword,
};

export function inviteUrl(req, token) {
  const base = siteBaseUrl(req);
  return `${base}/accept-invite?token=${encodeURIComponent(token)}`;
}

export function reportsUrl(req) {
  return `${siteBaseUrl(req)}/reports`;
}

function siteBaseUrl(req) {
  const configured = process.env.SCOUT_SITE_URL || process.env.VITE_SITE_URL;
  if (configured) {
    return String(configured).replace(/\/$/, "");
  }

  if (process.env.VERCEL_ENV === "production") {
    return "https://www.scoutclear.com";
  }

  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || process.env.VERCEL_URL;
  const origin = host
    ? `${proto}://${String(host).replace(/^https?:\/\//, "")}`
    : "https://www.scoutclear.com";
  return origin.replace(/\/$/, "");
}

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function inviteFromAddress() {
  return process.env.SCOUT_INVITE_FROM_EMAIL || process.env.CONTACT_FROM_EMAIL || "";
}

function inviteReplyToAddress() {
  return (
    process.env.SCOUT_INVITE_REPLY_TO ||
    process.env.CONTACT_TO_EMAIL ||
    process.env.SCOUT_INVITE_FROM_EMAIL ||
    process.env.CONTACT_FROM_EMAIL ||
    ""
  );
}

export function assertInviteEmailConfigured() {
  if (!process.env.RESEND_API_KEY || !inviteFromAddress()) {
    throw new PortalInviteError(
      "email_not_configured",
      "Invite email is not configured. Set RESEND_API_KEY and SCOUT_INVITE_FROM_EMAIL or CONTACT_FROM_EMAIL.",
      500
    );
  }
}

function portalEmailLogoHtml() {
  return `<img src="${escapeHtml(PORTAL_EMAIL_LOGO_URL)}" alt="ScoutClear" width="150" style="display:block;width:150px;max-width:100%;height:auto;margin:0" />`;
}

export function portalInviteEmailPayload({ email, org, role, setupUrl, from, replyTo }) {
  const safeOrg = escapeHtml(org.name || "your organization");
  const safeRole = escapeHtml(inviteRoleLabel(role));
  const safeUrl = escapeHtml(setupUrl);

  return {
    from,
    to: email,
    subject: "You're invited to SCOUT",
    html: `
      <div style="margin:0;background:#f7f7f4;padding:32px 16px;font-family:Arial,sans-serif;color:#1c2742">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e2dc;border-radius:8px">
          <tr>
            <td style="padding:28px 28px 8px">
              ${portalEmailLogoHtml()}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 0">
              <h1 style="margin:0;font-size:24px;line-height:1.25;color:#1c2742">You're invited to the SCOUT Client Portal</h1>
              <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#4b5563">
                You have been invited as a ${safeRole} for ${safeOrg}. Use this secure link to set up or sign in to your portal account.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 8px">
              <a href="${safeUrl}" style="display:inline-block;background:#1c2742;color:#ffffff;text-decoration:none;border-radius:6px;padding:13px 18px;font-size:15px;font-weight:700">Open SCOUT invite</a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 28px">
              <p style="margin:0;font-size:13px;line-height:1.55;color:#6b7280">
                This invite expires in ${INVITE_EXPIRES_DAYS} days. If the button does not work, copy and paste this link into your browser:
              </p>
              <p style="margin:10px 0 0;font-size:12px;line-height:1.5;word-break:break-all;color:#374151">${safeUrl}</p>
            </td>
          </tr>
        </table>
      </div>
    `,
    text: [
      "You're invited to the SCOUT Client Portal.",
      "",
      `Organization: ${org.name || "Organization"}`,
      `Access: ${inviteRoleLabel(role)}`,
      "",
      `Open your invite: ${setupUrl}`,
      "",
      `This invite expires in ${INVITE_EXPIRES_DAYS} days.`,
    ].join("\n"),
    ...(replyTo ? { replyTo } : {}),
  };
}

export async function sendPortalInviteEmail({ email, org, role, setupUrl }) {
  assertInviteEmailConfigured();

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send(
    portalInviteEmailPayload({
      email,
      org,
      role,
      setupUrl,
      from: inviteFromAddress(),
      replyTo: inviteReplyToAddress(),
    })
  );

  if (error) {
    throw new PortalInviteError(
      "email_failed",
      error.message || "Invite email could not be sent.",
      502
    );
  }
}

export function portalAccessAddedEmailPayload({ email, org, role, reportsUrl, from, replyTo }) {
  const orgName = org.name || "your organization";
  const safeOrg = escapeHtml(org.name || "your organization");
  const safeRole = escapeHtml(inviteRoleLabel(role));
  const safeUrl = escapeHtml(reportsUrl);

  return {
    from,
    to: email,
    subject: `SCOUT access added for ${orgName}`,
    html: `
      <div style="margin:0;background:#f7f7f4;padding:32px 16px;font-family:Arial,sans-serif;color:#1c2742">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e2dc;border-radius:8px">
          <tr>
            <td style="padding:28px 28px 8px">
              ${portalEmailLogoHtml()}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 0">
              <h1 style="margin:0;font-size:24px;line-height:1.25;color:#1c2742">Your SCOUT portal access is ready</h1>
              <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#4b5563">
                You've been given ${safeRole} access to ${safeOrg}. Sign in to view reports and punch list items for this organization.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 8px">
              <a href="${safeUrl}" style="display:inline-block;background:#1c2742;color:#ffffff;text-decoration:none;border-radius:6px;padding:13px 18px;font-size:15px;font-weight:700">Open Reports Portal</a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 28px">
              <p style="margin:0;font-size:13px;line-height:1.55;color:#6b7280">
                If the button does not work, copy and paste this link into your browser:
              </p>
              <p style="margin:10px 0 0;font-size:12px;line-height:1.5;word-break:break-all;color:#374151">${safeUrl}</p>
            </td>
          </tr>
        </table>
      </div>
    `,
    text: [
      "Your SCOUT portal access is ready.",
      "",
      `You've been given ${inviteRoleLabel(role)} access to ${orgName}.`,
      "Sign in to view reports and punch list items for this organization.",
      "",
      `Open Reports Portal: ${reportsUrl}`,
    ].join("\n"),
    ...(replyTo ? { replyTo } : {}),
  };
}

export async function sendPortalAccessAddedEmail({ email, org, role, reportsUrl }) {
  assertInviteEmailConfigured();

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send(
    portalAccessAddedEmailPayload({
      email,
      org,
      role,
      reportsUrl,
      from: inviteFromAddress(),
      replyTo: inviteReplyToAddress(),
    })
  );

  if (error) {
    throw new PortalInviteError(
      "email_failed",
      error.message || "Access email could not be sent.",
      502
    );
  }
}

export async function loadInviteByToken(service, token) {
  const tokenText = String(token || "").trim();
  if (!tokenText) return null;

  const { data, error } = await service
    .from("portal_invites")
    .select(
      "id,org_id,email,role,access_scope,created_by,created_at,updated_at,last_sent_at,expires_at,accepted_at,accepted_by,revoked_at,revoked_reason"
    )
    .eq("token_hash", hashInviteToken(tokenText))
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  if (normalizeAccessScope(data.access_scope, data.role) === PROPERTY_ACCESS_SCOPE) {
    const { data: grantRows, error: grantError } = await service
      .from("portal_invite_property_grants")
      .select("property_id")
      .eq("invite_id", data.id);

    if (grantError) {
      if (grantError.code !== "42P01") throw grantError;
      data.propertyIds = [];
    } else {
      data.propertyIds = normalizePropertyIds((grantRows || []).map((row) => row.property_id));
    }
  } else {
    data.propertyIds = [];
  }

  return data;
}

export async function loadInvitePublicDetails(service, token, now = new Date()) {
  const invite = await loadInviteByToken(service, token);
  const state = portalInviteStatus(invite, now);
  const org = invite?.org_id ? await loadOrg(service, invite.org_id) : null;
  const authUser =
    state === "ready" && invite?.email
      ? await findAuthUserByEmail(service, normalizeEmail(invite.email))
      : null;
  const publicState = invitePublicState(invite, org, authUser, now);

  return {
    invite,
    org,
    authUser,
    publicState,
  };
}

async function authenticatedInviteUser(req, inviteEmail) {
  const auth = await authenticateRequest(req);
  if (auth.error) {
    throw new PortalInviteError(
      "sign_in_required",
      "Sign in with the invited email to accept this invite.",
      401
    );
  }

  if (normalizeEmail(auth.user?.email) !== inviteEmail) {
    throw new PortalInviteError(
      "wrong_email",
      "This invite belongs to a different email address.",
      403
    );
  }

  return auth.user;
}

async function createOrUpdateInviteAccount(service, inviteEmail, password) {
  validateInvitePassword(password);

  const existing = await findAuthUserByEmail(service, inviteEmail);
  if (authUserConfirmedAt(existing)) {
    throw new PortalInviteError(
      "sign_in_required",
      "Sign in with the invited email to accept this invite.",
      401
    );
  }

  if (existing?.id) {
    const { data, error } = await service.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
    return data.user;
  }

  const { data, error } = await service.auth.admin.createUser({
    email: inviteEmail,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user;
}

export async function activateInvite({
  service,
  req,
  invite,
  org,
  password,
  actorId,
  upsertOrgMembership,
}) {
  const inviteEmail = normalizeEmail(invite?.email);
  const state = portalInviteStatus(invite);
  if (state === "accepted") {
    throw new PortalInviteError("already_accepted", "This invite has already been accepted.", 409);
  }
  if (state === "expired") {
    throw new PortalInviteError("expired", "This invite has expired.", 410);
  }
  if (state === "replaced") {
    throw new PortalInviteError(
      "replaced",
      "This invite was replaced by a newer invite. Use the newest SCOUT invite email.",
      410
    );
  }
  if (state === "canceled") {
    throw new PortalInviteError(
      "canceled",
      "This invite was canceled. Ask your SCOUT contact for a new Client Portal invite.",
      410
    );
  }
  if (state !== "ready") {
    throw new PortalInviteError("invalid", "This invite link is invalid.", 404);
  }
  if (!org) {
    throw new PortalInviteError(
      "missing_org",
      "This invite no longer has an active organization.",
      409
    );
  }

  const existing = await findAuthUserByEmail(service, inviteEmail);
  const user = authUserConfirmedAt(existing)
    ? await authenticatedInviteUser(req, inviteEmail)
    : await createOrUpdateInviteAccount(service, inviteEmail, password);

  await ensureUserProfile(service, user, actorId || user.id);
  const membership = await upsertOrgMembership(service, {
    orgId: invite.org_id,
    userId: user.id,
    role: invite.role,
    accessScope: normalizeAccessScope(invite.access_scope, invite.role),
    propertyIds: invite.propertyIds || invite.property_ids || [],
    actorId: actorId || user.id,
  });

  const { error } = await service
    .from("portal_invites")
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by: user.id,
      updated_by: actorId || user.id,
    })
    .eq("id", invite.id)
    .is("accepted_at", null)
    .is("revoked_at", null);
  if (error) throw error;

  return { user, membership };
}

export function portalInviteErrorResponse(res, error) {
  if (error instanceof PortalInviteError) {
    return sendJson(res, error.status, {
      error: error.message,
      code: error.code,
    });
  }
  return sendJson(res, 500, {
    error: error.message || "Unable to process invite.",
    code: "server_error",
  });
}

export function getInviteToken(req) {
  return getQueryValue(req, "token") || "";
}
