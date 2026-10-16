import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Camera,
  ShieldCheck,
  ClipboardList,
  MapPin,
  CheckCircle2,
  ArrowRight,
  FileText,
  Building2,
  Home,
  KeyRound,
  Search,
  Phone,
  Mail,
  Download,
  Menu,
} from "lucide-react";

// If your project has shadcn/ui, these imports will work.
// If not, replace with your own components or simple div/button elements.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";


/**
 * SCOUT - Marketing Website (React)
 * Updated to:
 * - Use your uploaded logos (icon+wordmark header, full lockup hero, icon+wordmark footer)
 * - Apply a brand color system based on your navy logo
 *
 * IMPORTANT:
 * Put the three logo PNGs in your web app's /public folder.
 */

const BRAND = {
  name: "SCOUT",
  tagline: "Observe & Report",
  descriptor: "Property documentation service and software",
  siteTitle: "SCOUT | Property Documentation Service & Software",

  // Matched to your navy mark
  brandNavy: "#1C2742",

  // Logo assets (from /public)
  logos: {
    lockupWithTagline: "/Scout Only Logo Navy Dark NEW.png",
    wordmarkOnly: "/Scout Only Logo Navy Dark NEW.png",
    wordmarkWhite: "/Scout Only Logo White.png",
    iconOnly: "/favicon-navy.png",
  },

  serviceArea: "Columbus, Ohio and surrounding areas",
  phone: "(614) 321-9845",
  email: "hello@scoutclear.com",
  ctaPrimary: "Contact SCOUT",
  ctaSecondary: "See How It Works",

};

const CONTACT_INTEREST_OHIO = "Ohio documentation service";
const CONTACT_INTEREST_SOFTWARE = "Scout Capture software";
const SCOUT_CAPTURE_APP_STORE_URL = "https://apps.apple.com/us/app/scout-capture-by-scout/id6761496506";

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0 },
};

const Section = ({ id, eyebrow, title, subtitle, children, className = "", invert = false }) => (
  <div id={id} className={`scroll-mt-32`}>
    <section className={`py-8 md:py-10 ${className}`}>


    <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
      <div className="mb-5 md:mb-6">
        {eyebrow ? (
          <div className="mb-3"> {/*flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />*/}
            <p
  className={`text-sm font-medium tracking-wide ${
    invert ? "text-white/80" : "text-current/80"
  }`}
>
  {eyebrow}
</p>
          </div>
        ) : null}
        <h2
  className={`text-2xl font-semibold tracking-tight md:text-3xl ${
    invert ? "text-white" : "text-current"
  }`}
>
  {title}
</h2>
        {subtitle ? (
  <p
    className={`mt-3 max-w-3xl text-base leading-relaxed ${
      invert ? "text-white/85" : "text-current/80"
    }`}
  >
    {subtitle}
  </p>
) : null}



      </div>
            {children}
    </div>
  </section>
  </div>
);


const Pill = ({ icon: Icon, children, className = "" }) => (
  <div
    className={
      "inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-sm text-foreground/80 shadow-sm " +
      className
    }
  >
    <span className="inline-flex h-4 w-4 items-center justify-center flex-shrink-0">
      <Icon className="h-4 w-4 text-[var(--brand)]" />
    </span>
    <span>{children}</span>
  </div>
);


const NavLink = ({ href, children, onClick }) => (
  <a
    href={href}
    onClick={onClick}
    className="text-sm font-medium text-foreground/80 hover:text-[var(--brand)] transition-colors"
  >
    {children}
  </a>
);

const FAQItem = ({ q, a }) => (
  <details className="group border-b border-border py-4">
    <summary className="cursor-pointer list-none text-base font-medium tracking-tight">
      <div className="flex items-start justify-between gap-4">
        <span>{q}</span>
        <span className="mt-0.5 text-foreground/60 group-open:rotate-180 transition-transform">
          ▾
        </span>
      </div>
    </summary>
    <div className="mt-3 text-sm leading-relaxed text-foreground/70">{a}</div>
  </details>
);


