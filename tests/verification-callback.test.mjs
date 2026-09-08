import assert from "node:assert/strict";
import test from "node:test";
import {
  hasVerificationCallback,
  safeSupabaseConfirmationUrl,
  verificationLinkValuesFromUrl,
} from "../src/lib/verificationCallback.js";

test("parses token hash verification links from query strings", () => {
  const values = verificationLinkValuesFromUrl(
    "https://www.scoutclear.com/verified?token_hash=abc123&type=email"
  );

  assert.equal(values.tokenHash, "abc123");
  assert.equal(values.type, "email");
  assert.equal(hasVerificationCallback(values), true);
});

test("parses Supabase code callbacks as valid verification callbacks", () => {
  const values = verificationLinkValuesFromUrl(
    "https://www.scoutclear.com/verified?code=auth-code"
  );

  assert.equal(values.code, "auth-code");
  assert.equal(hasVerificationCallback(values), true);
});

test("allows wrapped Supabase confirmation URLs for the configured project", () => {
  const confirmationUrl =
    "https://project-ref.supabase.co/auth/v1/verify?token=token-value&type=email&redirect_to=https%3A%2F%2Fwww.scoutclear.com%2Fverified";

  assert.equal(
    safeSupabaseConfirmationUrl(
      confirmationUrl,
      "https://project-ref.supabase.co"
    ),
    confirmationUrl
  );
});

test("reconstructs documented wrapped confirmation URLs with loose nested query params", () => {
  const values = verificationLinkValuesFromUrl(
    "https://www.scoutclear.com/verified?confirmation_url=https://project-ref.supabase.co/auth/v1/verify?token=token-value&type=email&redirect_to=https%3A%2F%2Fwww.scoutclear.com%2Fverified"
  );

  assert.equal(
    values.confirmationUrl,
    "https://project-ref.supabase.co/auth/v1/verify?token=token-value&type=email&redirect_to=https%3A%2F%2Fwww.scoutclear.com%2Fverified"
  );
});

test("rejects wrapped confirmation URLs for other hosts", () => {
  const confirmationUrl =
    "https://attacker.example/auth/v1/verify?token=token-value&type=email";

  assert.equal(
    safeSupabaseConfirmationUrl(
      confirmationUrl,
      "https://project-ref.supabase.co"
    ),
    ""
  );
});

test("rejects wrapped confirmation URLs without a verification token", () => {
  const confirmationUrl = "https://project-ref.supabase.co/auth/v1/verify?type=email";

  assert.equal(
    safeSupabaseConfirmationUrl(
      confirmationUrl,
      "https://project-ref.supabase.co"
    ),
    ""
  );
});
