import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    })
  : null;

export async function exchangeRecoveryCode(code) {
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return data.session;
}

export async function verifyEmailTokenHash(tokenHash, type = "recovery") {
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });
  if (error) throw error;
  return data.session;
}

export async function verifyRecoveryTokenHash(tokenHash) {
  return verifyEmailTokenHash(tokenHash, "recovery");
}

export async function requestPasswordReset(email, redirectTo) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) throw error;
  return data;
}

export async function setRecoverySession(accessToken, refreshToken) {
  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  return data.session;
}

export async function updateRecoveryPassword(password) {
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  return data.user;
}
