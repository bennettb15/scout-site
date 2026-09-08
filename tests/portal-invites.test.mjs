import assert from "node:assert/strict";
import test from "node:test";
import {
  INVITE_EXPIRES_DAYS,
  MIN_INVITE_PASSWORD_LENGTH,
  PortalInviteError,
  createInviteToken,
  hashInviteToken,
  inviteAdminActionForUser,
  inviteExpiresAt,
  invitePublicState,
  isNormalPendingInvite,
  portalInviteStatus,
  validateInvitePassword,
} from "../api-lib/portalInvites.js";
import {
  PORTAL_EMAIL_LOGO_URL,
  activateInvite,
  portalAccessAddedEmailPayload,
  portalInviteEmailPayload,
} from "../api/_portalInviteShared.js";

const now = new Date("2026-09-07T12:00:00.000Z");

function invite(overrides = {}) {
  return {
    accepted_at: null,
    expires_at: "2026-09-08T12:00:00.000Z",
    revoked_at: null,
    revoked_reason: null,
    ...overrides,
  };
}

test("invite tokens are opaque and hashed deterministically", () => {
  const token = createInviteToken();

  assert.equal(typeof token, "string");
  assert.ok(token.length >= 32);
  assert.equal(hashInviteToken(token), hashInviteToken(token));
  assert.notEqual(hashInviteToken(token), token);
});

test("pending invite remains ready until it expires", () => {
  assert.equal(portalInviteStatus(invite(), now), "ready");
});

test("portal invites expire after seven days", () => {
  assert.equal(INVITE_EXPIRES_DAYS, 7);
  assert.equal(
    inviteExpiresAt(now),
    "2026-09-14T12:00:00.000Z"
  );
});

test("expired invite reports expired", () => {
  assert.equal(
    portalInviteStatus(invite({ expires_at: "2026-09-07T11:59:59.000Z" }), now),
    "expired"
  );
});

test("accepted invite reports accepted before expiration checks", () => {
  assert.equal(
    portalInviteStatus(
      invite({
        accepted_at: "2026-09-07T11:00:00.000Z",
        expires_at: "2026-09-07T11:30:00.000Z",
      }),
      now
    ),
    "accepted"
  );
});

test("replaced invite reports replaced for old links", () => {
  assert.equal(
    portalInviteStatus(
      invite({
        revoked_at: "2026-09-07T11:00:00.000Z",
        revoked_reason: "replaced",
      }),
      now
    ),
    "replaced"
  );
});

test("canceled invite reports canceled for old links", () => {
  assert.equal(
    portalInviteStatus(
      invite({
        revoked_at: "2026-09-07T11:00:00.000Z",
        revoked_reason: "canceled",
      }),
      now
    ),
    "canceled"
  );
});

test("canceled invite is removed from the normal pending list", () => {
  assert.equal(isNormalPendingInvite(invite()), true);
  assert.equal(
    isNormalPendingInvite(invite({ revoked_at: "2026-09-07T11:00:00.000Z", revoked_reason: "canceled" })),
    false
  );
  assert.equal(
    isNormalPendingInvite(invite({ accepted_at: "2026-09-07T11:00:00.000Z" })),
    false
  );
});

test("canceled invite cannot be accepted", async () => {
  await assert.rejects(
    () =>
      activateInvite({
        service: {},
        req: {},
        invite: invite({
          email: "new@example.com",
          org_id: "org-1",
          role: "field",
          revoked_at: "2026-09-07T11:00:00.000Z",
          revoked_reason: "canceled",
        }),
        org: { id: "org-1", name: "Client Org" },
        password: "password1",
        actorId: "actor-1",
        upsertOrgMembership: async () => {
          throw new Error("should not upsert canceled invite");
        },
      }),
    (error) =>
      error instanceof PortalInviteError &&
      error.code === "canceled"
  );
});

test("ready invite with missing org reports missing org", () => {
  assert.deepEqual(invitePublicState(invite(), null, null, now), {
    state: "missing_org",
  });
});

test("ready invite to confirmed account requires sign-in", () => {
  assert.deepEqual(
    invitePublicState(
      invite(),
      { id: "org-1", name: "Client Org" },
      { email_confirmed_at: "2026-09-01T12:00:00.000Z" },
      now
    ),
    {
      state: "ready",
      accountMode: "existing_confirmed",
    }
  );
});

test("ready invite to new or unconfirmed account allows password setup", () => {
  assert.deepEqual(
    invitePublicState(invite(), { id: "org-1", name: "Client Org" }, null, now),
    {
      state: "ready",
      accountMode: "password_setup",
    }
  );
});

