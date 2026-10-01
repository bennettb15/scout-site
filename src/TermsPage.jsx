import { useEffect } from "react";
import "./TermsPage.css";

const terms = {
  service: {
    title: "Ohio Documentation Service Terms",
    label: "Scout-performed documentation",
    intro: "These proposed terms describe Scout Systems LLC's Ohio photographic documentation service: photos of accessible property areas and factual flags for visible conditions. The property, areas to be covered, deliverables, schedule, and price belong in the accepted service order or quote for each job.",
    sections: [
      {
        id: "service-scope",
        title: "What Scout documents",
        paragraphs: [
          "Scout photographs accessible areas of the property identified in the service order. The resulting visual record may include capture dates and times, location or other photo metadata, and factual notes or flags describing visible conditions Scout noticed while documenting the property.",
          "Coverage depends on access, safety, weather, lighting, and conditions at the time of the visit. Scout does not promise that every area, feature, or visible condition will appear in the record. The service order should identify any areas or deliverables that are especially important to the customer.",
        ],
      },
      {
        id: "service-boundaries",
        title: "What the service does not include",
        paragraphs: [
          "Scout does not test building systems, take measurements, diagnose causes, determine code compliance, assess severity, or recommend repairs as part of this documentation service. A flag identifies a visible condition for reference; it is not a finding that the condition is unsafe, defective, or in need of a particular action.",
          "The visual record reflects what was captured at the time of the visit. It does not establish the condition of concealed or inaccessible areas or provide ongoing monitoring.",
        ],
      },
      {
        id: "service-customer",
        title: "Customer responsibilities",
        paragraphs: [
          "The customer must have authority to request access and photography, provide accurate property and contact information, arrange safe and timely access to the agreed areas, and tell Scout about known access restrictions or hazards. Scout may leave an unsafe or inaccessible area undocumented and note that limitation in the deliverable.",
        ],
      },
      {
        id: "service-delivery",
        title: "Delivery and use of the record",
        paragraphs: [
          "Scout will provide the deliverables identified in the service order, which may include a photo record, metadata, and visible-condition flags. The customer may use and share the delivered record for its business purposes, subject to any specific limits agreed in the service order and the rights of people whose information appears in the record. Scout retains its software, templates, trademarks, and other underlying tools.",
          "Anyone receiving a copy should read it as a dated visual record of captured information. Material context needed to understand an individual photo or flag should appear with that item in the record.",
        ],
      },
      {
        id: "service-commercial",
        title: "Price, scheduling, and changes",
        paragraphs: [
          "The accepted service order or quote should state the price, payment terms, visit window, expected delivery, cancellation or rescheduling terms, and any special scope. Changes to a job should be agreed in writing. These proposed terms do not set a price or reserve a visit by themselves.",
        ],
      },
      {
        id: "service-information",
        title: "Property information and contact",
        paragraphs: [
          "Scout may collect and process property information, photographs, notes, and contact details to perform the service and deliver the record. The Privacy Policy explains how Scout handles personal information. Questions about a service order or delivered record can be sent to hello@scoutclear.com.",
        ],
      },
    ],
  },
  software: {
    title: "U.S. Software Subscription Terms",
    label: "Organization use of Scout Capture",
    intro: "These proposed terms describe access to Scout Capture and the Reports Portal by a subscribing organization in the United States. An organization may use the software for documentation, inspections, or other work it is authorized to perform. A software subscription does not include an on-site visit by Scout unless Scout separately accepts an Ohio service order.",
    sections: [
      {
        id: "software-access",
        title: "Subscription and access",
        paragraphs: [
          "Scout Systems LLC provides the organization with access to the Scout Capture app, the Reports Portal, and related features identified in an accepted order or checkout summary. Access is for the organization's authorized users during the subscription term. The organization manages its users, roles, and property permissions, and is responsible for activity under its accounts.",
          "The organization may use the software for its own internal work or to create records for its customers. It may not resell or provide the software itself to another organization without Scout's written permission.",
        ],
      },
      {
        id: "software-work",
        title: "Who performs the work",
        paragraphs: [
          "When an organization uses the software, that organization decides what property areas to capture, enters notes and flag reasons, reviews its records, and decides how to use or share them. A report generated with Scout software does not mean Scout visited the property, selected the observations, or reviewed the report.",
          "If the organization uses Scout Capture for an inspection or another regulated service, the organization performs that service. It is responsible for its personnel, required licenses, applicable standards, testing, measurements, findings, recommendations, final reports, and customer relationship. Scout does not review, certify, or adopt the organization's professional conclusions.",
          "The organization is responsible for obtaining access and permissions for its work, for its agreements with its own customers, and for determining which professional or regulatory requirements apply to its activities. Scout remains responsible for providing the software and handling organization data as described in the accepted subscription terms.",
        ],
      },
      {
        id: "software-records",
        title: "Organization records and data",
        paragraphs: [
          "The organization retains its rights in the photographs, notes, property information, and other content its users provide. It gives Scout permission to host, process, transmit, and display that content as needed to provide the software, generate reports, support users, and protect the service. The organization is responsible for having the rights and permissions needed to provide and share its content.",
          "Authorized organization users may continue to access shared records according to their permissions. A user's account deletion does not automatically delete records already shared with an active organization. The Privacy Policy describes account deletion, organization-record retention, and requests for earlier removal.",
        ],
      },
      {
        id: "software-commercial",
        title: "Fees, renewal, and cancellation",
        paragraphs: [
          "The accepted order or checkout summary should state the subscription price, billing frequency, start date, and renewal terms. The organization may cancel renewal at any time. Cancellation stops future billing, while software access continues until the end of the current paid period. Any separate onboarding, support, or professional service charges should be stated in the order. These proposed terms do not create a paid subscription or an automatic renewal by themselves.",
        ],
      },
      {
        id: "software-platform",
        title: "Platform and support",
        paragraphs: [
          "Scout retains the rights in its software, branding, report templates, and service design. The organization receives a limited right to use the software during its subscription. It must not attempt to interfere with the service, gain unauthorized access, or copy or reverse engineer the software except where law permits.",
          "Scout may maintain and update the software. Any specific uptime, support-response, backup, or export commitments should be stated in the accepted order. Questions about access or the service can be sent to hello@scoutclear.com.",
        ],
      },
    ],
  },
};

