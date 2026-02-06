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
  descriptor: "Visual documentation services",
  siteTitle: "SCOUT | Visual Property Records",

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
  ctaPrimary: "Request a Quote",
  ctaSecondary: "See How It Works",
  sampleReportLabel: "Download sample report (PDF)",
  sampleReportHref: "/scout-sample-report.pdf",

};

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

// 1) initial scroll: smooth for all sections (including Pricing)
doScroll("smooth");



// 2) correction scroll after layout settles:
// If we’re already close, use smooth; if we’re far off, use auto (prevents weird mobile interruptions)
setTimeout(() => {
  const header = document.querySelector(".sticky.top-0");
  const offset = header ? header.getBoundingClientRect().height : 0;
  const correctedTop = window.scrollY + el.getBoundingClientRect().top - offset - 24;

  const diff = Math.abs(window.scrollY - correctedTop);

  // Pricing is the section that tends to shift; make its correction instant to avoid a visible hitch.
  const isPricing = id === "pricing";

  const behavior = isPricing ? "auto" : (diff <= 120 ? "smooth" : "auto");
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
  name: "",
  company: "",
  email: "",
  phone: "",
  propertyAddress: "",
  message: "",
  website: "", // honeypot anti-spam (keep blank)
});

const [status, setStatus] = useState("idle");
// idle | sending | success | error

