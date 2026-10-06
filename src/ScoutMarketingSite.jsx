import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Camera,
  ShieldCheck,
  ClipboardList,
  MapPin,
  Clock,
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
  Sparkles,
  Menu,
  Zap,
} from "lucide-react";

// If your project has shadcn/ui, these imports will work.
// If not, replace with your own components or simple div/button elements.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  sampleReportLabel: "Download sample report (PDF)",
  sampleReportHref: "/scout-sample-report.pdf",

};

const CONTACT_INTEREST_OHIO = "Ohio documentation service";
const CONTACT_INTEREST_SOFTWARE = "Scout Capture software";

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

const Stat = ({ label, value }) => (
  <div className="rounded-2xl border border-border bg-background p-5 shadow-sm">
    <div className="text-2xl font-semibold tracking-tight">{value}</div>
    <div className="mt-1 text-sm text-foreground/70">{label}</div>
  </div>
);

const Feature = ({ icon: Icon, title, desc }) => (
  <Card className="rounded-2xl shadow-sm">
    <CardHeader className="space-y-2">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-[var(--brand)]/5">
        <Icon className="h-5 w-5 text-[var(--brand)]" />
      </div>
      <CardTitle className="text-lg">{title}</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-sm leading-relaxed text-foreground/70">{desc}</p>
    </CardContent>
  </Card>
);

const FAQItem = ({ q, a }) => (
  <details className="group rounded-2xl border border-border bg-background px-5 py-4 shadow-sm">
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
  { label: "Options", href: "#options" },
  { label: "Ohio service", href: "#services" },
  { label: "Software", href: "#software" },
  { label: "How it works", href: "#how" },
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
      <header id="top" className="relative isolate overflow-hidden">
       {/* Background image */}
<div className="absolute inset-0 z-0 pointer-events-none">
  <img
    src="/hero-bg.jpg"
    alt=""
    className="h-full w-full object-cover"
    loading="eager"
  />
  {/* Reduce overlay first to confirm image is there */}
  <div className="absolute inset-0 bg-black/10" />
</div>


        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pt-8 pb-6 md:px-6 md:pt-20 md:pb-10">


          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            transition={{ duration: 0.5 }}
            className="rounded-3xl bg-black/20 backdrop-blur-sm p-5 md:p-7 border border-white/10"
          >
            <div>
              <div className="mb-4 hidden flex-wrap gap-2 md:flex">
  <Pill icon={Camera} className="bg-white/85 text-[#23243A] border-white/20 backdrop-blur-sm"
>
    Time-stamped photo documentation
  </Pill>
  <Pill icon={ClipboardList} className="bg-white/85 text-[#23243A] border-white/20 backdrop-blur-sm">
    Report-ready deliverables
  </Pill>
  <Pill icon={ShieldCheck} className="bg-white/85 text-[#23243A] border-white/20 backdrop-blur-sm"
>
    Observation-based
  </Pill>
</div>

              <div className="mb-5 hidden md:block">
                <img
                  src={BRAND.logos.wordmarkWhite}
                  alt="SCOUT"
                  className="h-10 w-auto object-contain md:h-12"
                  loading="eager"
                />
              </div>

              <h1 className="text-3xl font-semibold tracking-tight text-white md:text-6xl">

                Property records, created by SCOUT or your team.
              </h1>

              <p className="mt-4 max-w-xl text-base font-medium leading-relaxed text-white/90">


                Hire SCOUT for photographic documentation in Ohio, or use Scout Capture and the Reports Portal to create and share records with your own team across the U.S.
              </p>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center md:mt-7">
                <Button
                  className="rounded-2xl bg-white text-[var(--brand)] hover:bg-white/90"
                  onClick={() => scrollToSection("#options")}

                >
                  Explore your options
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>

                {/*<Button
                  variant="outline"
                  className="rounded-2xl hover:border-[var(--brand)]"
                  onClick={() => {
                    const el = document.querySelector("#services");
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  Explore services
                </Button>*/}

                <a
                  href={BRAND.sampleReportHref}
                   className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/40 bg-transparent px-4 py-2 text-sm font-medium text-white/90 shadow-sm hover:bg-white/10"
>
  <Download className="h-4 w-4 text-white/90" />
                  {BRAND.sampleReportLabel}
                </a>
                <button
                  type="button"
                  onClick={() => scrollToSection("#software")}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/40 bg-transparent px-4 py-2 text-sm font-medium text-white/90 shadow-sm hover:bg-white/10"
                >
                  Explore Scout Capture
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              {/*<div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label="Typical turnaround" value="24-72 hrs" />
                <Stat label="Deliverables" value="PDF + photo set" />
              </div>*/}


            </div>

            <div className="hidden w-full md:mt-6 md:block md:justify-self-end">
  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_320px] md:items-start">

              <Card className="rounded-3xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl">What the Ohio service delivers</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
