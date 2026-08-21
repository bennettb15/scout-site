const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

function authURL(path) {
  return `${supabaseUrl}/auth/v1${path}`;
}

async function authRequest(path, { method = "GET", accessToken, body } = {}) {
  const response = await fetch(authURL(path), {
    method,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken || supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload.error_description ||
        payload.msg ||
        payload.message ||
        "Supabase Auth request failed."
    );
  }

  return payload;
}

export async function exchangeRecoveryCode(code) {
  return authRequest("/token?grant_type=pkce", {
    method: "POST",
    body: { auth_code: code },
  });
}

export async function updateRecoveryPassword(accessToken, password) {
  return authRequest("/user", {
    method: "PUT",
    accessToken,
    body: { password },
  });
}
