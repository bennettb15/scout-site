import React, { useEffect, useState } from "react";
import { ArrowRight, ChevronDown, Download, Mail, Menu, Phone, X } from "lucide-react";
import "./ScoutMarketingSite.css";

const APP_STORE_URL = "https://apps.apple.com/us/app/scout-capture-by-scout/id6761496506";
const SOFTWARE_INTEREST = "Scout Capture software";
const OHIO_INTEREST = "Ohio documentation service";
const PHONE = "(614) 321-9845";
const EMAIL = "hello@scoutclear.com";

const questions = [
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
    answer: "Scout Capture software is for organizations in the United States. SCOUT's on-site documentation service is offered in Ohio, currently focused on the Columbus area.",
  },
  {
    question: "Can you compare this visit to a prior report?",
    answer: "For recurring Ohio service clients, we can note visible changes from prior documentation based on the photos and reasonably accessible areas.",
  },
  {
    question: "Do you go on roofs or enter restricted areas?",
    answer: "Only when access is explicitly provided and the area is safe and reasonably accessible. Otherwise, documentation is limited to accessible vantage points.",
  },
  {
    question: "How quickly do you deliver Ohio service records?",
    answer: "Typical turnaround is 24–72 hours, depending on scope and photo volume. Ask us about priority turnaround for time-sensitive work.",
  },
];

function formatPhone(value) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length > 6) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length > 3) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return digits.length ? `(${digits}` : "";
}

function emptyForm() {
  return { interest: [], name: "", company: "", email: "", phone: "", propertyAddress: "", message: "", website: "" };
}

