import { CircleUserRound, LogOut } from "lucide-react";

export default function AccountMenu({ onSignOut }) {
  return (
    <details className="group relative">
      <summary
        aria-label="Account"
        className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-border bg-background text-foreground/75 shadow-sm hover:text-foreground [&::-webkit-details-marker]:hidden"
      >
        <CircleUserRound className="h-6 w-6" aria-hidden="true" />
      </summary>
      <div className="absolute right-0 z-30 mt-2 min-w-52 rounded-xl border border-border bg-background p-1 shadow-lg">
        <a
          href="/account"
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
