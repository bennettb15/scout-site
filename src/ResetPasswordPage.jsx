import { useEffect, useMemo, useState } from "react";
import {
  exchangeRecoveryCode,
  hasSupabaseConfig,
  setRecoverySession,
  supabase,
  updateRecoveryPassword,
  verifyRecoveryTokenHash,
} from "./lib/supabaseClient";

const BRAND = {
  siteTitle: "Reset Password | SCOUT",
  brandNavy: "#1C2742",
  logos: {
    wordmarkOnly: "/Scout Only Logo Navy Dark NEW.png",
  },
};

const MIN_PASSWORD_LENGTH = 6;

function getRecoveryLinkValues() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  return {
    code: query.get("code"),
    tokenHash: query.get("token_hash") || hash.get("token_hash"),
    type: query.get("type") || hash.get("type"),
    accessToken: hash.get("access_token"),
    refreshToken: hash.get("refresh_token"),
    error:
      query.get("error_description") ||
      query.get("error") ||
      hash.get("error_description") ||
      hash.get("error"),
  };
}

export default function ResetPasswordPage() {
  const [linkStatus, setLinkStatus] = useState("checking");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    document.title = BRAND.siteTitle;
    document.documentElement.style.setProperty("--brand", BRAND.brandNavy);
    document.documentElement.style.setProperty("--brand-ink", "#23243A");
  }, []);

  useEffect(() => {
    let isActive = true;

    async function establishRecoverySession() {
      if (!hasSupabaseConfig || !supabase) {
        setLinkStatus("missing-config");
        return;
      }

      const {
        code,
        tokenHash,
        type,
        accessToken: hashAccessToken,
        refreshToken,
        error,
      } = getRecoveryLinkValues();

      if (error) {
        setLinkStatus("invalid");
        return;
      }

      try {
        let session = null;

        if (tokenHash) {
          if (type !== "recovery") {
            throw new Error("Unsupported recovery token type.");
          }
          session = await verifyRecoveryTokenHash(tokenHash);
        } else if (hashAccessToken && refreshToken) {
          session = await setRecoverySession(hashAccessToken, refreshToken);
        } else if (code) {
          session = await exchangeRecoveryCode(code);
        }

        if (!session?.access_token) {
          throw new Error("Missing recovery session.");
        }

        window.history.replaceState(null, "", "/reset-password");
        if (isActive) setLinkStatus("ready");
      } catch {
        if (isActive) setLinkStatus("invalid");
      }
    }

    const {
      data: { subscription },
    } = supabase?.auth.onAuthStateChange((event, session) => {
      if (!isActive || event !== "PASSWORD_RECOVERY") return;
      if (session?.access_token) {
        window.history.replaceState(null, "", "/reset-password");
        setLinkStatus("ready");
      }
    }) || { data: { subscription: null } };

    establishRecoverySession();

    return () => {
      isActive = false;
      subscription?.unsubscribe();
    };
  }, []);

  const canSubmit = useMemo(
    () =>
      newPassword.length >= MIN_PASSWORD_LENGTH &&
      confirmPassword.length >= MIN_PASSWORD_LENGTH &&
      newPassword === confirmPassword &&
      !isSubmitting,
    [newPassword, confirmPassword, isSubmitting]
  );

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");

    if (!newPassword || !confirmPassword) {
      setFormError("Enter and confirm your new password.");
      return;
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setFormError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    if (!hasSupabaseConfig || !supabase) {
      setLinkStatus("missing-config");
      return;
    }

    setIsSubmitting(true);
    try {
      await updateRecoveryPassword(newPassword);
      setLinkStatus("updated");
    } catch (error) {
      setFormError(error.message || "Unable to update your password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      style={{ "--brand": BRAND.brandNavy, "--brand-ink": "#23243A" }}
      className="min-h-screen bg-background text-foreground"
    >
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6">
          <a href="/" className="inline-flex items-center">
            <img
              src={BRAND.logos.wordmarkOnly}
              alt="SCOUT"
              className="h-10 w-auto object-contain md:h-11"
              loading="eager"
            />
          </a>
        </div>
      </header>

      <main className="relative isolate min-h-[calc(100vh-73px)] overflow-hidden">
        <img
          src="/hero-bg.jpg"
          alt=""
          className="absolute inset-0 -z-20 h-full w-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 -z-10 bg-white/86" />

        <section className="mx-auto flex min-h-[calc(100vh-73px)] w-full max-w-6xl items-center justify-center px-4 py-12 md:px-6">
          <div className="w-full max-w-2xl rounded-3xl border border-border bg-background/95 p-6 text-center shadow-sm backdrop-blur md:p-10">
            {linkStatus === "checking" && (
              <>
                <div className="mx-auto mb-5 h-12 w-12 animate-pulse rounded-2xl bg-[var(--brand)]" />
                <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                  Checking Reset Link
                </h1>
                <p className="mt-4 text-base leading-relaxed text-foreground/75 md:text-lg">
                  Please wait while we prepare your password reset.
                </p>
              </>
            )}

            {linkStatus === "missing-config" && (
              <MessageState
                icon="!"
                title="Password Reset Is Not Configured"
                body="This page needs the public ScoutCapture Supabase settings before password resets can be completed."
              />
            )}

            {linkStatus === "invalid" && (
              <MessageState
                icon="!"
                title="This password reset link is no longer valid."
                body="Return to ScoutCapture and request a new password reset email."
              />
            )}

            {linkStatus === "ready" && (
              <>
                <div className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand)] text-2xl font-semibold text-white">
                  <span aria-hidden="true">→</span>
                </div>

                <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                  Reset Password
                </h1>

                <p className="mt-4 text-base leading-relaxed text-foreground/75 md:text-lg">
                  Choose a new password for your ScoutCapture account.
                </p>

                <form
                  onSubmit={handleSubmit}
                  className="mx-auto mt-7 flex w-full max-w-md flex-col gap-4 text-left"
                >
                  <label className="grid gap-2 text-sm font-medium text-foreground">
                    New Password
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      className="h-12 rounded-xl border border-input bg-background px-4 text-base shadow-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-medium text-foreground">
                    Confirm Password
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      className="h-12 rounded-xl border border-input bg-background px-4 text-base shadow-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
                    />
                  </label>

                  {formError && (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-700">
                      {formError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="mt-1 inline-flex h-12 items-center justify-center rounded-xl bg-[var(--brand)] px-5 text-base font-semibold text-white shadow-sm transition hover:bg-[var(--brand)]/92 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {isSubmitting ? "Updating Password..." : "Update Password"}
                  </button>
                </form>
              </>
            )}

            {linkStatus === "updated" && (
              <MessageState
                icon="✓"
                title="Password Updated"
                body="Your ScoutCapture password has been updated successfully."
                secondaryBody="You can now return to ScoutCapture and sign in with your new password."
              />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function MessageState({ icon, title, body, secondaryBody }) {
  return (
    <>
      <div className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand)] text-2xl font-semibold text-white">
        <span aria-hidden="true">{icon}</span>
      </div>

      <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
        {title}
      </h1>

      <p className="mt-4 text-base leading-relaxed text-foreground/75 md:text-lg">
        {body}
      </p>

      {secondaryBody && (
        <p className="mt-3 text-base leading-relaxed text-foreground/75 md:text-lg">
          {secondaryBody}
        </p>
      )}
    </>
  );
}