export default function ScoutMarketingSite() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState("idle");
  const [interestError, setInterestError] = useState(false);

  useEffect(() => {
    document.title = "SCOUT | Property Documentation Service & Software";
  }, []);

  function setField(field, value) {
    setStatus("idle");
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function openContactFor(interest) {
    setMobileOpen(false);
    setStatus("idle");
    setInterestError(false);
    setForm((previous) => ({
      ...previous,
      interest: [interest],
      propertyAddress: interest === OHIO_INTEREST ? previous.propertyAddress : "",
    }));
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
  }

  async function submitContact(event) {
    event.preventDefault();
    if (status === "sending") return;
    if (!form.interest.length) {
      setInterestError(true);
      return;
    }
    setInterestError(false);
    setStatus("sending");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, interest: form.interest.join(", ") }),
      });
      if (!response.ok) throw new Error("Contact submission failed");
      setStatus("success");
      setForm(emptyForm());
    } catch {
      setStatus("error");
    }
  }

  const navigation = [
    ["Scout Capture", "#software"],
    ["Ohio service", "#services"],
    ["How it works", "#how"],
    ["FAQ", "#faq"],
  ];

  return (
    <div className="sc-site">
      <div className="sc-header">
        <div className="sc-container sc-header-inner">
          <a className="sc-logo-link" href="#top" aria-label="SCOUT home">
            <img src="/Scout Only Logo Navy Dark NEW.png" alt="SCOUT" />
          </a>
          <nav className="sc-desktop-nav" aria-label="Main navigation">
            {navigation.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <div className="sc-header-actions">
            <a className="sc-portal-link" href="/reports">Client Portal</a>
            <button className="sc-button sc-button-navy sc-header-contact" type="button" onClick={() => openContactFor(SOFTWARE_INTEREST)}>
              Contact SCOUT <ArrowRight size={16} aria-hidden="true" />
            </button>
            <button className="sc-menu-button" type="button" onClick={() => setMobileOpen((value) => !value)} aria-expanded={mobileOpen} aria-label={mobileOpen ? "Close menu" : "Open menu"}>
              {mobileOpen ? <X size={23} /> : <Menu size={23} />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <nav className="sc-mobile-nav" aria-label="Mobile navigation">
            {navigation.map(([label, href]) => <a key={href} href={href} onClick={() => setMobileOpen(false)}>{label}</a>)}
            <a href="/reports">Client Portal</a>
            <a href="#contact" onClick={() => setMobileOpen(false)}>Contact</a>
          </nav>
        )}
      </div>

      <main>
        <section className="sc-hero" id="top" aria-labelledby="sc-hero-title">
          <img className="sc-hero-photo" src="/field-walkthrough-hero.jpg" alt="A field professional surveying a brick property" fetchPriority="high" />
          <div className="sc-hero-shade" />
          <div className="sc-container sc-hero-content">
            <p className="sc-eyebrow sc-eyebrow-light">Property documentation, made useful</p>
            <h1 id="sc-hero-title">Document the property.<br />Move the work forward.</h1>
            <p>Scout Capture turns field photos, notes, and punch list items into a clear record your team can use. In Ohio, SCOUT can handle the site visit for you.</p>
            <div className="sc-hero-actions">
              <a className="sc-button sc-button-white" href="#software">Explore Scout Capture <ArrowRight size={17} aria-hidden="true" /></a>
              <a className="sc-text-link sc-text-link-light" href="#services">Explore Ohio service <ArrowRight size={17} aria-hidden="true" /></a>
            </div>
          </div>
        </section>

        <section className="sc-section sc-software" id="software" aria-labelledby="sc-software-title">
          <div className="sc-container">
            <div className="sc-software-main">
              <div className="sc-software-story">
                <div className="sc-product-mark">
                  <img src="/scout-capture-app-icon.png" alt="" />
                  <span>SCOUT CAPTURE <small>THE FIELD APP</small></span>
                </div>
                <p className="sc-eyebrow sc-eyebrow-light">Scout Capture software · U.S.</p>
                <h2 id="sc-software-title">One walk-through.<br /><em>A clearer way forward.</em></h2>
                <p className="sc-software-lead">Take the photos, flag the issues, and leave with more than a camera roll. Scout Capture keeps every observation in context for the people who need it next.</p>
                <div className="sc-product-actions">
                  <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" aria-label="Download Scout Capture on the App Store"><img className="sc-app-store-badge" src="/download-on-the-app-store.svg" alt="Download on the App Store" /></a>
                  <button className="sc-text-link sc-text-link-light" type="button" onClick={() => openContactFor(SOFTWARE_INTEREST)}>Ask about access <ArrowRight size={17} aria-hidden="true" /></button>
                </div>
                <p className="sc-product-invite">An invitation from your organization is required to sign in.</p>
              </div>
              <div className="sc-product-visual" aria-label="Scout Capture app screens">
                <div className="sc-product-glow" />
                <figure className="sc-phone sc-phone-back"><img src="/scout-app-guided.jpg" alt="Scout Capture guided checklist showing captured and pending photos" loading="lazy" /><figcaption>Guided coverage</figcaption></figure>
                <figure className="sc-phone sc-phone-front"><img src="/scout-app-camera.jpg" alt="Scout Capture camera labeling a sample property's exterior" loading="lazy" /><figcaption>Capture in context</figcaption></figure>
              </div>
            </div>
            <div className="sc-product-features">
              <div><span>01 / CAPTURE</span><h3>Stay organized on site.</h3><p>Guided interior and exterior photos create a consistent visual record as you move through a property.</p></div>
              <div><span>02 / FLAG</span><h3>Make issues visible.</h3><p>Attach photos and notes to punch list items so details are clear after the visit.</p></div>
              <div><span>03 / SHARE</span><h3>Keep the team aligned.</h3><p>Authorized users review completed reports, photos, and issues in the Reports Portal.</p></div>
            </div>
            <p className="sc-software-note">Organizations may use the software for documentation or other work they are authorized to perform, including inspections. Each organization is responsible for its work, licenses, and customer agreements. Software access does not include an on-site SCOUT visit.</p>
          </div>
        </section>

        <section className="sc-section sc-service" id="services" aria-labelledby="sc-service-title">
          <div className="sc-container sc-service-grid">
            <div className="sc-service-photo-wrap"><img src="/process-document.jpg" alt="Documenting a property on site" loading="lazy" /></div>
            <div className="sc-service-content">
              <p className="sc-eyebrow">On-site documentation · Ohio</p>
              <h2 id="sc-service-title">Need the visit handled?<br />We’ll be there.</h2>
              <p className="sc-service-intro">SCOUT documents agreed, accessible areas and delivers time-stamped photos with an indexed PDF report your team can file, share, and revisit.</p>
              <div className="sc-service-uses">
                <div><h3>Commercial exteriors</h3><p>Elevations, entries, rooflines, and key site features from accessible vantage points.</p></div>
                <div><h3>Multifamily & HOA</h3><p>Common areas, exteriors, and amenities documented consistently across visits.</p></div>
                <div><h3>Tenant turnovers</h3><p>A visual baseline for move-in, move-out, and follow-up.</p></div>
              </div>
              <button className="sc-button sc-button-navy" type="button" onClick={() => openContactFor(OHIO_INTEREST)}>Discuss an Ohio visit <ArrowRight size={16} aria-hidden="true" /></button>
            </div>
          </div>
        </section>

        <section className="sc-section sc-process" id="how" aria-labelledby="sc-process-title">
          <div className="sc-container sc-process-layout">
            <div className="sc-process-intro">
              <p className="sc-eyebrow">Ohio service process</p>
              <h2 id="sc-process-title">A visit you can put to work.</h2>
              <p>Agree on the scope. We document what is accessible. Your team receives a dated record to file, share, and revisit.</p>
              <a className="sc-text-link" href="/scout-sample-report.pdf" target="_blank" rel="noopener noreferrer"><Download size={17} aria-hidden="true" /> View a sample report</a>
            </div>
            <div className="sc-process-steps">
              <div><span>01</span><div><h3>Scope</h3><p>We agree on access, coverage, and timing before the visit.</p></div></div>
              <div><span>02</span><div><h3>Capture</h3><p>We document observable conditions with wide and detailed photos.</p></div></div>
              <div><span>03</span><div><h3>Deliver</h3><p>You receive an organized PDF and photo set for your team.</p></div></div>
            </div>
          </div>
          <p className="sc-container sc-process-disclaimer">SCOUT documents observable features as they appear at the time of service. Deliverables are visual records for reference and comparison, not evaluation.</p>
        </section>

        <section className="sc-section sc-faq" id="faq" aria-labelledby="sc-faq-title">
          <div className="sc-container sc-faq-grid">
            <div className="sc-faq-intro"><p className="sc-eyebrow">Questions, answered</p><h2 id="sc-faq-title">The details behind the work.</h2><p>Have a question about the app or the Ohio service? We’re happy to talk it through.</p></div>
            <div className="sc-faq-list">
              {questions.map(({ question, answer }) => (
                <details key={question}><summary>{question}<ChevronDown size={19} aria-hidden="true" /></summary><p>{answer}</p></details>
              ))}
            </div>
          </div>
        </section>

        <section className="sc-section sc-contact" id="contact" aria-labelledby="sc-contact-title">
          <div className="sc-container sc-contact-grid">
            <div className="sc-contact-intro">
              <p className="sc-eyebrow sc-eyebrow-light">Start a conversation</p>
              <h2 id="sc-contact-title">Let’s make the next step clear.</h2>
              <p>Tell us how your team would use Scout Capture or what Ohio property you need documented. We’ll help you find the right path.</p>
              <div className="sc-direct-contact"><a href={`mailto:${EMAIL}`}><Mail size={17} aria-hidden="true" />{EMAIL}</a><a href={`tel:${PHONE.replace(/[^0-9+]/g, "")}`}><Phone size={17} aria-hidden="true" />{PHONE}</a></div>
            </div>
            <form className="sc-contact-form" onSubmit={submitContact}>
              <h3>Tell us what you’re working on</h3>
              <input className="sc-honeypot" type="text" value={form.website} onChange={(event) => setField("website", event.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" />
              <fieldset className="sc-interest-field"><legend>I’m interested in</legend><div className="sc-interest-options">
                {[SOFTWARE_INTEREST, OHIO_INTEREST].map((interest) => <label key={interest}><input type="checkbox" checked={form.interest.includes(interest)} onChange={(event) => {
                  setInterestError(false);
                  setStatus("idle");
                  setForm((previous) => {
                    const selected = event.target.checked ? [...previous.interest, interest] : previous.interest.filter((item) => item !== interest);
                    return { ...previous, interest: selected, propertyAddress: selected.includes(OHIO_INTEREST) ? previous.propertyAddress : "" };
                  });
                }} />{interest}</label>)}
              </div>{interestError && <p className="sc-form-error" role="alert">Select at least one option.</p>}</fieldset>
              <div className="sc-form-row"><label>Name<input value={form.name} onChange={(event) => setField("name", event.target.value)} placeholder="Your name" autoComplete="name" required /></label><label>Company / HOA<input value={form.company} onChange={(event) => setField("company", event.target.value)} placeholder="Company or HOA" autoComplete="organization" /></label></div>
              <div className="sc-form-row"><label>Email<input type="email" value={form.email} onChange={(event) => setField("email", event.target.value)} placeholder="name@company.com" autoComplete="email" required /></label><label>Phone<input value={form.phone} onChange={(event) => setField("phone", formatPhone(event.target.value))} placeholder="(###) ###-####" inputMode="tel" autoComplete="tel" /></label></div>
              {form.interest.includes(OHIO_INTEREST) && <label>Property address (Ohio service only)<input value={form.propertyAddress} onChange={(event) => setField("propertyAddress", event.target.value)} placeholder="Street, City, State" autoComplete="street-address" /></label>}
              <label>What would you like to do?<textarea value={form.message} onChange={(event) => setField("message", event.target.value)} placeholder="Tell us about the property or how your team would use Scout Capture." rows="4" required /></label>
              <button className="sc-button sc-button-navy sc-submit" type="submit" disabled={status === "sending"}>{status === "sending" ? "Sending…" : "Send message"}<ArrowRight size={16} aria-hidden="true" /></button>
              {status === "success" && <p className="sc-form-success" role="status">Thanks — your message was sent. We’ll reply shortly.</p>}
              {status === "error" && <p className="sc-form-error" role="alert">Something went wrong. Please try again or call us.</p>}
            </form>
          </div>
        </section>
      </main>

      <footer className="sc-footer"><div className="sc-container sc-footer-main"><div><img src="/Scout Only Logo Navy Dark NEW.png" alt="SCOUT" /><p>Ohio documentation service · U.S. software access</p></div><nav aria-label="Footer navigation"><a href="#software">Scout Capture</a><a href="#services">Ohio service</a><a href="#faq">FAQ</a><a href="/reports">Client Portal</a><a href="/privacy">Privacy Policy</a></nav></div><div className="sc-container sc-footer-bottom"><span>© {new Date().getFullYear()} Scout Systems LLC. All rights reserved.</span><span>SCOUT’s Ohio service provides visual documentation. Organizations using Scout Capture perform and are responsible for their own work.</span></div></footer>
    </div>
  );
}