test("admin invite to a new or unconfirmed user creates a pending invite", () => {
  assert.equal(inviteAdminActionForUser(null, null), "create_pending_invite");
  assert.equal(
    inviteAdminActionForUser({ email_confirmed_at: null, confirmed_at: null }, null),
    "create_pending_invite"
  );
});

test("admin invite to an existing confirmed user grants access immediately", () => {
  assert.equal(
    inviteAdminActionForUser(
      { id: "user-1", email_confirmed_at: "2026-09-07T12:00:00.000Z" },
      null
    ),
    "grant_existing_confirmed"
  );
});

test("admin invite to an existing active confirmed user is idempotent", () => {
  assert.equal(
    inviteAdminActionForUser(
      { id: "user-1", email_confirmed_at: "2026-09-07T12:00:00.000Z" },
      { id: "membership-1" }
    ),
    "already_active"
  );
});

test("existing-user access email points to reports without password setup copy", () => {
  const payload = portalAccessAddedEmailPayload({
    email: "client@example.com",
    org: { name: "Client Org" },
    role: "viewer",
    reportsUrl: "https://www.scoutclear.com/reports",
    from: "Scout <hello@scoutclear.com>",
    replyTo: "hello@scoutclear.com",
  });

  assert.equal(payload.to, "client@example.com");
  assert.equal(payload.subject, "SCOUT access added for Client Org");
  assert.match(payload.text, /You've been given Viewer access to Client Org\./);
  assert.match(payload.text, /Open Reports Portal: https:\/\/www\.scoutclear\.com\/reports/);
  assert.match(payload.html, new RegExp(`src="${PORTAL_EMAIL_LOGO_URL}"`));
  assert.match(payload.html, /alt="ScoutClear"/);
  assert.match(payload.html, /Open Reports Portal<\/a>/);
  assert.match(payload.html, /href="https:\/\/www\.scoutclear\.com\/reports"/);
  assert.doesNotMatch(payload.html, />SCOUT<\/div>/);
  assert.doesNotMatch(payload.text, /set up|set password|invite link/i);
  assert.doesNotMatch(payload.html, /set up|set password|invite link/i);
});

test("new-user invite email uses logo branding and preserves invite CTA", () => {
  const setupUrl = "https://www.scoutclear.com/accept-invite?token=test-token";
  const payload = portalInviteEmailPayload({
    email: "new@example.com",
    org: { name: "Client Org" },
    role: "field",
    setupUrl,
    from: "Scout <hello@scoutclear.com>",
    replyTo: "hello@scoutclear.com",
  });

  assert.equal(payload.to, "new@example.com");
  assert.equal(payload.subject, "You're invited to SCOUT");
  assert.match(payload.text, /Open your invite: https:\/\/www\.scoutclear\.com\/accept-invite\?token=test-token/);
  assert.match(payload.text, /This invite expires in 7 days\./);
  assert.match(payload.html, new RegExp(`src="${PORTAL_EMAIL_LOGO_URL}"`));
  assert.match(payload.html, /alt="ScoutClear"/);
  assert.match(payload.html, /Open SCOUT invite<\/a>/);
  assert.match(payload.html, /href="https:\/\/www\.scoutclear\.com\/accept-invite\?token=test-token"/);
  assert.doesNotMatch(payload.html, />SCOUT<\/div>/);
});

test("portal access emails render manager and owner role labels", () => {
  const managerInvite = portalInviteEmailPayload({
    email: "manager@example.com",
    org: { name: "Client Org" },
    role: "manager",
    setupUrl: "https://www.scoutclear.com/accept-invite?token=manager-token",
    from: "Scout <hello@scoutclear.com>",
    replyTo: "hello@scoutclear.com",
  });
  const ownerAccess = portalAccessAddedEmailPayload({
    email: "owner@example.com",
    org: { name: "Client Org" },
    role: "owner",
    reportsUrl: "https://www.scoutclear.com/reports",
    from: "Scout <hello@scoutclear.com>",
    replyTo: "hello@scoutclear.com",
  });

  assert.equal(managerInvite.subject, "You're invited to SCOUT");
  assert.match(managerInvite.text, /Access: Manager/);
  assert.match(managerInvite.html, /invited as a Manager for Client Org/);
  assert.equal(ownerAccess.subject, "SCOUT access added for Client Org");
  assert.match(ownerAccess.text, /You've been given Owner access to Client Org\./);
  assert.match(ownerAccess.html, /Owner access/);
});

test("invite password validation rejects short passwords", () => {
  assert.throws(
    () => validateInvitePassword("x".repeat(MIN_INVITE_PASSWORD_LENGTH - 1)),
    (error) =>
      error instanceof PortalInviteError &&
      error.code === "password_too_short"
  );
});
