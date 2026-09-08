export const EMAIL_VERIFICATION_TYPES = new Set(["email", "signup"]);

export function verificationLinkValuesFromUrl(url) {
  const parsedUrl = new URL(url, "https://www.scoutclear.com");
  const query = parsedUrl.searchParams;
  const hash = new URLSearchParams(parsedUrl.hash.replace(/^#/, ""));

  return {
    code: query.get("code"),
    confirmationUrl:
      query.get("confirmation_url") || hash.get("confirmation_url") || "",
    tokenHash: query.get("token_hash") || hash.get("token_hash"),
    type: query.get("type") || hash.get("type"),
    accessToken: hash.get("access_token"),
    refreshToken: hash.get("refresh_token"),
    error:
      query.get("error_description") ||
      query.get("error") ||
      hash.get("error_description") ||
      hash.get("error"),
  };
}

export function hasVerificationCallback({
  code,
  tokenHash,
  accessToken,
  refreshToken,
}) {
  return Boolean(code || tokenHash || (accessToken && refreshToken));
}

export function safeSupabaseConfirmationUrl(rawUrl, supabaseUrl) {
  if (!rawUrl || !supabaseUrl) return "";

  let parsedConfirmationUrl;
  let parsedSupabaseUrl;

  try {
    parsedConfirmationUrl = new URL(rawUrl);
    parsedSupabaseUrl = new URL(supabaseUrl);
  } catch {
    return "";
  }

  if (parsedConfirmationUrl.protocol !== "https:") return "";
  if (parsedConfirmationUrl.host !== parsedSupabaseUrl.host) return "";
  if (!parsedConfirmationUrl.pathname.endsWith("/auth/v1/verify")) return "";

  const token = parsedConfirmationUrl.searchParams.get("token");
  const tokenHash = parsedConfirmationUrl.searchParams.get("token_hash");
  const type = parsedConfirmationUrl.searchParams.get("type");
  if ((!token && !tokenHash) || !type) return "";

  return parsedConfirmationUrl.toString();
}