<div className="mt-0.5 inline-flex h-9 w-9 min-w-[2.25rem] flex-shrink-0 items-center justify-center rounded-2xl border border-border bg-[var(--brand)]/5">
                      <FileText className="h-4 w-4 text-[var(--brand)]" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">Structured visual record (PDF)</div>
                      <div className="text-sm text-foreground/70">
                        Property details, scope, timestamps, photo index, and
                        observable-condition notes.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
<div className="mt-0.5 inline-flex h-9 w-9 min-w-[2.25rem] flex-shrink-0 items-center justify-center rounded-2xl border border-border bg-[var(--brand)]/5">
                      <Camera className="h-4 w-4 text-[var(--brand)]" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">Time-stamped photos</div>
                      <div className="text-sm text-foreground/70">
                        Wide + detail coverage of elevations, common areas, and
                        key assets.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
<div className="mt-0.5 inline-flex h-9 w-9 min-w-[2.25rem] flex-shrink-0 items-center justify-center rounded-2xl border border-border bg-[var(--brand)]/5">
  <ShieldCheck className="h-4 w-4 text-[var(--brand)]" />
</div>

                    <div>
                      <div className="text-sm font-semibold">Clear boundaries</div>
                      <div className="text-sm text-foreground/70">
                        Documentation is limited to visual observation only. 
                        No testing, measurements, or professional judgments are performed.
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-[var(--brand)]/5 p-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-[var(--brand)]" />
                      <div className="text-sm font-semibold">Best use cases</div>
                    </div>
                    <ul className="mt-2 space-y-1 text-sm text-foreground/70">
                      <li>• Ongoing quarterly or monthly condition tracking</li>
                      <li>• Pre-tenant / move-in baseline</li>
                      <li>• Post-storm / claim documentation</li>
                      <li>• Vendor work verification support</li>
                      
                    </ul>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      className="w-full rounded-2xl bg-[var(--brand)] text-white hover:opacity-90"
                     onClick={() => openContactFor(CONTACT_INTEREST_OHIO)}

                    >
                      Get started
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full rounded-2xl hover:border-[var(--brand)]"
                      onClick={() => scrollToSection("#faq")}

                    >
                      Read FAQ
                    </Button>
                  </div>
                </CardContent>
              </Card>

<div className="grid gap-4">
  {/* Service area */}
  <div className="rounded-2xl border border-border bg-background p-4 shadow-sm">
    <div className="flex items-center gap-2">
      <MapPin className="h-4 w-4 text-[var(--brand)]" />
      <div className="text-base font-medium text-foreground">Service area</div>
    </div>
    <div className="mt-1 text-sm text-foreground/70">
      {BRAND.serviceArea}
    </div>
  </div>

  {/* Scheduling (moved above stats) */}
  <div className="rounded-2xl border border-border bg-background p-4 shadow-sm">
    <div className="flex items-center gap-2">
      <Clock className="h-4 w-4 text-[var(--brand)]" />
      <div className="text-base font-medium text-foreground">Scheduling</div>
    </div>
    <div className="mt-1 text-sm text-foreground/70">
      Weekdays + flexible windows
    </div>
  </div>

  {/* Stat bubbles */}
  <div className="grid gap-3">
    {/* Turnaround */}
    <div className="rounded-2xl border border-border bg-background p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-[var(--brand)]" />
        <div className="text-base font-medium text-foreground">24-72 hrs</div>
      </div>
      <div className="mt-1 text-sm text-foreground/70">
        Typical turnaround
      </div>
    </div>

    {/* Deliverables */}
    <div className="rounded-2xl border border-border bg-background p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-[var(--brand)]" />
        <div className="text-base font-medium text-foreground">
          PDF + photo set
        </div>
      </div>
      <div className="mt-1 text-sm text-foreground/70">
        Deliverables
      </div>
    </div>
  </div>
