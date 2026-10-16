import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Camera,
  ClipboardList,
  FileText,
  Mail,
  Menu,
  Phone,
  X,
} from "lucide-react";
import "./ScoutMarketingSite.css";

const APP_STORE_URL = "https://apps.apple.com/us/app/scout-capture-by-scout/id6761496506";
const SOFTWARE_INTEREST = "Scout Capture software";
const OHIO_INTEREST = "Ohio documentation service";
const PHONE = "(614) 321-9845";
const EMAIL = "hello@scoutclear.com";

const nav = [
  { label: "Scout Capture", href: "#software" },
  { label: "Why records matter", href: "#value" },
  { label: "Ohio service", href: "#services" },
  { label: "Process", href: "#how" },
  { label: "FAQ", href: "#faq" },
];

const faqs = [
  {
    question: "Is SCOUT a home or property inspection service?",
    answer: "SCOUT's Ohio service provides photographic documentation of agreed, accessible areas and may flag visible conditions factually. It does not include testing, measurements, diagnoses, or repair recommendations.",
  },
  {
    question: "Can my company use Scout Capture for its own inspections?",
    answer: "Yes, if your organization is authorized to perform that work. Your company controls its fieldwork, findings, reports, licensing, and customer agreements. SCOUT provides the software; it does not perform or approve your inspection.",
  },
  {
    question: "Where are the two offerings available?",
    answer: "SCOUT's on-site documentation service is offered in Ohio, currently focused on the Columbus area. Scout Capture software is for organizations in the United States.",
  },
  {
    question: "What do you mean by ‘observable notes’?",
    answer: "We describe what is visible in the moment (for example, ‘crack observed in masonry at main entry’). We avoid conclusions about cause, severity, or required repairs.",
  },
  {
    question: "How do you prevent photo counts from ballooning on complex buildings?",
    answer: "We use a structured indexing approach: wide context photos for each elevation or zone, then detail photos where warranted. This preserves clarity without unnecessary duplication.",
  },
  {
    question: "Can you compare this visit to a prior report?",
    answer: "Yes. For recurring clients, we can note ‘visual change observed from prior documentation’ or ‘no visible change observed,’ based on what is visible in the photos and reasonably accessible areas.",
  },
  {
    question: "Do you go on roofs or enter restricted areas?",
    answer: "Only if access is explicitly provided and it is safe and reasonably accessible. Otherwise, documentation is limited to accessible vantage points.",
  },
  {
    question: "How fast do you deliver Ohio service records?",
    answer: "Typical turnaround is 24–72 hours depending on scope and photo volume. Priority turnaround is available for time-sensitive situations.",
  },
];

const initialForm = {
  interest: [],
  name: "",
  company: "",
  email: "",
  phone: "",
  propertyAddress: "",
  message: "",
  website: "",
};