export default function TermsPage({ kind }) {
  const page = terms[kind] || terms.software;

  useEffect(() => {
    document.title = `${page.title} | SCOUT`;
  }, [page.title]);

  return (
    <div className="terms-page">
      <header className="terms-header">
        <div className="terms-header-inner">
          <a href="/" aria-label="SCOUT home">
            <img src="/Scout Only Logo Navy Dark NEW.png" alt="SCOUT" className="terms-logo" />
          </a>
          <a href="/privacy" className="terms-link">Privacy Policy</a>
        </div>
      </header>
      <main className="terms-main">
        <p className="terms-kicker">Scout Systems LLC · {page.label}</p>
        <h1 className="terms-title">{page.title}</h1>
        <p className="terms-date">Draft for review · September 30, 2026</p>
        <div className="terms-draft">
          <strong>Proposed terms.</strong> This draft is for business and legal review. It is not presented for customer acceptance and does not govern an existing order or subscription. Commercial and legal provisions still need to be finalized before launch.
        </div>
        <p className="terms-intro">{page.intro}</p>
        <nav aria-label="Terms sections" className="terms-toc">
          <h2>On this page</h2>
          <ul>
            {page.sections.map((section) => (
              <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>
            ))}
          </ul>
        </nav>
        <div className="terms-sections">
          {page.sections.map((section) => (
            <section id={section.id} key={section.id} className="terms-section">
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </section>
          ))}
        </div>
        <section className="terms-related">
          <h2>The other SCOUT offering</h2>
          <p>
            {kind === "service" ? "Organizations using Scout Capture for their own work should review the " : "For Ohio documentation work performed by Scout, review the "}
            <a href={kind === "service" ? "/terms/software" : "/terms/service"}>
              {kind === "service" ? "Software Subscription Terms" : "Ohio Documentation Service Terms"}
            </a>.
          </p>
        </section>
      </main>
      <footer className="terms-footer">
        © {new Date().getFullYear()} Scout Systems LLC · <a href="/">Home</a> · <a href="/privacy">Privacy Policy</a>
      </footer>
    </div>
  );
}
