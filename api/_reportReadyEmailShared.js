import { Resend } from "resend";
import { PORTAL_EMAIL_LOGO_URL, escapeHtml } from "./_portalInviteShared.js";
import {
  isPunchlistVisitSessionType,
  normalizeReportPackageSessionType,
} from "../api-lib/reportPackageSession.js";

function reportFromEmail() {
  return process.env.SCOUT_REPORT_FROM_EMAIL || process.env.CONTACT_FROM_EMAIL || "";
}

function reportReplyToEmail() {
  return process.env.SCOUT_REPORT_REPLY_TO_EMAIL || process.env.SCOUT_INVITE_REPLY_TO_EMAIL || "";
}

export function assertReportReadyEmailConfigured() {
  if (!process.env.RESEND_API_KEY || !reportFromEmail()) {
    throw new Error(
      "Report-ready email is not configured. Set RESEND_API_KEY and SCOUT_REPORT_FROM_EMAIL or CONTACT_FROM_EMAIL."
    );
  }
}

function propertyDisplayName(property) {
  const cityState = [property?.city, property?.state].filter(Boolean).join(", ");
  const address = [property?.addressLine1 || property?.address_line1, cityState]
    .filter(Boolean)
    .join(" ");
  return property?.name || address || "your property";
}

function easternTimeLine(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function reportReadyEmailPayload({
  email,
  org,
  property,
  reportsUrl,
  sessionType,
  readyAt,
  completedAt,
  from = reportFromEmail(),
  replyTo = reportReplyToEmail(),
}) {
  const normalizedSessionType = normalizeReportPackageSessionType(sessionType);
  const isPunchlist = isPunchlistVisitSessionType(normalizedSessionType);
  const orgName = org?.name || "SCOUT";
  const propertyName = propertyDisplayName(property);
  const safeOrgName = escapeHtml(orgName);
  const safePropertyName = escapeHtml(propertyName);
  const safeUrl = escapeHtml(reportsUrl);
  const readyTime = easternTimeLine(readyAt || completedAt);
  const safeReadyTime = escapeHtml(readyTime);
  const subject = isPunchlist
    ? "Your SCOUT punchlist update is ready"
    : "Your SCOUT report is ready";
  const heading = isPunchlist
    ? "Your SCOUT punchlist update is ready"
    : "Your SCOUT report is ready";
  const intro = isPunchlist
    ? `A punchlist update for ${safePropertyName} is ready in your SCOUT Client Portal.`
    : `The property report package for ${safePropertyName} is ready in your SCOUT Client Portal.`;
  const textIntro = isPunchlist
    ? `A punchlist update for ${propertyName} is ready in your SCOUT Client Portal.`
    : `The property report package for ${propertyName} is ready in your SCOUT Client Portal.`;
  const readyTimeHtml = safeReadyTime
    ? `<p style="margin:8px 0 0;font-size:13px;line-height:1.5;color:#64748b">Ready: ${safeReadyTime}</p>`
    : "";
  const readyTimeText = readyTime ? [`Ready: ${readyTime}`] : [];

  return {
    from,
    to: email,
    ...(replyTo ? { reply_to: replyTo } : {}),
    subject,
    html: `
      <div style="margin:0;padding:0;background:#f5f7fb">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fb;padding:32px 16px">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
                <tr>
                  <td style="padding:28px 32px 8px">
                    <img src="${PORTAL_EMAIL_LOGO_URL}" width="120" alt="ScoutClear" style="display:block;border:0;outline:none;text-decoration:none" />
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 32px 8px;font-family:Arial,Helvetica,sans-serif">
                    <h1 style="margin:0;font-size:24px;line-height:1.25;color:#1c2742">${heading}</h1>
                    <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#334155">${intro}</p>
                    <p style="margin:8px 0 0;font-size:13px;line-height:1.5;color:#64748b">Organization: ${safeOrgName}</p>
                    ${readyTimeHtml}
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 32px 32px;font-family:Arial,Helvetica,sans-serif">
                    <a href="${safeUrl}" style="display:inline-block;background:#1c2742;color:#ffffff;text-decoration:none;border-radius:8px;padding:12px 18px;font-size:14px;font-weight:700">Open Reports Portal</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `,
    text: [
      heading,
      "",
      textIntro,
      `Organization: ${orgName}`,
      ...readyTimeText,
      "",
      `Open Reports Portal: ${reportsUrl}`,
    ].join("\n"),
  };
}

export async function sendReportReadyEmail({
  email,
  org,
  property,
  reportsUrl,
  sessionType,
  readyAt,
  completedAt,
}) {
  assertReportReadyEmailConfigured();
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send(
    reportReadyEmailPayload({
      email,
      org,
      property,
      reportsUrl,
      sessionType,
      readyAt,
      completedAt,
    })
  );
  if (error) throw error;
}