export default function ScoutMarketingSite() {

const [mobileOpen, setMobileOpen] = useState(false);

function scrollToSection(href) {
  // Close the menu if it’s open (mobile)
  setMobileOpen(false);

  // Wait for the Sheet close animation / scroll lock to finish
  setTimeout(() => {
    const id = href?.replace("#", "");
const el = document.getElementById(id);
if (!el) return;

function doScroll(behavior = "auto") {
  const header = document.querySelector(".sticky.top-0");
  const offset = header ? header.getBoundingClientRect().height : 0;

  const top = window.scrollY + el.getBoundingClientRect().top - offset - 24;
  window.scrollTo({ top, behavior });
}

// 1) initial scroll
doScroll("smooth");



// 2) correction scroll after layout settles:
// If we’re already close, use smooth; if we’re far off, use auto (prevents weird mobile interruptions)
setTimeout(() => {
  const header = document.querySelector(".sticky.top-0");
  const offset = header ? header.getBoundingClientRect().height : 0;
  const correctedTop = window.scrollY + el.getBoundingClientRect().top - offset - 24;

  const diff = Math.abs(window.scrollY - correctedTop);

  const behavior = diff <= 120 ? "smooth" : "auto";
  doScroll(behavior);
}, 350);





  }, 450);
}




useEffect(() => {
  document.title = BRAND.siteTitle;
  document.documentElement.style.setProperty("--brand", BRAND.brandNavy);
  document.documentElement.style.setProperty("--brand-ink", "#23243A");
}, []);




  const brandStyle = {
    "--brand": BRAND.brandNavy,
    "--brand-ink": "#23243A",
  };

  const [form, setForm] = useState({
  interest: [],
  name: "",
  company: "",
  email: "",
  phone: "",
  propertyAddress: "",
  message: "",
  website: "", // honeypot anti-spam (keep blank)
});

const [status, setStatus] = useState("idle");
const [interestError, setInterestError] = useState(false);
// idle | sending | success | error

function openContactFor(interest) {
  setInterestError(false);
  setStatus("idle");
  setForm((p) => ({
    ...p,
    interest: [interest],
    propertyAddress: interest === CONTACT_INTEREST_OHIO ? p.propertyAddress : "",
  }));
  scrollToSection("#contact");
}

// ✅ THIS IS 15C — PUT IT RIGHT HERE
async function handleContactSubmit(e) {
  e.preventDefault();
  if (status === "sending") return;
  if (form.interest.length === 0) {
    setInterestError(true);
    return;
  }
  setInterestError(false);
  setStatus("sending");

  try {
    const payload = {
      interest: form.interest.join(", "),
      name: form.name,
      company: form.company,
      email: form.email,
      phone: form.phone,
      propertyAddress: form.propertyAddress,
      message: form.message,
      website: form.website,
    };

    const resp = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) throw new Error("Failed");

    setStatus("success");
    setForm({
      interest: [],
      name: "",
      company: "",
      email: "",
      phone: "",
      propertyAddress: "",
      message: "",
      website: "",
    });
  } catch {
    setStatus("error");
  }
}



   const nav = [
  { label: "Scout Capture", href: "#software" },
  { label: "Value", href: "#value" },
  { label: "Ohio service", href: "#services" },
  { label: "Ohio process", href: "#how" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
];


  return (
    <div style={brandStyle} className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <div className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
<a href="#top" className="flex items-center gap-2">
  <div className="leading-tight">
    <img
      src={BRAND.logos.lockupWithTagline}
      alt="SCOUT"
      className="h-10 w-auto object-contain md:h-11"
      loading="eager"
    />
  </div>
</a>
{/* Desktop nav */}
          <nav className="hidden items-center gap-5 md:flex">
  {nav.map((n) => (
    <NavLink
      key={n.href}
      href={n.href}
      onClick={(e) => {
        e.preventDefault();
        scrollToSection(n.href);
      }}
    >
      {n.label}
    </NavLink>
  ))}
</nav>

          {/* Mobile nav */}
<div className="md:hidden">
  <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
    <SheetTrigger asChild>
      <Button variant="outline" className="rounded-2xl">
        <Menu className="h-5 w-5" />
      </Button>
    </SheetTrigger>

    <SheetContent
  side="right"
  className="w-[320px] sm:w-[360px]"
>

      <SheetHeader>
        <SheetTitle>Menu</SheetTitle>
      </SheetHeader>

      <div className="mt-6 flex flex-col gap-2">
        {nav.map((n) => (
          <button
            key={n.href}
            onClick={() => scrollToSection(n.href)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-left text-sm font-medium text-foreground/80 hover:border-[var(--brand)] hover:text-foreground"
          >
            {n.label}
          </button>
        ))}

        <div className="mt-4 grid gap-2">
          <Button
            className="w-full rounded-2xl bg-[var(--brand)] text-white hover:brightness-110"

            onClick={() => scrollToSection("#contact")}
          >
            {BRAND.ctaPrimary}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            className="rounded-2xl hover:border-[var(--brand)]"
            asChild
          >
            <a href="/reports">Client Portal</a>
          </Button>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="rounded-2xl hover:border-[var(--brand)]"
              asChild
            >
              <a href="/reports">Client Portal</a>
            </Button>
            <Button
              className="hidden rounded-2xl bg-[var(--brand)] text-white hover:opacity-90 md:inline-flex"
              onClick={() => scrollToSection("#contact")}

            >
              {BRAND.ctaPrimary}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Hero */}
      <header id="top" className="scroll-mt-20 bg-[#f6f7fa]">
        <div className="mx-auto grid w-full max-w-6xl md:min-h-[570px] md:grid-cols-2">
          <div className="flex flex-col justify-center px-4 py-14 md:px-6 md:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Property documentation, made clear</p>
            <h1 className="mt-5 max-w-[580px] text-4xl font-semibold leading-[1.06] tracking-tight text-[var(--brand)] md:text-[clamp(3.2rem,4.5vw,4.6rem)]">
              A clearer view of every property.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-foreground/70">
              Capture conditions in the field. Keep photos, notes, and reports together so your team can see what matters next.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <Button className="h-12 rounded-full bg-[var(--brand)] px-6 text-white hover:opacity-90" onClick={() => scrollToSection("#software")}>
                Explore Scout Capture <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <button type="button" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand)] hover:underline" onClick={() => scrollToSection("#services")}>
                Explore Ohio service <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-11 grid gap-5 border-t border-[var(--brand)]/15 pt-6 text-sm leading-relaxed text-foreground/70 sm:grid-cols-2">
              <p><strong className="block font-semibold text-[var(--brand)]">Your team captures</strong> Use Scout Capture nationwide.</p>
              <p><strong className="block font-semibold text-[var(--brand)]">SCOUT visits</strong> On-site documentation in Ohio.</p>
            </div>
          </div>
          <div className="relative min-h-[300px] overflow-hidden md:min-h-full">
            <img src="/hero-bg.jpg" alt="Commercial property at dusk" className="absolute inset-0 h-full w-full object-cover" loading="eager" />
          </div>
        </div>
      </header>

      <Section
        id="software"
        eyebrow="Scout Capture software · U.S."
        title="Property documentation handled by your team"
        subtitle="Capture site conditions, keep field photos organized, and give your team a clear record to work from."
      >
        <div className="grid gap-8 border-y border-border py-7 md:grid-cols-3 md:gap-10">
          <div>
            <span className="text-sm font-semibold text-[var(--brand)]">01 / Document</span>
            <h3 className="mt-3 text-lg font-semibold">Full documentation</h3>
            <p className="mt-2 text-sm leading-relaxed text-foreground/70">Follow guided interior and exterior photos for a consistent property record.</p>
          </div>
          <div>
            <span className="text-sm font-semibold text-[var(--brand)]">02 / Flag</span>
            <h3 className="mt-3 text-lg font-semibold">Punch list visits</h3>
            <p className="mt-2 text-sm leading-relaxed text-foreground/70">Flag issues with photos and notes, then organize them by priority and trade.</p>
          </div>
          <div>
            <span className="text-sm font-semibold text-[var(--brand)]">03 / Share</span>
            <h3 className="mt-3 text-lg font-semibold">Reports for the team</h3>
            <p className="mt-2 text-sm leading-relaxed text-foreground/70">Share completed reports, photos, and punch list items through the Reports Portal.</p>
          </div>
        </div>
        <div className="mt-6 rounded-3xl border border-border bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-4">
                <img
                  src="/scout-capture-app-icon.png"
                  alt="Scout Capture app icon"
                  className="h-16 w-16 rounded-2xl shadow-sm"
                  loading="lazy"
                />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground/60">Available on the App Store</p>
                  <h3 className="mt-1 text-xl font-semibold tracking-tight">Scout Capture for iPhone</h3>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-foreground/70">
                Take the field workflow with you, then upload completed sessions for your team to review.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <a
                  href={SCOUT_CAPTURE_APP_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Download Scout Capture on the App Store"
                  className="inline-flex min-h-11 items-center"
                >
                  <img src="/download-on-the-app-store.svg" alt="Download on the App Store" width="150" height="50" />
                </a>
                <Button variant="outline" className="min-h-11 rounded-2xl" onClick={() => openContactFor(CONTACT_INTEREST_SOFTWARE)}>Ask about access</Button>
              </div>
              <p className="mt-3 text-sm text-foreground/60">An invitation from your organization is required to sign in.</p>
            </div>
            <a
              href={SCOUT_CAPTURE_APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden shrink-0 text-center sm:block"
              aria-label="Open Scout Capture on the App Store"
            >
              <img
                src="/scout-capture-app-store-qr.jpg"
                alt="QR code for Scout Capture on the App Store"
                className="mx-auto h-32 w-32 rounded-xl border border-border"
                loading="lazy"
              />
              <span className="mt-2 block text-xs font-medium text-foreground/60">Scan to get the app</span>
            </a>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-foreground/70">Organizations may use the software for documentation or other work they are authorized to perform, including inspections. Each organization is responsible for its work, licenses, and customer agreements. Software access does not include an on-site SCOUT visit.</p>
      </Section>

      <section id="value" className="scroll-mt-32 bg-[var(--brand)] py-11 text-white md:py-14">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 md:grid-cols-[1fr_1.1fr] md:items-center md:gap-12 md:px-6">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">A useful record when questions come up.</h2>
          <p className="text-base leading-relaxed text-white/80">Dated photos and notes make prior conditions easier to reference, share, and compare over time.</p>
        </div>
      </section>

      <Section
        id="services"
        eyebrow="On-site service · Ohio"
        title="Visual documentation handled by SCOUT"
        subtitle="We document agreed, accessible areas in Ohio and deliver a time-stamped record your team can share or compare over time."
        /*className="py-10 md:py-14"*/
      >
        <div className="grid gap-10 lg:grid-cols-2 lg:items-stretch lg:gap-16">
          <div className="flex flex-col rounded-3xl bg-[var(--brand)]/5 p-6 md:p-8">
            <h3 className="text-xl font-semibold">What you receive</h3>
            <p className="mt-3 text-sm leading-relaxed text-foreground/70">
              Time-stamped photos and an indexed PDF report with observations, scope, and limitations—ready for your team to file, share, and revisit.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-foreground/70">
              Schedule one visit or a recurring series. Ask about comparisons, after-storm documentation, or other property-specific needs.
            </p>
            <div className="mt-auto pt-6">
              <Button className="rounded-2xl bg-[var(--brand)] text-white hover:opacity-90" onClick={() => openContactFor(CONTACT_INTEREST_OHIO)}>Discuss an Ohio visit</Button>
            </div>
          </div>
          <div className="divide-y divide-border border-y border-border">
            <div className="flex gap-4 py-5">
              <Building2 className="mt-1 h-6 w-6 shrink-0 text-[var(--brand)]" aria-hidden="true" />
              <div>
                <h3 className="font-semibold">Commercial exteriors</h3>
                <p className="mt-1 text-sm leading-relaxed text-foreground/70">Elevations, entries, rooflines, and key site features from accessible vantage points.</p>
              </div>
            </div>
            <div className="flex gap-4 py-5">
              <Home className="mt-1 h-6 w-6 shrink-0 text-[var(--brand)]" aria-hidden="true" />
              <div>
                <h3 className="font-semibold">Multifamily & HOA</h3>
                <p className="mt-1 text-sm leading-relaxed text-foreground/70">Common areas, exteriors, and amenities documented consistently across visits.</p>
              </div>
            </div>
            <div className="flex gap-4 py-5">
              <KeyRound className="mt-1 h-6 w-6 shrink-0 text-[var(--brand)]" aria-hidden="true" />
              <div>
                <h3 className="font-semibold">Tenant turnovers</h3>
                <p className="mt-1 text-sm leading-relaxed text-foreground/70">A visual baseline for move-in, move-out, and follow-up.</p>
              </div>
            </div>
          </div>
        </div>
      </Section>


      <Section
        id="how"
        eyebrow="Ohio service process"
        title="A simple workflow that produces consistent records"
        subtitle="We aim for clarity and repeatability. The same structure is used for each visit so differences over time are obvious."
       /*className="py-10 md:py-14"*/
      >
        <div className="grid gap-8 md:grid-cols-3 md:gap-6">
          <div>
            <img src="/process-scope.jpg" alt="Reviewing property photos on a tablet" className="aspect-[16/10] w-full object-cover" loading="lazy" />
            <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-[var(--brand)]">01 / Plan</p>
            <h3 className="mt-2 text-lg font-semibold">Scope & schedule</h3>
            <p className="mt-2 text-sm leading-relaxed text-foreground/70">We confirm access, coverage, and timing before the visit.</p>
          </div>
          <div>
            <img src="/process-document.jpg" alt="Documenting a property on site" className="aspect-[16/10] w-full object-cover" loading="lazy" />
            <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-[var(--brand)]">02 / Capture</p>
            <h3 className="mt-2 text-lg font-semibold">Document on site</h3>
            <p className="mt-2 text-sm leading-relaxed text-foreground/70">We capture observable conditions with consistent framing and timestamps.</p>
          </div>
          <div>
            <img src="/process-deliver.jpg" alt="Reviewing a property report" className="aspect-[16/10] w-full object-cover" loading="lazy" />
            <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-[var(--brand)]">03 / Deliver</p>
            <h3 className="mt-2 text-lg font-semibold">Put the record to work</h3>
            <p className="mt-2 text-sm leading-relaxed text-foreground/70">Receive an organized PDF and photo set ready to share and revisit.</p>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-border bg-[var(--brand)]/5 p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <h3 className="text-xl font-semibold tracking-tight">
                Documentation scope
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground/70">
                SCOUT documents observable property features as they appear at the time of service. 
                Deliverables are visual records intended for reference and comparison, not evaluation.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
  href="/scout-sample-report.pdf"
  target="_blank"
  rel="noopener noreferrer"
  className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-border bg-background px-4 text-sm font-medium text-foreground/80 shadow-sm hover:text-foreground hover:border-[var(--brand)]"
>
  <Download className="h-4 w-4 text-[var(--brand)]" />
  Download sample report (PDF)
</a>
              <Button className="h-11 rounded-2xl bg-[var(--brand)] text-white hover:opacity-90"
                onClick={() => openContactFor(CONTACT_INTEREST_OHIO)}

              >
                Get a quote
              </Button>
            </div>
          </div>
        </div>
      </Section>


      <Section
        id="faq"
        eyebrow="FAQ"
        title="Answers to the questions clients ask first"
        subtitle="Questions about the Ohio service or Scout Capture? Contact us and we’ll respond."
      >
        <div className="grid gap-x-10 md:grid-cols-2">
          <FAQItem
            q="Is SCOUT a home or property inspection service?"
            a="SCOUT's Ohio service provides photographic documentation of agreed, accessible areas and may flag visible conditions factually. It does not include testing, measurements, diagnoses, or repair recommendations."
          />
          <FAQItem
            q="Can my company use Scout Capture for its own inspections?"
            a="Yes, if your organization is authorized to perform that work. Your company controls its fieldwork, findings, reports, licensing, and customer agreements. SCOUT provides the software; it does not perform or approve your inspection."
          />
          <FAQItem
            q="Where are the two offerings available?"
            a="SCOUT's on-site documentation service is offered in Ohio, currently focused on the Columbus area. Scout Capture software is for organizations in the United States."
          />
          <FAQItem
            q="What do you mean by ‘observable notes’?"
            a="We describe what is visible in the moment (e.g., ‘crack observed in masonry at main entry’). We avoid conclusions about cause, severity, or required repairs."
          />
          <FAQItem
            q="How do you prevent photo counts from ballooning on complex buildings?"
            a="We use a structured indexing approach: wide context photos for each elevation/zone, then detail photos only where warranted. This preserves clarity without unnecessary duplication."
          />
          <FAQItem
            q="Can you compare this visit to a prior report?"
            a="Yes. For recurring clients, we can note ‘visual change observed from prior documentation’ or ‘no visible change observed,’ based solely on what is visible in the photos and reasonably accessible areas."
          />
          <FAQItem
            q="Do you go on roofs or enter restricted areas?"
            a="Only if access is explicitly provided and it is safe and reasonably accessible. Otherwise, documentation is limited to accessible vantage points."
          />
          <FAQItem
            q="How fast do you deliver Ohio service records?"
            a="Typical turnaround is 24-72 hours depending on scope and photo volume. Priority turnaround is available for time-sensitive situations."
          />
        </div>
      </Section>
<div id="contact" className="bg-[var(--brand)] scroll-mt-24">
  <Section
    invert

    className="py-16 md:py-20"
    eyebrow="Contact"
    title="Ask about Scout Capture or the Ohio service"
    subtitle="Tell us how your team would use the app, or what Ohio property you need documented."
      >
        <div className="grid gap-4 md:grid-cols-5">
          <Card className="rounded-3xl shadow-sm md:col-span-3">
            <CardHeader>
              <CardTitle className="text-lg">Contact form</CardTitle>

            </CardHeader>
<CardContent>
  <form onSubmit={handleContactSubmit}>
    {/* Honeypot field (anti-spam) */}
    <input
      type="text"
      value={form.website}
onChange={(e) => {
   if (status === "success" || status === "error") setStatus("idle");
  setForm((p) => ({ ...p, website: e.target.value }));
}}


      className="hidden"
      tabIndex={-1}
      autoComplete="off"
    />

    <div className="grid gap-3 md:grid-cols-2">
      <fieldset className="space-y-2 md:col-span-2" aria-invalid={interestError}>
        <legend className="text-xs font-medium text-foreground/70">I’m interested in (select one or both)</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {[CONTACT_INTEREST_SOFTWARE, CONTACT_INTEREST_OHIO].map((interest) => (
            <label key={interest} className="flex min-h-11 items-center gap-3 rounded-2xl border border-input bg-background px-3 py-2 text-sm text-foreground">
              <input
                type="checkbox"
                name="interest"
                value={interest}
                checked={form.interest.includes(interest)}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setInterestError(false);
                  if (status === "success" || status === "error") setStatus("idle");
                  setForm((p) => {
                    const selected = checked
                      ? [...p.interest, interest]
                      : p.interest.filter((item) => item !== interest);
                    return {
                      ...p,
                      interest: selected,
                      propertyAddress: selected.includes(CONTACT_INTEREST_OHIO) ? p.propertyAddress : "",
                    };
                  });
                }}
                className="h-4 w-4 shrink-0 accent-[var(--brand)]"
              />
              <span>{interest}</span>
            </label>
          ))}
        </div>
        {interestError && <p className="text-xs text-red-700" role="alert">Select at least one option.</p>}
      </fieldset>
      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground/70">Name</label>
        <Input
  value={form.name}
  onChange={(e) => {
    if (status === "success" || status === "error") setStatus("idle");
    setForm((p) => ({ ...p, name: e.target.value }));
  }}
  placeholder="Your name"
  autoComplete="name"
  className="rounded-2xl"
  required
