import { useEffect, useState } from "react";
import { CircleUserRound, ClipboardList, FileText, ShieldCheck } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import AccountMenu from "./components/AccountMenu";
import { hasSupabaseConfig, supabase } from "./lib/supabaseClient";

const BRAND = {
  siteTitle: "Manage Account | SCOUT",
  logos: { wordmarkOnly: "/Scout Only Logo Navy Dark NEW.png" },
};

export default function AccountPage() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [existingRequest, setExistingRequest] = useState(null);
  const [deletionEnabled, setDeletionEnabled] = useState(false);
  const [canOpenAdmin, setCanOpenAdmin] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = BRAND.siteTitle;
    if (!supabase) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session || null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession || null);
    });
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      setExistingRequest(null);
      setDeletionEnabled(false);
      return;
    }
    let active = true;
    fetch("/api/account-deletion", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (active && response.ok) {
        setExistingRequest(body.status || "none");
        setDeletionEnabled(body.enabled === true);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.access_token) {
      setCanOpenAdmin(false);
      return undefined;
    }
    let active = true;
    fetch("/api/admin/me", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (active) setCanOpenAdmin(response.ok && body.isAdmin === true);
    }).catch(() => {
      if (active) setCanOpenAdmin(false);
    });
    return () => { active = false; };
  }, [session?.access_token]);

  async function handleSignIn(event) {
    event.preventDefault();
    setError("");
    if (!supabase) {
      setError("Sign-in is unavailable right now.");
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) setError(signInError.message || "Unable to sign in.");
    else setPassword("");
  }

  async function handleSignOut() {
    await supabase?.auth.signOut();
    setConfirmOpen(false);
    setPassword("");
  }

  async function handleDelete() {
    if (!session?.access_token || !deletionEnabled || deleting) return;
    setDeleting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/account-deletion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ confirmation: true }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Unable to delete your account.");
      setCompleted(true);
      setConfirmOpen(false);
      setMessage(body.message || "Your account deletion request was received.");
      await supabase.auth.signOut({ scope: "local" });
      setPassword("");
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete your account.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6">
          <a href="/" aria-label="SCOUT home">
            <img src={BRAND.logos.wordmarkOnly} alt="SCOUT" className="h-10 w-auto" />
          </a>
          {session && (
            <nav aria-label="Portal pages" className="flex flex-wrap items-center justify-end gap-2">
              <a href="/reports" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground/75 shadow-sm hover:text-foreground">
                <FileText className="h-4 w-4" aria-hidden="true" />
                Reports
              </a>
              <a href="/punch-list" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground/75 shadow-sm hover:text-foreground">
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
                Punch List
              </a>
              {canOpenAdmin && (
                <a href="/admin/portal-access" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground/75 shadow-sm hover:text-foreground">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  Admin
                </a>
              )}
              <AccountMenu onSignOut={handleSignOut} />
            </nav>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <div className="mb-7 flex items-center gap-3">
          <CircleUserRound className="h-8 w-8 text-slate-700" aria-hidden="true" />
          <h1 className="text-3xl font-semibold">Manage Account</h1>
        </div>
        {completed ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" role="status">
            <h2 className="text-xl font-semibold">Account deletion requested</h2>
            <p className="mt-3 text-slate-700">{message}</p>
          </section>
        ) : loading ? (
          <p>Loading your account…</p>
        ) : !hasSupabaseConfig ? (
          <p>Account management is unavailable right now.</p>
        ) : !session ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Sign in to manage your account</h2>
            <p className="mt-2 text-slate-600">Use the same email and password as Scout Capture.</p>
            <form onSubmit={handleSignIn} className="mt-5 grid gap-4">
              <label className="grid gap-1 text-sm font-medium">
                Email
                <input className="rounded-lg border border-slate-300 px-3 py-2" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Password
                <input className="rounded-lg border border-slate-300 px-3 py-2" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
              </label>
              {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
              <button className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white" type="submit">Sign In</button>
            </form>
            <a href="/forgot-password" className="mt-4 inline-block text-sm font-medium underline">Forgot Password?</a>
          </section>
        ) : (
          <div className="grid gap-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Your account</h2>
              <p className="mt-3 text-slate-700">{session.user.email}</p>
              <p className="mt-2 text-sm text-slate-600">This login is shared by Scout Capture and the Reports Portal.</p>
            </section>
            {existingRequest && existingRequest !== "none" ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" role="status">
                <h2 className="text-xl font-semibold">Deletion in progress</h2>
                <p className="mt-3 text-slate-700">Your request has been received. Organization access has been removed. We will complete account deletion within 30 days and email you when it is done.</p>
              </section>
            ) : (
            <section className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-red-800">Delete Account</h2>
              <p className="mt-3 text-slate-700">Deleting your account removes your login and personal account details from Scout Capture and the Reports Portal. You will lose access to every organization.</p>
              <p className="mt-3 text-slate-700">Property captures, reports, and activity already shared with an active organization remain available as that organization’s business records. Your login and profile are removed; previously shared business records may contain details you supplied, including report history. If an organization has no active customer users, its data is scheduled for deletion after 90 days. A verified organization contact may request earlier removal.</p>
              <p className="mt-3 text-sm text-slate-600">Organization access ends immediately. We will complete account deletion within 30 days and email you when it is done. This action cannot be undone.</p>
              {!deletionEnabled && (
                <p className="mt-3 text-sm text-amber-800" role="status">Account deletion is being prepared and is not available yet.</p>
              )}
              <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
                <button
                  className="mt-5 rounded-lg bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  onClick={() => { setError(""); setConfirmOpen(true); }}
                  disabled={!deletionEnabled}
                >
                  Delete Account
                </button>
                <Dialog.Portal>
                  <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
                  <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
                    <Dialog.Title className="text-xl font-semibold text-slate-900">Delete your account?</Dialog.Title>
                    <Dialog.Description className="mt-3 text-sm text-slate-700">
                      You will immediately lose access to Scout Capture and the Reports Portal. Your login and personal account details will be deleted within 30 days. Shared business records will remain as described on this page. This cannot be undone.
                    </Dialog.Description>
                    {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}
                    <div className="mt-6 flex flex-wrap justify-end gap-3">
                      <Dialog.Close asChild>
                        <button className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50" type="button" disabled={deleting}>Cancel</button>
                      </Dialog.Close>
                      <button
                        className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting}
                      >
                        {deleting ? "Submitting…" : "Yes, Delete My Account"}
                      </button>
                    </div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </section>
            )}
          </div>
        )}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Need help with your account?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            If you cannot sign in or use the deletion button, email{" "}
            <a className="font-semibold text-blue-800 underline" href="mailto:privacy@scoutclear.com?subject=Scout%20account%20deletion%20request">
              privacy@scoutclear.com
            </a>{" "}
            from your account email address to request deletion. We may ask you to verify your identity before processing the request.
          </p>
        </section>
      </main>
      <footer className="px-5 pb-8 text-center text-sm text-slate-600">
        <a href="/privacy" className="text-blue-800 underline-offset-4 hover:underline">Privacy Policy</a>
      </footer>
    </div>
  );
}
