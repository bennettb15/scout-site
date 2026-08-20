import { useEffect } from "react";

const BRAND = {
  siteTitle: "Email Verified | SCOUT",
  brandNavy: "#1C2742",
  logos: {
    wordmarkOnly: "/Scout Only Logo Navy Dark NEW.png",
  },
};

export default function VerifiedEmailPage() {
  useEffect(() => {
    document.title = BRAND.siteTitle;
    document.documentElement.style.setProperty("--brand", BRAND.brandNavy);
    document.documentElement.style.setProperty("--brand-ink", "#23243A");
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
            <div className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand)] text-2xl font-semibold text-white">
              <span aria-hidden="true">✓</span>
            </div>

            <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Email Verified
            </h1>

            <p className="mt-4 text-base leading-relaxed text-foreground/75 md:text-lg">
              Your ScoutCapture account has been successfully verified.
            </p>

            <p className="mt-3 text-base leading-relaxed text-foreground/75 md:text-lg">
              You may now return to ScoutCapture and sign in using your email
              and password.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
