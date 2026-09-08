import assert from "node:assert/strict";
import test from "node:test";
import {
  MIN_INVITE_PASSWORD_LENGTH,
  PortalInviteError,
  createInviteToken,
  hashInviteToken,
  invitePublicState,
  portalInviteStatus,
  validateInvitePassword,
} from "../api-lib/portalInvites.js";

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

test("invite password validation rejects short passwords", () => {
  assert.throws(
    () => validateInvitePassword("x".repeat(MIN_INVITE_PASSWORD_LENGTH - 1)),
    (error) =>
      error instanceof PortalInviteError &&
      error.code === "password_too_short"
  );
});