/>

      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground/70">
          Company / HOA
        </label>
        <Input
  value={form.company}
  onChange={(e) => {
    if (status === "success" || status === "error") setStatus("idle");
    setForm((p) => ({ ...p, company: e.target.value }));
  }}
  placeholder="Company or HOA"
  autoComplete="organization"
  className="rounded-2xl"
/>

      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground/70">Email</label>
       <Input
  type="email"
  value={form.email}
  onChange={(e) => {
    if (status === "success" || status === "error") setStatus("idle");
    setForm((p) => ({ ...p, email: e.target.value }));
  }}
  placeholder="name@company.com"
  autoComplete="email"
  className="rounded-2xl"
  required
/>

      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground/70">Phone</label>
        <Input
  value={form.phone}
  onChange={(e) => {
    if (status === "success" || status === "error") setStatus("idle");

    const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
    let formatted = digits;

    if (digits.length > 6) {
      formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length > 3) {
      formatted = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    } else if (digits.length > 0) {
      formatted = `(${digits}`;
    }

    setForm((p) => ({ ...p, phone: formatted }));
  }}
  placeholder="(###) ###-####"
  inputMode="tel"
  autoComplete="tel"
  className="rounded-2xl"
/>

      </div>

      {form.interest.includes(CONTACT_INTEREST_OHIO) && (
        <div className="space-y-1 md:col-span-2">
          <label htmlFor="scout-property-address" className="text-xs font-medium text-foreground/70">
            Property address (Ohio service only)
          </label>
          <Input
            id="scout-property-address"
            value={form.propertyAddress}
            onChange={(e) => {
              if (status === "success" || status === "error") setStatus("idle");
              setForm((p) => ({ ...p, propertyAddress: e.target.value }));
            }}
            placeholder="Street, City, State"
            autoComplete="street-address"
            className="rounded-2xl"
          />
        </div>
      )}

      <div className="space-y-1 md:col-span-2">
        <label className="text-xs font-medium text-foreground/70">
          What would you like to do?
        </label>
        <Textarea
          value={form.message}