export default function ScoutMarketingSite() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState("idle");
  const [interestError, setInterestError] = useState(false);

  useEffect(() => {
    document.title = "SCOUT | Property Documentation Service & Software";
  }, []);

  function scrollTo(id) {
    setMobileOpen(false);
    document.querySelector(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openContactFor(interest) {
    setForm((previous) => ({
      ...previous,
      interest: [interest],
      propertyAddress: interest === OHIO_INTEREST ? previous.propertyAddress : "",
    }));
    setInterestError(false);
    setStatus("idle");
    scrollTo("#contact");
  }

  function updateField(field, value) {
    if (status !== "idle") setStatus("idle");
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function toggleInterest(interest, checked) {
    setInterestError(false);
    if (status !== "idle") setStatus("idle");
    setForm((previous) => {
      const selected = checked
        ? [...previous.interest, interest]
        : previous.interest.filter((item) => item !== interest);
      return {
        ...previous,
        interest: selected,
        propertyAddress: selected.includes(OHIO_INTEREST) ? previous.propertyAddress : "",
      };
    });
  }

  async function handleContactSubmit(event) {
    event.preventDefault();
    if (status === "sending") return;
    if (form.interest.length === 0) {
      setInterestError(true);
      return;
    }
    setInterestError(false);
    setStatus("sending");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          interest: form.interest.join(", "),
        }),
      });
      if (!response.ok) throw new Error("Contact request failed");
      setStatus("success");
      setForm(initialForm);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="scout-marketing" id="top">
      <a className="scout-skip-link" href="#main">Skip to content</a>
      <div className="scout-nav-wrap">
        <div className="scout-nav scout-container">
          <a className="scout-brand" href="#top" aria-label="SCOUT home" onClick={() => setMobileOpen(false)}>
            <img src="/Scout Only Logo Navy Dark NEW.png" alt="SCOUT" />
          </a>
          <nav className="scout-desktop-nav" aria-label="Main navigation">
            {nav.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
          </nav>
          <div className="scout-nav-actions">
            <a className="scout-portal-link" href="/reports">Client Portal <ArrowUpRight size={15} aria-hidden="true" /></a>
            <a className="scout-nav-cta" href="#contact">Get in touch <ArrowUpRight size={16} aria-hidden="true" /></a>
            <button className="scout-mobile-toggle" type="button" aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen} onClick={() => setMobileOpen((open) => !open)}>
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <nav className="scout-mobile-nav" aria-label="Mobile navigation">
            {nav.map((item) => <a key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>{item.label}</a>)}
            <a href="/reports">Client Portal</a>
            <a href="#contact" onClick={() => setMobileOpen(false)}>Get in touch</a>
          </nav>
        )}
      </div>

      <main id="main">
        <section className="scout-hero" aria-labelledby="scout-hero-title">
          <div className="scout-container scout-hero-copy">
            <p className="scout-eyebrow">Property documentation, made clear</p>
            <h1 id="scout-hero-title">See the whole property.<br /><span>Remember every detail.</span></h1>
            <p className="scout-hero-intro">Create a useful visual record with your own team using Scout Capture, or have SCOUT document an Ohio property for you.</p>
            <div className="scout-hero-actions">
              <a className="scout-button scout-button-primary" href="#software">Explore Scout Capture <ArrowUpRight size={18} aria-hidden="true" /></a>
              <a className="scout-text-link" href="#services">See the Ohio service <ArrowRight size={18} aria-hidden="true" /></a>
            </div>
          </div>
          <div className="scout-hero-image-wrap">
            <img src="/hero-bg.jpg" alt="Modern property exterior at dusk" className="scout-hero-image" fetchPriority="high" />
            <div className="scout-hero-image-caption">
              <span>From the first walkthrough to the next decision.</span>
            </div>
          </div>
        </section>

        <section className="scout-section scout-software" id="software" aria-labelledby="scout-software-title">
          <div className="scout-container">
            <div className="scout-section-lead scout-software-lead">
              <p className="scout-eyebrow">01 — Scout Capture</p>
              <h2 id="scout-software-title">A better way to bring the field back to the team.</h2>
              <p>Document interior and exterior conditions, keep each photo in context, and bring the whole record together in the Reports Portal.</p>
            </div>
            <div className="scout-feature-list">
              <div className="scout-feature-row">
                <span className="scout-feature-number">01</span>
                <Camera size={28} strokeWidth={1.5} aria-hidden="true" />
                <div><h3>Capture with structure.</h3><p>Follow a guided full documentation session to cover the property consistently.</p></div>
              </div>
              <div className="scout-feature-row">
                <span className="scout-feature-number">02</span>
                <ClipboardList size={28} strokeWidth={1.5} aria-hidden="true" />
                <div><h3>Call out what matters.</h3><p>Flag issues, add notes, and organize punch list items by priority and trade.</p></div>
              </div>
              <div className="scout-feature-row">
                <span className="scout-feature-number">03</span>
                <FileText size={28} strokeWidth={1.5} aria-hidden="true" />
                <div><h3>Keep everyone aligned.</h3><p>Share completed reports, photos, and observations with authorized users in the Reports Portal.</p></div>
              </div>
            </div>
            <div className="scout-app-download">
              <div className="scout-app-identity">
                <img src="/scout-capture-app-icon.png" alt="Scout Capture app icon" />
                <div><span>Available on the App Store</span><strong>Scout Capture for iPhone</strong></div>
              </div>
              <div className="scout-app-actions">
                <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" aria-label="Download Scout Capture on the App Store">
                  <img src="/download-on-the-app-store.svg" alt="Download on the App Store" />
                </a>
                <button className="scout-text-link" type="button" onClick={() => openContactFor(SOFTWARE_INTEREST)}>Ask about access <ArrowRight size={18} aria-hidden="true" /></button>
              </div>
              <p>An invitation from your organization is required to sign in.</p>
            </div>
            <p className="scout-software-note">Organizations may use the software for work they are authorized to perform, including inspections. Each organization is responsible for its work, licenses, and customer agreements. Software access does not include an on-site SCOUT visit.</p>
          </div>
        </section>

        <section className="scout-value" id="value" aria-labelledby="scout-value-title">
          <div className="scout-container scout-value-layout">
            <p className="scout-eyebrow">02 — Why the record matters</p>
            <div>
              <h2 id="scout-value-title">When questions come up,<br /><em>the record is ready.</em></h2>
              <p>Dated photos and notes make prior conditions easier to reference, share, and compare—whether your team uses Scout Capture or SCOUT documents an Ohio property.</p>
            </div>
          </div>
        </section>

        <section className="scout-section scout-service" id="services" aria-labelledby="scout-service-title">
          <div className="scout-container scout-service-layout">
            <div className="scout-service-image-wrap">
              <img src="/process-document.jpg" alt="Field professional photographing a property" loading="lazy" />
              <span>On site, with SCOUT.</span>
            </div>
            <div className="scout-service-copy">
              <p className="scout-eyebrow">03 — Ohio documentation service</p>
              <h2 id="scout-service-title">We make the record for you.</h2>
              <p className="scout-service-intro">For properties in Columbus and surrounding areas, SCOUT documents agreed, accessible spaces and delivers an organized visual record your team can use.</p>
              <div className="scout-service-lines">
                <div><span>01</span><p>Commercial exteriors and key site features</p></div>
                <div><span>02</span><p>Multifamily properties and common areas</p></div>
                <div><span>03</span><p>Tenant turnover and recurring documentation</p></div>
              </div>
              <p className="scout-service-detail">Receive time-stamped photos and an indexed PDF report with observable notes, scope, and limitations. Schedule one visit or a recurring series.</p>
              <button className="scout-button scout-button-primary" type="button" onClick={() => openContactFor(OHIO_INTEREST)}>Discuss an Ohio visit <ArrowUpRight size={18} aria-hidden="true" /></button>
            </div>
          </div>
        </section>

        <section className="scout-section scout-process" id="how" aria-labelledby="scout-process-title">
          <div className="scout-container">
            <div className="scout-section-lead">
              <p className="scout-eyebrow">04 — The Ohio process</p>
              <h2 id="scout-process-title">Simple steps. A useful record.</h2>
              <p>We use a consistent approach so each visit is clear today and easier to compare later.</p>
            </div>
            <div className="scout-process-grid">
              <article><img src="/process-scope.jpg" alt="Reviewing a property photo plan" loading="lazy" /><span>01 / Scope</span><h3>Agree on what matters.</h3><p>We confirm access points, coverage areas, and the cadence that fits your property.</p></article>
              <article><img src="/process-document.jpg" alt="Documenting a building on site" loading="lazy" /><span>02 / Document</span><h3>Capture it on site.</h3><p>We photograph observable conditions using consistent framing and timestamps.</p></article>
              <article><img src="/process-deliver.jpg" alt="Reviewing an organized property report" loading="lazy" /><span>03 / Deliver</span><h3>Put the record to work.</h3><p>Receive a structured PDF and organized photos to file, share, or revisit.</p></article>
            </div>
            <div className="scout-process-bottom">
              <p>SCOUT documents observable features as they appear at the time of service. Deliverables are visual records intended for reference and comparison, not evaluation.</p>
              <a href="/scout-sample-report.pdf" target="_blank" rel="noopener noreferrer">View a sample report <ArrowUpRight size={17} aria-hidden="true" /></a>
            </div>
          </div>
        </section>

        <section className="scout-section scout-faq" id="faq" aria-labelledby="scout-faq-title">
          <div className="scout-container scout-faq-layout">
            <div><p className="scout-eyebrow">Questions, answered</p><h2 id="scout-faq-title">The details<br />behind the work.</h2><p>Still have a question? <a href="#contact">Get in touch <ArrowRight size={16} aria-hidden="true" /></a></p></div>
            <div className="scout-faq-list">
              {faqs.map(({ question, answer }) => (
                <details key={question}>
                  <summary><span>{question}</span><span className="scout-faq-plus" aria-hidden="true">+</span></summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="scout-contact" id="contact" aria-labelledby="scout-contact-title">
          <div className="scout-container scout-contact-layout">
            <div className="scout-contact-copy">
              <p className="scout-eyebrow">Start a conversation</p>
              <h2 id="scout-contact-title">Let’s make the next step clear.</h2>
              <p>Tell us how your team would use Scout Capture or what Ohio property you need documented. We’ll help you find the right path.</p>
              <div className="scout-contact-direct"><a href={`mailto:${EMAIL}`}><Mail size={17} aria-hidden="true" /> {EMAIL}</a><a href="tel:+16143219845"><Phone size={17} aria-hidden="true" /> {PHONE}</a></div>
            </div>
            <form className="scout-contact-form" onSubmit={handleContactSubmit}>
              <input className="scout-honeypot" type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => updateField("website", event.target.value)} aria-hidden="true" />
              <fieldset>
                <legend>I’m interested in</legend>
                <div className="scout-interest-options">
                  {[SOFTWARE_INTEREST, OHIO_INTEREST].map((interest) => (
                    <label key={interest}><input type="checkbox" checked={form.interest.includes(interest)} onChange={(event) => toggleInterest(interest, event.target.checked)} /><span>{interest}</span></label>
                  ))}
                </div>
                {interestError && <p className="scout-form-feedback" role="alert">Select at least one option.</p>}
              </fieldset>
              <div className="scout-form-grid">
                <label>Name<input value={form.name} onChange={(event) => updateField("name", event.target.value)} autoComplete="name" placeholder="Your name" required /></label>
                <label>Company / HOA<input value={form.company} onChange={(event) => updateField("company", event.target.value)} autoComplete="organization" placeholder="Company or HOA" /></label>
                <label>Email<input type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} autoComplete="email" placeholder="name@company.com" required /></label>
                <label>Phone<input type="tel" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} autoComplete="tel" placeholder="(614) 555-0123" /></label>
              </div>
              {form.interest.includes(OHIO_INTEREST) && <label>Property address<input value={form.propertyAddress} onChange={(event) => updateField("propertyAddress", event.target.value)} autoComplete="street-address" placeholder="Street, City, State" /></label>}
              <label>What would you like to do?<textarea value={form.message} onChange={(event) => updateField("message", event.target.value)} placeholder="Tell us about your property or how your team would use Scout Capture." rows={4} required /></label>
              <button className="scout-button scout-button-light" type="submit" disabled={status === "sending"}>{status === "sending" ? "Sending…" : "Send your message"} <ArrowUpRight size={18} aria-hidden="true" /></button>
              {status === "success" && <p className="scout-form-feedback" role="status">Thanks — your message was sent. We’ll reply shortly.</p>}
              {status === "error" && <p className="scout-form-feedback" role="alert">Something went wrong. Please try again or call us.</p>}
            </form>
          </div>
        </section>
      </main>

      <footer className="scout-footer">
        <div className="scout-container scout-footer-top">
          <div><img src="/Scout Only Logo Navy Dark NEW.png" alt="SCOUT" /><p>Clearer records for the people who care for property.</p></div>
          <div className="scout-footer-links"><a href="#software">Scout Capture</a><a href="#services">Ohio service</a><a href="/reports">Client Portal</a><a href="/privacy">Privacy</a><a href="/terms/service">Service terms</a><a href="/terms/software">Software terms</a></div>
        </div>
        <div className="scout-container scout-footer-bottom"><span>© {new Date().getFullYear()} Scout Systems LLC.</span><span>Scout Capture software · U.S. &nbsp; / &nbsp; On-site service · Ohio</span></div>
      </footer>
    </div>
  );
}