</div>

              <div className="mt-6 flex flex-wrap gap-2">
                {[
                  "Property Management",
                  "HOAs / Condos",
                  "Retail / Office",
                  "Multifamily",
                  "Insurance claim support",
                ].map((x) => (
                  <Badge
                    key={x}
                    variant="secondary"
                    className="rounded-full border border-white/20 bg-white/85 text-[#23243A] backdrop-blur-sm"
                  >
                    {x}
                  </Badge>
                ))}
              </div>


</div>
            </div>
          </motion.div>
        </div>
      </header>

      <Section
        id="options"
        eyebrow="Two ways to use SCOUT"
        title="Choose the service or use the software with your own team"
        subtitle="The two offerings have different roles: SCOUT performs an Ohio visit, while software customers perform their own work."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="rounded-3xl shadow-sm">
            <CardHeader><CardTitle className="text-xl">SCOUT documents your property</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm leading-relaxed text-foreground/70">
              <p>For Ohio properties, SCOUT photographs agreed, accessible areas and may add factual flags for visible conditions. You receive an organized, time-stamped visual record.</p>
              <p>On-site service currently focuses on Columbus and surrounding areas.</p>
              <Button className="rounded-2xl bg-[var(--brand)] text-white hover:opacity-90" onClick={() => scrollToSection("#services")}>Explore the Ohio service</Button>
            </CardContent>
          </Card>
          <Card className="rounded-3xl shadow-sm">
            <CardHeader><CardTitle className="text-xl">Your team uses Scout Capture</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm leading-relaxed text-foreground/70">
              <p>Organizations in the U.S. can request access to Scout Capture and the Reports Portal to create, organize, and share their own property records.</p>
              <p>Your organization controls its fieldwork, observations, reports, and customer relationship.</p>
              <Button variant="outline" className="rounded-2xl hover:border-[var(--brand)]" onClick={() => scrollToSection("#software")}>Explore the software</Button>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section
        id="services"
        eyebrow="Ohio documentation service"
        title="Visual record packages built for repeatability"
        subtitle="Choose a one-time visit or a recurring cadence. Every deliverable is organized, time-stamped, and easy to file, share, and compare over time."
        /*className="py-10 md:py-14"*/
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Feature
            icon={Building2}
            title="Commercial exteriors"
            desc="Elevations, entries, roofs from ground vantage points, gutters and downspouts, masonry, windows and doors, hardscape, and key site features, where accessible."
          />
          <Feature
            icon={Home}
            title="Multifamily & HOA"
            desc="Common areas, building envelopes, amenities, signage, fencing, and recurring condition tracking to reduce ambiguity across seasons and vendors."
          />
          <Feature
            icon={KeyRound}
            title="Pre / post tenancy baseline"
            desc="Establish a consistent visual baseline for move-in/move-out cycles and tenant turnover, using a standardized photo index and notes."
          />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card className="rounded-3xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Deliverables</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-foreground/70">
                {[
                  "Time-stamped photo set (wide + detail coverage)",
                  "PDF report with photo index and observable notes",
                  "Clear scope & limitations language",
                  "Optional comparison notes to prior documentation (visual change / no visible change)",
                  "Optional labeled photos for key items (e.g., north elevation, main entry)",
                ].map((x) => (
                  <li key={x} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]" />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="rounded-3xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Common add-ons</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {[
                  "Monthly cadence",
                  "Quarterly cadence",
                  "After-storm documentation",
                  "Vendor work verification support",
                  "Priority turnaround",
                  "Expanded photo index",
                  "Interior common areas",
                  "Client-Provided Document Indexing",
                ].map((x) => (
                  <Badge
                    key={x}
                    variant="secondary"
                    className="rounded-full border border-border bg-[var(--brand)]/5 text-foreground"
                  >
                    {x}
                  </Badge>
                ))}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-foreground/70">
                If a property has complex transitions (multiple gutters, rooflines, 
                entrances, or elevations), we scale photo count responsibly using a
                 consistent indexing system, with wide context first 
                 and detail coverage only where needed.
              </p>
            </CardContent>
          </Card>
        </div>
      </Section>


      <Section
        id="software"
        eyebrow="Software for U.S. organizations"
        title="Full documentation, a punch list, or both"
        subtitle="Choose the scope that fits the visit. Scout Capture supports a guided Full Documentation session, a focused Punchlist Visit without guided photos, or both for the same property."
      >
        <div className="rounded-3xl bg-[var(--brand)] p-6 text-white shadow-sm md:p-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            Punch list workflow
          </div>
          <h3 className="mt-5 max-w-3xl text-2xl font-semibold tracking-tight md:text-3xl">
            Capture issues on site. Give the team a list they can use.
          </h3>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-white/85">
            Flag an issue, take a photo, and add a note while you are at the property. In the Reports Portal, authorized users can review the property punch list, see open and resolved items, and organize the work by priority and trade.
          </p>
          <div className="mt-6 grid gap-3 border-t border-white/20 pt-5 sm:grid-cols-2">
            <div>
              <p className="text-sm font-semibold">On site</p>
              <p className="mt-1 text-sm leading-relaxed text-white/80">Record what needs attention while the details are in front of you.</p>
            </div>
            <div>
              <p className="text-sm font-semibold">With the team</p>
              <p className="mt-1 text-sm leading-relaxed text-white/80">Work from one organized list of issues, photos, and notes.</p>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Feature icon={Camera} title="Full property documentation" desc="Follow the guided photo workflow to build a structured visual record of the property." />
          <Feature icon={ClipboardList} title="Punch list only" desc="Start a Punchlist Visit to focus on flagged issues, photos, and notes without a guided photo walkthrough." />
          <Feature icon={FileText} title="Use both together" desc="Create a full record, then use Punchlist Visits to document or follow up on specific issues at the same property." />
        </div>
        <div className="mt-6 rounded-3xl border border-border bg-[var(--brand)]/5 p-6 shadow-sm md:flex md:items-center md:justify-between md:gap-6">
          <p className="max-w-3xl text-sm leading-relaxed text-foreground/70">Organizations may use the software for documentation or other work they are authorized to perform, including inspections. Each organization is responsible for its work, licenses, and customer agreements. Software access does not include an on-site SCOUT visit.</p>
          <Button className="mt-4 shrink-0 rounded-2xl bg-[var(--brand)] text-white hover:opacity-90 md:mt-0" onClick={() => openContactFor(CONTACT_INTEREST_SOFTWARE)}>Ask about software access</Button>
        </div>
      </Section>

      <Section
        id="how"
        eyebrow="Ohio service process"
        title="A simple workflow that produces consistent records"
        subtitle="We aim for clarity and repeatability. The same structure is used for each visit so differences over time are obvious."
       /*className="py-10 md:py-14"*/
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-3xl shadow-sm overflow-hidden">

  {/* NEW — image */}
  <img
  src="/process-scope.jpg"
  alt="Scope and scheduling"
  className="w-full aspect-[16/9] rounded-2xl object-cover"
  loading="lazy"
/>


  <CardHeader>
    <CardTitle className="text-lg">1) Scope & schedule</CardTitle>
  </CardHeader>

  <CardContent className="text-sm leading-relaxed text-foreground/70">
    We confirm access points, coverage areas, and your desired cadence
    (one-time, monthly, quarterly). You’ll receive a clear time window.
  </CardContent>
</Card>
          <Card className="rounded-3xl shadow-sm overflow-hidden">

  {/* NEW — image */}
  <img
  src="/process-document.jpg"
  alt="On-site visual documentation"
  className="w-full aspect-[16/9] rounded-2xl object-cover"
  loading="lazy"
/>


  <CardHeader>
    <CardTitle className="text-lg">2) Document on site</CardTitle>
  </CardHeader>

  <CardContent className="text-sm leading-relaxed text-foreground/70">
    We capture wide and detailed photos of observable conditions using
    consistent framing and timestamps.
  </CardContent>
