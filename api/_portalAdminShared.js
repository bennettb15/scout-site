import {
  authenticateRequest,
  createServiceClient,
  methodAllowed,
  sendJson,
} from "./_reportPortalShared.js";

export const PRIMARY_ADMIN_EMAIL = "brian@scoutclear.com";
export const DEFAULT_ADMIN_EMAILS = [
  "bennettb15@gmail.com",
  PRIMARY_ADMIN_EMAIL,
];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function adminEmailSet() {
  const configured = [
    process.env.SCOUT_PORTAL_ADMIN_EMAILS,
    process.env.PORTAL_ADMIN_EMAILS,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","));

  return new Set(
    [...DEFAULT_ADMIN_EMAILS, ...configured]
      .map((email) => normalizeEmail(email))
      .filter(Boolean)
  );
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function validateEmail(value) {
  const email = normalizeEmail(value);
  return EMAIL_PATTERN.test(email) ? email : "";
}

export function validateUuid(value) {
  const id = String(value || "").trim();
  return UUID_PATTERN.test(id) ? id : "";
}

export function isApprovedAdminEmail(email) {
  return adminEmailSet().has(normalizeEmail(email));
}

export async function requirePortalAdmin(req, res, methods) {
  if (req.method === "OPTIONS") {
    methodAllowed(req, res, methods);
    return null;
  }

  if (!methodAllowed(req, res, methods)) return null;

  const auth = await authenticateRequest(req);
  if (auth.error) {
    sendJson(res, 401, { error: auth.error });
    return null;
  }

  const email = normalizeEmail(auth.user?.email);
  if (!isApprovedAdminEmail(email)) {
    sendJson(res, 403, { error: "Admin access required." });
    return null;
  }

  return {
    ...auth,
    adminEmail: email,
    service: createServiceClient(),
  };
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) {
    return JSON.parse(req.body);
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

export function inviteRedirectTo(req) {
  const configured = process.env.SCOUT_PORTAL_INVITE_REDIRECT_URL;
  if (configured) return configured;

  const siteUrl = process.env.SCOUT_SITE_URL || process.env.VITE_SITE_URL;
  if (siteUrl) return `${String(siteUrl).replace(/\/$/, "")}/accept-invite`;

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/accept-invite`;
  }

  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return host ? `${proto}://${host}/accept-invite` : undefined;
}

export async function findAuthUserByEmail(service, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;

    const match = (data?.users || []).find(
      (user) => normalizeEmail(user.email) === email
    );
    if (match) return match;
    if (!data?.users || data.users.length < 1000) break;
  }
  return null;
}

export async function ensureUserProfile(service, user, actorId) {
  const email = normalizeEmail(user?.email);
  if (!user?.id || !email) {
    throw new Error("A valid Supabase Auth user is required.");
  }

  const { error } = await service.from("users_profile").upsert(
    {
      id: user.id,
      email,
      full_name:
        user.user_metadata?.full_name || user.user_metadata?.name || null,
      updated_by: actorId,
      deleted_at: null,
    },
    { onConflict: "id" }
  );
  if (error) throw error;
}

export async function loadOrg(service, orgId) {
  const { data, error } = await service
    .from("orgs")
    .select("id,name")
    .eq("id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}
