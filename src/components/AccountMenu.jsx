import { CircleUserRound, LogOut, ShieldCheck } from "lucide-react";
import { navigateAdminPage } from "../lib/adminNavigation";

export default function AccountMenu({ onSignOut, active = false, canOpenAdmin = false, adminActive = false }) {
  const isCurrent = active || adminActive;

  return (
    <details className="group relative">
      <summary
        aria-label={adminActive ? "Account and Admin, current page" : active ? "Account, current page" : "Account"}
        className={`flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border shadow-sm [&::-webkit-details-marker]:hidden ${isCurrent ? "border-[#1c2742] bg-[#1c2742] text-white hover:bg-[#2b3b60]" : "border-border bg-background text-foreground/75 hover:text-foreground"}`}
      >
        <CircleUserRound className="h-6 w-6" aria-hidden="true" />
      </summary>
      <div className="absolute right-0 z-30 mt-2 min-w-52 rounded-xl border border-border bg-background p-1 shadow-lg">
        {canOpenAdmin && (
          <a
            href="/admin/portal-access"
            onClick={(event) => navigateAdminPage(event, "/admin/portal-access")}
            aria-current={adminActive ? "page" : undefined}
            className={`flex min-h-10 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium ${adminActive ? "bg-[#1c2742] text-white hover:bg-[#2b3b60]" : "text-foreground hover:bg-muted"}`}
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Admin
          </a>
        )}
        <a
          href="/account"
          aria-current={active ? "page" : undefined}
          className="flex min-h-10 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium text-foreground hover:bg-muted"
        >
          Manage Account
        </a>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-2 flex min-h-10 w-full items-center gap-2 whitespace-nowrap rounded-lg border-t border-slate-200 px-3 pt-2 text-left text-sm font-medium text-red-700 hover:bg-red-50 hover:text-red-800"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign Out
        </button>
      </div>
    </details>
  );
}
