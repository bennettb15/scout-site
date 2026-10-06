import { normalizeAuditEmail } from "./auditAttribution.js";

// A sealed snapshot can retain historical actor email metadata. Only display
// that email while the corresponding account profile still exists.
export async function loadActiveAttributionEmails(service, candidates) {
  const emails = [...new Set((candidates || []).map(normalizeAuditEmail).filter(Boolean))];
  if (!emails.length) return new Set();
  const active = new Set();
  for (let index = 0; index < emails.length; index += 100) {
    const { data, error } = await service.from("users_profile")
      .select("email")
      .in("email", emails.slice(index, index + 100))
      .is("deleted_at", null);
    if (error) throw error;
    for (const row of data || []) {
      const email = normalizeAuditEmail(row.email);
      if (email) active.add(email);
    }
  }
  return active;
}
