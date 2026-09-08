import { useEffect, useMemo, useState } from "react";
import {
  exchangeRecoveryCode,
  hasSupabaseConfig,
  setRecoverySession,
  supabase,
  updateRecoveryPassword,
  verifyEmailTokenHash,
} from "./lib/supabaseClient";

const BRAND = {
  siteTitle: "Client Portal Password | SCOUT",
  brandNavy: "#1C2742",
  logos: {
    wordmarkOnly: "/Scout Only Logo Navy Dark NEW.png",
  },
};

const MIN_PASSWORD_LENGTH = 6;
const REDIRECT_DELAY_MS = 700;

function getInviteTokenValue() {
  const query = new URLSearchParams(window.location.search);
  return query.get("token") || "";
}

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
  const isInvite = window.location.pathname === "/accept-invite";
  const inviteToken = isInvite ? getInviteTokenValue() : "";
  const isPortalInvite = Boolean(inviteToken);
  const [linkStatus, setLinkStatus] = useState("checking");
  const [inviteDetails, setInviteDetails] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const customInviteCopy = useMemo(() => {
    const orgName = inviteDetails?.org?.name || "this organization";
    const email = inviteDetails?.email || "the invited email";
    const accessLabel = inviteDetails?.accessLabel || "Client Portal";
    return {
      expired: {
        title: "This invite has expired.",
        body: "Ask your SCOUT contact for a new Client Portal invite.",
      },
      accepted: {
        title: "This invite was already accepted.",
        body: "Sign in to the SCOUT Client Portal with the account that accepted this invite.",
      },
      replaced: {
        title: "This invite was replaced.",
        body: "Use the newest SCOUT invite email or ask your SCOUT contact to send a fresh link.",
      },
      canceled: {
        title: "This invite was canceled.",
        body: "Ask your SCOUT contact for a new Client Portal invite.",
      },
      revoked: {
        title: "This invite is no longer active.",
        body: "Ask your SCOUT contact for a new Client Portal invite.",
      },
      invalid: {
        title: "This invite link is invalid.",
        body: "Check that the full link was copied, or ask your SCOUT contact for a new invite.",
      },
      missing_org: {
        title: "This invite is missing organization access.",
        body: "The invited organization is no longer active. Ask your SCOUT contact to resend access.",
      },
      wrong_email: {
        title: "You're signed in with the wrong account.",
        body: `This invite belongs to ${email}. Sign out, then open the invite again with that account.`,
      },
      sign_in: {
        title: `Sign in as ${email}`,
        body: `This ${accessLabel} invite for ${orgName} is tied to an existing portal account.`,
      },
      ready: {
        title: "Set up your SCOUT Client Portal account",
        body: `Create a password for ${email} to accept ${accessLabel} access to ${orgName}.`,
      },
      updated: {
        title: "Invite Accepted",
        body: "Your SCOUT Client Portal access is ready.",
      },
    };
  }, [inviteDetails]);

  const pageCopy = useMemo(
    () =>
      isInvite
        ? {
            checkingTitle: "Checking Invite Link",
            checkingBody: "Please wait while we prepare your Client Portal setup.",
            invalidTitle: "This invite link is no longer valid.",
            invalidBody: "Ask your SCOUT contact for a new Client Portal invite.",
            readyTitle: "Set your Client Portal password",
            readyBody: "Choose a password to finish setting up your report portal account.",
            button: "Set Password",
            submitting: "Setting Password...",
            updatedTitle: "Password Set",
            updatedBody: "Your Client Portal password is ready.",
          }
        : {
            checkingTitle: "Checking Reset Link",
            checkingBody: "Please wait while we prepare your password reset.",
            invalidTitle: "This password reset link is no longer valid.",
            invalidBody: "Request a new Client Portal password reset link.",
            readyTitle: "Reset Client Portal password",
            readyBody: "Choose a new password for your report portal account.",
            button: "Update Password",
            submitting: "Updating Password...",
            updatedTitle: "Password Updated",
            updatedBody: "Your Client Portal password has been updated.",
          },
    [isInvite]
  );

  async function acceptPortalInvite({ password, session }) {
    const response = await fetch("/api/portal-invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
      },
      body: JSON.stringify({
        token: inviteToken,
        ...(password ? { password } : {}),
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || "Unable to accept invite.");
      error.code = body.code;
      throw error;
    }
    return body;
  }

  async function finishAcceptedInvite(body, password) {
    if (password && body?.user?.email && hasSupabaseConfig && supabase) {
      await supabase.auth.signInWithPassword({
        email: body.user.email,
        password,
      });
    }
    setLinkStatus("updated");
    window.setTimeout(() => {
      window.location.assign("/reports");
    }, REDIRECT_DELAY_MS);
  }

  function applyInviteError(error) {
    const stateByCode = {
      already_accepted: "accepted",
      expired: "expired",
      invalid: "invalid",
      missing_org: "missing_org",
      canceled: "canceled",
      replaced: "replaced",
      revoked: "revoked",
      sign_in_required: "sign-in",
      wrong_email: "wrong-email",
    };
    const nextState = stateByCode[error?.code] || "";
    if (nextState) {
      setLinkStatus(nextState);
      return;
    }
    setFormError(error?.message || "Unable to accept invite.");
  }

  useEffect(() => {
    document.title = isInvite
      ? "Set Client Portal Password | SCOUT"
      : "Reset Client Portal Password | SCOUT";
    document.documentElement.style.setProperty("--brand", BRAND.brandNavy);
    document.documentElement.style.setProperty("--brand-ink", "#23243A");
  }, [isInvite]);

  useEffect(() => {
    let isActive = true;

    async function establishPortalInvite() {
      if (!hasSupabaseConfig || !supabase) {
        setLinkStatus("missing-config");
        return;
      }

      try {
        const response = await fetch(
          `/api/portal-invite?token=${encodeURIComponent(inviteToken)}`
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Unable to load invite.");
        if (!isActive) return;

        setInviteDetails(body);
        if (body.state !== "ready") {
          setLinkStatus(body.state === "accepted" ? "accepted" : body.state);
          return;
        }

        if (body.accountMode !== "existing_confirmed") {
          setLinkStatus("ready");
          return;
        }

        const { data } = await supabase.auth.getSession();
        const activeSession = data.session || null;
        const activeEmail = activeSession?.user?.email?.trim().toLowerCase() || "";
        if (!activeSession?.access_token) {
          setLinkStatus("sign-in");
          return;
        }
        if (activeEmail !== body.email) {
          setLinkStatus("wrong-email");
          return;
        }

        const accepted = await acceptPortalInvite({ session: activeSession });
        if (isActive) await finishAcceptedInvite(accepted);
      } catch (error) {
        if (!isActive) return;
        applyInviteError(error);
        if (!error?.code) setLinkStatus("invalid");
      }
    }

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
          const expectedType = isInvite ? "invite" : "recovery";
          const tokenType = type || expectedType;
          if (tokenType !== expectedType) {
            throw new Error("Unsupported password token type.");
          }
          session = await verifyEmailTokenHash(tokenHash, tokenType);
        } else if (hashAccessToken && refreshToken) {
          session = await setRecoverySession(hashAccessToken, refreshToken);
        } else if (code) {
          session = await exchangeRecoveryCode(code);
        }

        if (!session?.access_token) {
          throw new Error("Missing recovery session.");
        }

        window.history.replaceState(
          null,
          "",
          isInvite ? "/accept-invite" : "/reset-password"
        );
        if (isActive) setLinkStatus("ready");
    } catch {
        if (isActive) setLinkStatus("invalid");
      }
    }

    if (isPortalInvite) {
      establishPortalInvite();
      return () => {
        isActive = false;
      };
    }

    const {
      data: { subscription },
    } = supabase?.auth.onAuthStateChange((event, session) => {
      if (!isActive || !["PASSWORD_RECOVERY", "SIGNED_IN"].includes(event)) return;
      if (session?.access_token) {
        window.history.replaceState(
          null,
          "",
          isInvite ? "/accept-invite" : "/reset-password"
        );
        setLinkStatus("ready");
      }
    }) || { data: { subscription: null } };

    establishRecoverySession();

    return () => {
      isActive = false;
      subscription?.unsubscribe();
    };
  }, [isInvite, isPortalInvite, inviteToken]);

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
      if (isPortalInvite) {
        const body = await acceptPortalInvite({ password: newPassword });
        await finishAcceptedInvite(body, newPassword);
      } else {
        await updateRecoveryPassword(newPassword);
        setLinkStatus("updated");
        window.setTimeout(() => {
          window.location.assign("/reports");
        }, REDIRECT_DELAY_MS);
      }
    } catch (error) {
      if (isPortalInvite) {
        applyInviteError(error);
      } else {
        setFormError(error.message || "Unable to update your password.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleExistingInviteSignIn(event) {
    event.preventDefault();
    setFormError("");
    if (!signInPassword) {
      setFormError("Enter your portal password.");
      return;
    }
    if (!hasSupabaseConfig || !supabase) {
      setLinkStatus("missing-config");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: inviteDetails.email,
        password: signInPassword,
      });
      if (error) throw error;
      const body = await acceptPortalInvite({ session: data.session });
      await finishAcceptedInvite(body);
    } catch (error) {
      applyInviteError(error);
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
                  {pageCopy.checkingTitle}
                </h1>
                <p className="mt-4 text-base leading-relaxed text-foreground/75 md:text-lg">
                  {pageCopy.checkingBody}
                </p>
              </>
            )}

            {linkStatus === "missing-config" && (
              <MessageState
                icon="!"
                title="Client Portal Password Setup Is Not Configured"
                body="This page needs the public SCOUT portal settings before passwords can be completed."
              />
            )}

            {isPortalInvite &&
              ["invalid", "expired", "accepted", "replaced", "canceled", "revoked", "missing_org", "wrong-email"].includes(
                linkStatus
              ) && (
                <MessageState
                  icon="!"
                  title={customInviteCopy[linkStatus.replace("-", "_")]?.title}
                  body={customInviteCopy[linkStatus.replace("-", "_")]?.body}
                />
              )}

            {!isPortalInvite && linkStatus === "invalid" && (
              <MessageState
                icon="!"
                title={pageCopy.invalidTitle}
                body={pageCopy.invalidBody}
              />
            )}

            {isPortalInvite && linkStatus === "sign-in" && (
              <>
                <div className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand)] text-2xl font-semibold text-white">
                  <span aria-hidden="true">→</span>
                </div>

                <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                  {customInviteCopy.sign_in.title}
                </h1>

                <p className="mt-4 text-base leading-relaxed text-foreground/75 md:text-lg">
                  {customInviteCopy.sign_in.body}
                </p>

                <form
                  onSubmit={handleExistingInviteSignIn}
                  className="mx-auto mt-7 flex w-full max-w-md flex-col gap-4 text-left"
                >
                  <label className="grid gap-2 text-sm font-medium text-foreground">
                    Email
                    <input
                      type="email"
                      value={inviteDetails?.email || ""}
                      readOnly
                      className="h-12 rounded-xl border border-input bg-slate-50 px-4 text-base text-foreground/70 shadow-sm outline-none"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-medium text-foreground">
                    Password
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={signInPassword}
                      onChange={(event) => setSignInPassword(event.target.value)}
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
                    disabled={isSubmitting || !signInPassword}
                    className="mt-1 inline-flex h-12 items-center justify-center rounded-xl bg-[var(--brand)] px-5 text-base font-semibold text-white shadow-sm transition hover:bg-[var(--brand)]/92 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {isSubmitting ? "Accepting..." : "Sign In and Accept"}
                  </button>
                </form>
              </>
            )}

            {linkStatus === "ready" && (
              <>
                <div className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand)] text-2xl font-semibold text-white">
                  <span aria-hidden="true">→</span>
                </div>

                <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                  {isPortalInvite ? customInviteCopy.ready.title : pageCopy.readyTitle}
                </h1>

                <p className="mt-4 text-base leading-relaxed text-foreground/75 md:text-lg">
                  {isPortalInvite ? customInviteCopy.ready.body : pageCopy.readyBody}
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
                    {isSubmitting ? pageCopy.submitting : pageCopy.button}
                  </button>
                </form>
              </>
            )}

            {linkStatus === "updated" && (
              <MessageState
                icon="✓"
                title={pageCopy.updatedTitle}
                body={pageCopy.updatedBody}
                secondaryBody="Opening your reports..."
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
