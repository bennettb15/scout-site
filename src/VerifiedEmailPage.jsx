import { useEffect, useState } from "react";
import {
  configuredSupabaseUrl,
  hasSupabaseConfig,
  setRecoverySession,
  supabase,
} from "./lib/supabaseClient";
import {
  EMAIL_VERIFICATION_TYPES,
  hasVerificationCallback,
  safeSupabaseConfirmationUrl,
  verificationLinkValuesFromUrl,
} from "./lib/verificationCallback";

const BRAND = {
  siteTitle: "Email Verified | SCOUT",
  brandNavy: "#1C2742",
  logos: {
    wordmarkOnly: "/Scout Only Logo Navy Dark NEW.png",
  },
};

function getVerificationLinkValues() {
  return verificationLinkValuesFromUrl(window.location.href);
}

export default function VerifiedEmailPage() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    document.title = BRAND.siteTitle;
    document.documentElement.style.setProperty("--brand", BRAND.brandNavy);
    document.documentElement.style.setProperty("--brand-ink", "#23243A");
  }, []);

  useEffect(() => {
    let isActive = true;
    const linkValues = getVerificationLinkValues();
    const hasCallback = hasVerificationCallback(linkValues);
    const confirmationUrl = safeSupabaseConfirmationUrl(
      linkValues.confirmationUrl,
      configuredSupabaseUrl
    );

    async function verifyEmailLink() {
      if (linkValues.error) {
        setStatus("invalid");
        return;
      }

      if (linkValues.confirmationUrl) {
        setStatus(confirmationUrl ? "confirm-action" : "invalid");
        return;
      }

      if (!hasCallback) {
        setStatus("required");
        return;
      }

      if (!hasSupabaseConfig || !supabase) {
        setStatus("missing-config");
        return;
      }

      try {
        if (linkValues.tokenHash) {
          const tokenType = linkValues.type || "email";
          if (!EMAIL_VERIFICATION_TYPES.has(tokenType)) {
            throw new Error("Unsupported verification token type.");
          }

          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: linkValues.tokenHash,
            type: tokenType,
          });
          if (error) throw error;
          if (!data?.session && !data?.user) {
            throw new Error("Verification did not return a user.");
          }
        } else if (linkValues.accessToken && linkValues.refreshToken) {
          const session = await setRecoverySession(
            linkValues.accessToken,
            linkValues.refreshToken
          );
          if (!session?.access_token) {
            throw new Error("Verification did not return a session.");
          }
        } else if (linkValues.code) {
          // ScoutCapture starts signup in the native Swift client, whose PKCE
          // verifier is not available to this browser callback. Reaching
          // /verified with a code means Supabase already accepted the email
          // confirmation link, so show success and let the user sign in there.
        }

        window.history.replaceState(null, "", "/verified");
        if (isActive) setStatus("success");
      } catch {
        if (isActive) setStatus("invalid");
      }
    }

    const {
      data: { subscription },
    } = supabase?.auth.onAuthStateChange((event, session) => {
      if (!isActive || !hasCallback || event !== "SIGNED_IN") return;
      if (session?.access_token) {
        window.history.replaceState(null, "", "/verified");
        setStatus("success");
      }
    }) || { data: { subscription: null } };

    verifyEmailLink();

    return () => {
      isActive = false;
      subscription?.unsubscribe();
    };
  }, []);

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
            {status === "checking" && (
              <>
                <div className="mx-auto mb-5 h-12 w-12 animate-pulse rounded-2xl bg-[var(--brand)]" />
                <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                  Checking Verification Link
                </h1>
                <p className="mt-4 text-base leading-relaxed text-foreground/75 md:text-lg">
                  Please wait while we confirm your email verification link.
                </p>
              </>
            )}

            {status === "confirm-action" && (
              <MessageState
                icon="→"
                title="Verify your email"
                body="Confirm this email address to finish creating your ScoutCapture account."
                secondaryBody="After verification, return to ScoutCapture and sign in with your email and password."
                actionHref={confirmationUrl}
                actionLabel="Verify Email"
              />
            )}

            {status === "success" && (
              <MessageState
                icon="✓"
                title="Email verified"
                body="Your ScoutCapture account has been successfully verified."
                secondaryBody="You may now return to ScoutCapture and sign in using your email and password."
              />
            )}

            {status === "required" && (
              <MessageState
                icon="→"
                title="Verification link required"
                body="Please open the verification link from your email."
              />
            )}

            {status === "invalid" && (
              <MessageState
                icon="!"
                title="Verification link expired or invalid"
                body="Request a new verification email from ScoutCapture."
              />
            )}

            {status === "missing-config" && (
              <MessageState
                icon="!"
                title="Verification cannot be checked"
                body="This page needs the public SCOUT auth settings before email verification can be completed."
              />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function MessageState({ icon, title, body, secondaryBody, actionHref, actionLabel }) {
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

      {actionHref && (
        <a
          href={actionHref}
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--brand)]/90"
        >
          {actionLabel}
        </a>
      )}
    </>
  );
}