// ✅ THIS IS 15C — PUT IT RIGHT HERE
async function handleContactSubmit(e) {
  e.preventDefault();
  if (status === "sending") return;
    setStatus("sending");

  try {
    const payload = {
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
  { label: "Services", href: "#services" },
  { label: "How it works", href: "#how" },
  { label: "Value", href: "#value" },
  { label: "Pricing", href: "#pricing" },
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
            onClick={() => scrollToSection("#how")}
          >
            {BRAND.ctaSecondary}
          </Button>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="hidden rounded-2xl md:inline-flex hover:border-[var(--brand)]"
              onClick={() => scrollToSection("#how")}
            >
              {BRAND.ctaSecondary}
            </Button>
            <Button
              className="rounded-2xl bg-[var(--brand)] text-white hover:opacity-90"
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


        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pt-14 pb-8 md:px-6 md:pt-20 md:pb-10">


          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            transition={{ duration: 0.5 }}
            className="rounded-3xl bg-black/20 backdrop-blur-sm p-6 md:p-7 border border-white/10"
          >
            <div>
              <div className="mb-4 flex flex-wrap gap-2">
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

              <div className="mb-5">
                <img
                  src={BRAND.logos.wordmarkWhite}
                  alt="SCOUT"
                  className="h-10 w-auto object-contain md:h-12"
                  loading="eager"
                />
              </div>

              <h1 className="text-3xl font-semibold tracking-tight text-white md:text-6xl">

                Clear, time-stamped visual records for your property.
              </h1>

              <p className="mt-4 max-w-xl text-base font-medium leading-relaxed text-white/90">


                {BRAND.descriptor} for property owners, managers, HOAs, and 
                commercial facilities. We create structured, time-stamped visual 
                records of observable property conditions for reference and comparison over time.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  className="rounded-2xl bg-white text-[var(--brand)] hover:bg-white/90"
                  onClick={() => scrollToSection("#contact")}

                >
                  {BRAND.ctaPrimary}
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
              </div>

              {/*<div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label="Typical turnaround" value="24-72 hrs" />
                <Stat label="Deliverables" value="PDF + photo set" />
              </div>*/}


            </div>

            <div className="w-full md:justify-self-end mt-6">
  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_320px] md:items-start">

              <Card className="rounded-3xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl">What SCOUT delivers</CardTitle>
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
                     onClick={() => scrollToSection("#contact")}

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
        id="services"
        eyebrow="Services"
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
        id="how"
        eyebrow="Process"
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
            <div className="flex gap-2">
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
                onClick={() => scrollToSection("#contact")}

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

    {/*<Button
      variant="outline"
      className="rounded-2xl hover:border-[var(--brand)]"
      onClick={() => scrollToSection("#pricing")}
    >
      View pricing
      <ArrowRight className="ml-2 h-4 w-4" />
    </Button>*/}
  </div>
</div>

</Section>







      <Section
  id="pricing"
  eyebrow="Pricing"
  title="Straightforward pricing that scales with complexity"
  subtitle="Pricing depends on property size, number of buildings/elevations, access, and desired cadence. Use the ranges below as planning guidance; quotes are finalized after scoping."
   /*className="py-10 md:py-14"*/
>
  {/* ADD md:items-stretch so cards can share height */}
  <div className="grid gap-4 md:grid-cols-3 md:items-stretch">
    
    {/* CARD 1 */}
    <Card className="flex h-full flex-col rounded-3xl shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">One-time baseline</CardTitle>
          <Badge
            variant="secondary"
            className="rounded-full border border-border bg-[var(--brand)]/5 text-foreground"
          >
            Popular
          </Badge>
        </div>
      </CardHeader>

      {/* Make content a flex column */}
      <CardContent className="flex flex-1 flex-col">
        <div className="text-3xl font-semibold tracking-tight">$350-$950</div>
        <div className="mt-1 text-sm text-foreground/70">
          Typical small-to-mid properties
        </div>

        <ul className="mt-4 space-y-2 text-sm text-foreground/70">
          {[
            "Exterior documentation + key site features",
            "Structured PDF report + organized photo set",
            "Clear scope / limitations language",
          ].map((x) => (
            <li key={x} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-[var(--brand)]" />
              <span>{x}</span>
            </li>
          ))}
        </ul>
<div className="h-3" />
        {/* CHANGE mt-5 -> mt-auto */}
        <Button
          className="mt-auto w-full rounded-2xl bg-[var(--brand)] text-white hover:opacity-90"
          onClick={() => scrollToSection("#contact")}

        >
          Request pricing
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>

    {/* CARD 2 */}
    <Card className="flex h-full flex-col rounded-3xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Quarterly tracking</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col">
        <div className="text-3xl font-semibold tracking-tight">$250-$750</div>
        <div className="mt-1 text-sm text-foreground/70">Per visit (recurring)</div>

        <ul className="mt-4 space-y-2 text-sm text-foreground/70">
          {[
            "Repeatable photo index for comparisons",
            "Visual change / no visible change notation",
            "Seasonal issues captured consistently",
          ].map((x) => (
            <li key={x} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-[var(--brand)]" />
              <span>{x}</span>
            </li>
          ))}
        </ul>
<div className="h-3" />
        <Button
          variant="outline"
          className="mt-auto w-full rounded-2xl hover:border-[var(--brand)]"
          onClick={() => scrollToSection("#contact")}

        >
          Build a cadence
        </Button>
      </CardContent>
    </Card>

    {/* CARD 3 */}
    <Card className="flex h-full flex-col rounded-3xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">After-storm documentation</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col">
        <div className="text-3xl font-semibold tracking-tight">$450-$1,500</div>
        <div className="mt-1 text-sm text-foreground/70">
          Priority scheduling available
        </div>

        <ul className="mt-4 space-y-2 text-sm text-foreground/70">
          {[
            "Time-stamped photo set focused on impacted areas",
            "Rapid delivery for claim file support",
            "Clear documentation scope",
          ].map((x) => (
            <li key={x} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-[var(--brand)]" />
              <span>{x}</span>
            </li>
          ))}
        </ul>
<div className="h-3" />
        <Button
          variant="outline"
          className="mt-auto w-full rounded-2xl hover:border-[var(--brand)]"
          onClick={() => scrollToSection("#contact")}

        >
          Get storm support
        </Button>
      </CardContent>
    </Card>

  </div>

  <p className="mt-6 text-xs leading-relaxed text-foreground/60">
    Note: These ranges are provided for planning purposes and may vary
    based on scope, access, number of buildings/elevations, and requested
    deliverables. Services are limited to visual documentation only.
  </p>
</Section>


      <Section
        id="faq"
        eyebrow="FAQ"
        title="Answers to the questions clients ask first"
        subtitle="If you have a question that’s not covered here, contact us and we’ll respond quickly."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FAQItem
            q="Is SCOUT a home or property inspection service?"
            a="No. SCOUT documents what is visually observable at the time of service. Deliverables are structured photographic records intended for reference and comparison, not evaluation or analysis."
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
            q="How fast do you deliver?"
            a="Typical turnaround is 24-72 hours depending on scope and photo volume. Priority turnaround is available for time-sensitive situations."
          />
        </div>
      </Section>
<div id="contact" className="bg-[var(--brand)] scroll-mt-24">
  <Section
    invert

    className="py-16 md:py-20"
    eyebrow="Contact"
    title="Request a quote or schedule a walkthrough"
    subtitle="Send the basics and we’ll reply with a scoped price and the next available window."
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

      <div className="space-y-1 md:col-span-2">
        <label className="text-xs font-medium text-foreground/70">
          Property address
        </label>
        <Input
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

      <div className="space-y-1 md:col-span-2">
        <label className="text-xs font-medium text-foreground/70">
          What do you need documented?
        </label>
        <Textarea
          value={form.message}
onChange={(e) => {
  if (status === "success" || status === "error") setStatus("idle");
  setForm((p) => ({ ...p, message: e.target.value }));
}}

          placeholder="Example: baseline for a new tenant, quarterly tracking, after-storm documentation..."
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
                {BRAND.descriptor} · {BRAND.serviceArea}
              </div>
              <div className="mt-2 text-xs text-foreground/60">
                © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
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
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-[var(--brand)]/5 p-4 text-xs leading-relaxed text-foreground/70">
            <strong className="text-[var(--brand)]">Important:</strong> SCOUT
            provides visual documentation of observable property features only.
            SCOUT does not perform inspections, evaluations, assessments,
            analysis, testing, measurements, or professional opinions of any
            kind.
          </div>
        </div>
      </footer>
    </div>
  );
}
