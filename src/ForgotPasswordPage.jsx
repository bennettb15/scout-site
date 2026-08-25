import { useEffect, useMemo, useState } from "react";
import { requestPasswordReset, hasSupabaseConfig, supabase } from "./lib/supabaseClient";

const BRAND = {
  siteTitle: "Forgot Password | SCOUT",
  brandNavy: "#1C2742",
  logos: {
    wordmarkOnly: "/Scout Only Logo Navy Dark NEW.png",
  },
};

function resetRedirectUrl() {
  return `${window.location.origin}/reset-password`;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = BRAND.siteTitle;
    document.documentElement.style.setProperty("--brand", BRAND.brandNavy);
    document.documentElement.style.setProperty("--brand-ink", "#23243A");
  }, []);

  const canSubmit = useMemo(
    () => email.trim().length > 3 && status !== "submitting",
    [email, status]
  );

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!hasSupabaseConfig || !supabase) {
      setError("Client Portal password reset is not configured.");
      return;
    }

    setStatus("submitting");
    try {
      await requestPasswordReset(email.trim(), resetRedirectUrl());
      setStatus("sent");
    } catch (requestError) {
      setStatus("idle");
      setError(requestError.message || "Unable to send password reset link.");
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
          <a
            href="/reports"
            className="text-sm font-semibold text-[var(--brand)] hover:underline"
          >
            Back to Reports
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
          <div className="w-full max-w-xl rounded-3xl border border-border bg-background/95 p-6 text-center shadow-sm backdrop-blur md:p-10">
            <div className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand)] text-2xl font-semibold text-white">
              <span aria-hidden="true">→</span>
            </div>

            <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Reset Client Portal password
            </h1>

            {status === "sent" ? (
              <>
                <p className="mt-4 text-base leading-relaxed text-foreground/75 md:text-lg">
                  If that email has Client Portal access, a reset link is on the way.
                </p>
                <p className="mt-3 text-base leading-relaxed text-foreground/75 md:text-lg">
                  Open the link on this device to choose a new password.
                </p>
                <a
                  href="/reports"
                  className="mt-7 inline-flex h-12 items-center justify-center rounded-xl bg-[var(--brand)] px-5 text-base font-semibold text-white shadow-sm transition hover:bg-[var(--brand)]/92"
                >
                  Return to Reports
                </a>
              </>
            ) : (
              <>
                <p className="mt-4 text-base leading-relaxed text-foreground/75 md:text-lg">
                  Enter the email you use for the SCOUT Client Portal.
                </p>

                <form
                  onSubmit={handleSubmit}
                  className="mx-auto mt-7 flex w-full max-w-md flex-col gap-4 text-left"
                >
                  <label className="grid gap-2 text-sm font-medium text-foreground">
                    Email
                    <input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="h-12 rounded-xl border border-input bg-background px-4 text-base shadow-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
                    />
                  </label>

                  {error && (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-700">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--brand)] px-5 text-base font-semibold text-white shadow-sm transition hover:bg-[var(--brand)]/92 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {status === "submitting" ? "Sending..." : "Send Reset Link"}
                  </button>
                </form>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
