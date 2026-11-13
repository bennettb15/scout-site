import { ClipboardList, FileText, Images, Menu, UsersRound } from "lucide-react";

const BASE_LINK = "inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium shadow-sm transition-colors";
const INACTIVE_LINK = "border-border bg-background text-foreground/75 hover:bg-slate-50 hover:text-foreground";
const ACTIVE_LINK = "border-[#1c2742] bg-[#1c2742] text-white hover:bg-[#2b3b60] hover:text-white";

const LINKS = [
  { id: "reports", href: "/reports", label: "Reports", Icon: FileText },
  { id: "punch-list", href: "/punch-list", label: "Punch List", Icon: ClipboardList },
  { id: "gallery", href: "/gallery", label: "Gallery", Icon: Images },
  { id: "clients", href: "/clients", label: "Clients", Icon: UsersRound },
];

export default function PortalNavigation({ active, className = "" }) {
  const currentLabel = LINKS.find((link) => link.id === active)?.label ||
    (active === "account" ? "Account" : active === "admin" ? "Admin" : "Menu");

  return (
    <nav aria-label="Portal navigation" className={`relative flex items-center ${className}`}>
      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        {LINKS.map(({ id, href, label, Icon }) => (
          <a key={id} href={href} aria-current={active === id ? "page" : undefined}
            className={`${BASE_LINK} ${active === id ? ACTIVE_LINK : INACTIVE_LINK}`}>
            <Icon className="h-4 w-4" />
            {label}
          </a>
        ))}
      </div>
      <div className="flex items-center gap-2 sm:hidden">
        <span className="text-sm font-semibold text-[#1c2742]">{currentLabel}</span>
        <details className="group relative">
          <summary aria-label="Open navigation menu" className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-border bg-background text-[#1c2742] shadow-sm [&::-webkit-details-marker]:hidden">
            <Menu className="h-5 w-5" aria-hidden="true" />
          </summary>
          <div className="absolute right-0 z-50 mt-2 w-48 rounded-xl border border-border bg-background p-1 shadow-lg">
            {LINKS.map(({ id, href, label, Icon }) => (
              <a key={id} href={href} aria-current={active === id ? "page" : undefined}
                className={`flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium ${active === id ? "bg-[#1c2742] text-white" : "text-foreground hover:bg-muted"}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </a>
            ))}
          </div>
        </details>
      </div>
    </nav>
  );
}
