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

// Read raw body (Vercel serverless functions do NOT auto-parse like Next.js API routes)
async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = await readJsonBody(req);

    // Include ALL fields your frontend sends (safe even if unused)
    const {
      name,
      company,
      email,
      phone,
      propertyAddress,
      message,
      website, // honeypot
    } = body || {};

    // Honeypot anti-spam
    if (website) return res.status(200).json({ ok: true });

    if (!name || !email || !message) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const safeName = escapeHtml(String(name).trim()).slice(0, 120);
    const safeCompany = escapeHtml(String(company || "").trim()).slice(0, 200);
    const safeEmail = escapeHtml(String(email).trim()).slice(0, 200);
    const safePhone = escapeHtml(String(phone || "").trim()).slice(0, 40);
    const safePropertyAddress = escapeHtml(String(propertyAddress || "").trim()).slice(0, 300);
    const safeMessage = escapeHtml(String(message).trim()).slice(0, 5000);

    const toAddress = process.env.CONTACT_TO_EMAIL;     // where you receive inquiries
    const fromAddress = process.env.CONTACT_FROM_EMAIL; // verified sender in Resend
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey || !toAddress || !fromAddress) {
      return res.status(500).json({
        error: "Server is not configured (missing RESEND_API_KEY / CONTACT_TO_EMAIL / CONTACT_FROM_EMAIL)",
      });
    }

const { data, error } = await resend.emails.send({
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

if (error) {
  console.error("RESEND ERROR:", error);
  return res.status(500).json({ error: "Resend failed", details: error });
}

console.log("RESEND SENT:", data);


    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to send message" });
  }
}
