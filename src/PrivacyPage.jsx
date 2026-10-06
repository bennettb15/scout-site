import { useEffect } from "react";

const sections = [
  {
    id: "information",
    title: "Information we handle",
    paragraphs: [
      "Account and access information includes your name, email address, invitations, organization membership and role, and sign-in activity. Accounts are invitation-only. Scout Systems or an authorized organization administrator sends invitations. Scout Capture and the Reports Portal use the same login. Our authentication provider processes passwords and sessions.",
      "Property records can include property addresses and details, client contact details entered by users, photographs, notes, observations, punch list activity, reports, dates and times, and information about who captured or changed a record. If you allow location access, GPS coordinates and accuracy may be included in photo metadata. Photos and notes may themselves contain information about people or places.",
      "If you contact us through the website, we receive the name, email address, message, and any company, phone number, or property address you provide. The app uses local preferences and file timestamps to manage stored work. Website and portal hosting may record technical request information, such as IP address, browser information, and request times. We may receive aggregate website traffic statistics from Vercel, such as page views, referring sites, browser and device type, and approximate location.",
    ],
  },
  {
    id: "use",
    title: "How we use information",
    paragraphs: [
      "We use this information to send invitations, authenticate users, control organization and property access, capture and upload property records, prepare and deliver reports, respond to inquiries, provide support, troubleshoot problems, and protect and operate the service.",
    ],
  },
  {
    id: "access",
    title: "Organization access and service providers",
    paragraphs: [
      "An organization's authorized users can access shared property records according to their roles and property permissions. Organization administrators can grant or revoke access. Scout Systems personnel may access information when needed to operate or support the service.",
      "We use Supabase for authentication, databases, and file storage; Vercel to host the website and portal; and Resend to send invitations, account messages, reports, and website inquiries. These providers process information to deliver those services. Supabase, Vercel, and Resend describe access controls and encryption of data in transit and at rest among their published security measures. If you choose to use an app-created iCloud copy, Apple also stores that copy under your Apple account.",
    ],
  },
  {
    id: "device",
    title: "Device and iCloud copies",
    paragraphs: [
      "Scout Capture keeps capture files, drafts, and preferences on the device so work can continue and uploads can be retried. Optional app-created iCloud copies and older Scout Capture iCloud files may also exist. Deleting your Scout Systems account does not automatically remove files already stored on a device, in your personal iCloud account, or in copies someone else has downloaded. You can manage local and legacy iCloud storage in the app and through your device or Apple account settings.",
    ],
  },
  {
    id: "retention",
    title: "Retention and account deletion",
    paragraphs: [
      <>You can request deletion of your shared Scout Capture and Reports Portal account at <a className="text-blue-800 underline" href="https://www.scoutclear.com/account">https://www.scoutclear.com/account</a>. Confirming a deletion request while signed in immediately ends your access to Scout Capture and the Reports Portal. Account cleanup starts on demand, removes the login and personal profile, and is completed within 30 days. We email you when it is complete. If you cannot sign in, contact privacy@scoutclear.com; we may verify your identity before processing the request.</>,
      "Captures, reports, and activity already shared with an active organization remain available to its authorized users as organization records; there is no fixed deletion date while the organization remains active. We remove the departing account's identifiers from supported attribution and metadata during cleanup. Contributed photographs, notes, and other content may still remain in those shared records and may contain details you supplied. If an organization has no active customer users, its data is scheduled for deletion after 90 days. A verified organization contact can ask us to remove that organization's records sooner.",
      "Revoking your access to an organization is different from deleting your account: the login may stay active even if you have no organization access. Website contact-form inquiries are emailed to us through Resend. We do not currently have a fixed deletion schedule for those emails; we keep them for responses and follow-up. You can contact us to ask about or request removal of an inquiry.",
    ],
  },
  {
    id: "choices",
    title: "Your choices and requests",
    paragraphs: [
      "You can ask an organization administrator to correct your access or shared records. For questions about your personal information, an account deletion request, an inquiry, or earlier organization-record removal, email privacy@scoutclear.com. We may need to verify your identity or your authority to act for an organization before changing shared records.",
      "You can change camera, photo, and location permissions in iOS Settings. This does not remove information already saved in captures or reports.",
    ],
  },
  {
    id: "changes",
    title: "Changes to this policy",
    paragraphs: [
      "We may update this policy as the service changes. The updated version and its date will appear on this page.",
    ],
  },
];

export default function PrivacyPage() {
  useEffect(() => {
    document.title = "Privacy Policy | SCOUT";
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-6">
          <a href="/" aria-label="SCOUT home" className="inline-flex items-center">
            <img src="/Scout Only Logo Navy Dark NEW.png" alt="SCOUT" className="h-10 w-auto" />
          </a>
          <a href="/account" className="text-sm font-semibold text-blue-800 underline-offset-4 hover:underline">
            Manage account and deletion
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-6 sm:py-14">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-800">Scout Systems LLC</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">Privacy Policy</h1>
        <p className="mt-3 text-sm text-slate-600">Last updated September 29, 2026</p>
        <div className="mt-8 space-y-4 text-base leading-7 text-slate-700">
          <p>Scout Systems LLC operates the Scout Capture iOS app, the Reports Portal, and scoutclear.com. This policy explains the information we handle when organizations invite people to use these services or visitors contact us through the website. Initial app availability is in the United States.</p>
        </div>
        <nav aria-label="Privacy policy sections" className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">On this page</h2>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {sections.map((section) => (
              <li key={section.id}><a className="text-blue-800 underline-offset-4 hover:underline" href={`#${section.id}`}>{section.title}</a></li>
            ))}
          </ul>
        </nav>
        <div className="mt-9 space-y-10">
          {sections.map((section) => (
            <section id={section.id} key={section.id} className="scroll-mt-8">
              <h2 className="text-2xl font-semibold tracking-tight">{section.title}</h2>
              <div className="mt-4 space-y-4 text-base leading-7 text-slate-700">
                {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              </div>
            </section>
          ))}
        </div>
        <section className="mt-12 rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <h2 className="text-lg font-semibold">Contact us about privacy</h2>
          <p className="mt-2 text-slate-700">Email <a className="font-semibold text-blue-800 underline" href="mailto:privacy@scoutclear.com">privacy@scoutclear.com</a> with your question or request.</p>
        </section>
      </main>
      <footer className="border-t border-slate-200 bg-white px-5 py-6 text-center text-sm text-slate-600">
        © {new Date().getFullYear()} Scout Systems LLC · <a href="/" className="text-blue-800 hover:underline">Home</a>
      </footer>
    </div>
  );
}