</Card>
          <Card className="rounded-3xl shadow-sm overflow-hidden">
            {/* NEW — image */}
            
  <img
  src="/process-deliver.jpg"
  alt="Structured report and photo deliverables"
  className="w-full aspect-[16/9] rounded-2xl object-cover"
  loading="lazy"
/>

            <CardHeader>
              <CardTitle className="text-lg">3) Deliver & archive</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-foreground/70">
              You receive a structured PDF and organized photo set. Recurring
              clients can track visual changes from prior documentation.
            </CardContent>
          </Card>
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
  id="value"
  eyebrow="Value of records"
  title="Clear records lead to clearer decisions and lower unnecessary costs."
>
  <p className="mt-4 mb-2 max-w-2xl text-sm leading-relaxed text-foreground/70">
  Clear documentation helps teams make decisions based on records, not assumptions.
</p>


  <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr] md:items-start">



    {/* Left: narrative */}
    <div className="space-y-4 text-sm leading-relaxed text-foreground/75">

  <p>
    Across many properties, unnecessary costs rarely come from the repair itself. They come from decisions made without a 
    clear record of prior conditions, turning routine questions into extra site visits, expanded scopes, or conservative 
    “just-in-case” solutions.
  </p>

  <p>
    SCOUT creates consistent, time-stamped visual records that establish a reliable baseline and make observable changes 
    easy to reference over time. Each visit follows the same structure, creating a durable visual record that remains 
    usable and comparable over time, even as people, vendors, or conditions change.

  </p>