onChange={(e) => {
  if (status === "success" || status === "error") setStatus("idle");
  setForm((p) => ({ ...p, message: e.target.value }));
}}

          placeholder="Tell us about the property documentation you need or how your team would use Scout Capture."
          className="min-h-[110px] rounded-2xl"
          required
        />
      </div>
    </div>

    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
      <button
        type="submit"
        disabled={status === "sending"}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-60"
      >
        <Mail className="h-4 w-4" />
        {status === "sending" ? "Sending..." : "Send message"}
      </button>

      <a
        href={`tel:${BRAND.phone.replace(/[^0-9+]/g, "")}`}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground/80 shadow-sm hover:text-foreground hover:border-[var(--brand)]"
      >
        <Phone className="h-4 w-4 text-[var(--brand)]" />
        Call
      </a>
    </div>

    {status === "success" && (
      <p className="mt-3 text-sm text-foreground">
        Thanks — your message was sent. We’ll reply shortly.
      </p>
    )}

    {status === "error" && (
      <p className="mt-3 text-sm text-foreground">
        Something went wrong. Please try again or call us.
      </p>
    )}
  </form>
</CardContent>


          </Card>

          <div className="md:col-span-2 space-y-4">
            <Card className="rounded-3xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Direct contact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-foreground/70">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-border bg-[var(--brand)]/5">
                    <MapPin className="h-4 w-4 text-[var(--brand)]" />
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">Service area</div>
                    <div>{BRAND.serviceArea}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-border bg-[var(--brand)]/5">
                    <Phone className="h-4 w-4 text-[var(--brand)]" />
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">Phone</div>
                    <div>{BRAND.phone}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-border bg-[var(--brand)]/5">
                    <Mail className="h-4 w-4 text-[var(--brand)]" />
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">Email</div>
                    <div>{BRAND.email}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Who this is for</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-foreground/70">
                  {[
                    "Property managers and ownership groups",
                    "HOAs and condo associations",
                    "Commercial facilities and retail sites",
                    "Insurance documentation support",
                    "Owners needing recurring visual records",
                  ].map((x) => (
                    <li key={x} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-[var(--brand)]" />
                      <span>{x}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </Section>
</div>
      <footer className="border-t border-border py-10">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div>
              {/*<div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-background shadow-sm overflow-hidden">
                  <img
                    src={BRAND.logos.iconOnly}
                    alt="SCOUT icon"
                    className="h-6 w-6 object-contain"
                    loading="lazy"
                  /> 
                </div>*/}
                <div className="flex items-center gap-2">
                <img
                  src={BRAND.logos.wordmarkOnly}
                  alt="SCOUT"
                  className="h-6 w-auto object-contain"
                  loading="lazy"
                />
              </div>
              <div className="mt-1 text-sm text-foreground/70">
                Ohio documentation service · U.S. software access
              </div>
              <div className="mt-2 text-xs text-foreground/60">
                © {new Date().getFullYear()} Scout Systems LLC. All rights reserved.
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {nav.map((n) => (
                <a
                  key={n.href}
                  href={n.href}
                  className="text-sm font-medium text-foreground/70 hover:text-[var(--brand)]"
                >
                  {n.label}
                </a>
              ))}
              <a href="/privacy" className="text-sm font-medium text-foreground/70 hover:text-[var(--brand)]">
                Privacy Policy
              </a>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-[var(--brand)]/5 p-4 text-xs leading-relaxed text-foreground/70">
            SCOUT's Ohio on-site service provides visual documentation of observable property features. Organizations using Scout Capture perform and are responsible for their own work.
          </div>
        </div>
      </footer>
    </div>
  );
}
