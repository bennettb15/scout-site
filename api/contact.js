// api/contact.js
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export default async function handler(req, res) {
  // Allow the browser to call this endpoint
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { name, email, phone, message, website } = req.body || {};

    // Honeypot anti-spam: bots will often fill this hidden field
    if (website) return res.status(200).json({ ok: true });

    if (!name || !email || !message) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const safeName = escapeHtml(String(name).trim()).slice(0, 120);
    const safeEmail = escapeHtml(String(email).trim()).slice(0, 200);
    const safePhone = escapeHtml(String(phone || "").trim()).slice(0, 40);
    const safeMessage = escapeHtml(String(message).trim()).slice(0, 5000);

    const toAddress = process.env.CONTACT_TO_EMAIL;     // where you receive inquiries
    const fromAddress = process.env.CONTACT_FROM_EMAIL; // verified sender in Resend

    if (!toAddress || !fromAddress) {
      return res.status(500).json({ error: "Server is not configured" });
    }

    await resend.emails.send({
      from: fromAddress,
      to: toAddress,
      subject: `New SCOUT inquiry — ${safeName}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height:1.5">
          <h2>New Contact Form Submission</h2>
          <p><strong>Name:</strong> ${safeName}</p>
          <p><strong>Email:</strong> ${safeEmail}</p>
          ${safePhone ? `<p><strong>Phone:</strong> ${safePhone}</p>` : ""}
          <hr/>
          <p><strong>Message:</strong></p>
          <p style="white-space: pre-wrap">${safeMessage}</p>
        </div>
      `,
      replyTo: safeEmail,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to send message" });
  }
}