</div>


    {/* Right: bullets */}
<div className="rounded-3xl border border-border bg-[var(--brand)]/5 p-5 md:-mt-8">




  <div className="text-sm font-semibold text-foreground">
    With that context in place, you can:
  </div>

  <ul className="mt-3 space-y-2 text-sm text-foreground/75">

    {[
      "Avoid duplicate investigations and re-scoping",
      "Support more targeted repairs instead of blanket fixes",
      "Resolve questions faster with vendors, tenants, or insurers",
      "Retain visual history even as staff or vendors change",
    ].map((x) => (
      <li key={x} className="flex items-start gap-2">
        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[var(--brand)]" />
        <span>{x}</span>
      </li>
    ))}
  </ul>

  <p className="mt-4 text-sm text-foreground/70">

    The goal isn’t to reduce necessary work but to prevent unnecessary costs before they happen.
  </p>
</div>

  </div>

  {/* Bottom line callout */}
  <div className="mt-6 rounded-3xl border border-border bg-[var(--brand)]/5 px-5 py-4">
  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
    <div className="text-sm text-foreground/80">

      <span className="font-semibold text-foreground">Bottom line:</span>{" "}
      A single unnecessary site visit or over-scoped repair can easily exceed the cost of ongoing documentation.
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
        <div className="grid gap-4 md:grid-cols-2">
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
    title="Ask about the Ohio service or Scout Capture"
    subtitle="Tell us which offering interests you. For on-site documentation, we’ll reply with scope and scheduling details."
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
          {[CONTACT_INTEREST_OHIO, CONTACT_INTEREST_SOFTWARE].map((interest) => (
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
