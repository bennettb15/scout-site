import { navigateAdminPage } from "../lib/adminNavigation";
import { CircleUserRound, ClipboardList, FileText, Images, ShieldCheck } from "lucide-react";

const BASE_LINK = "inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium shadow-sm transition-colors";
const INACTIVE_LINK = "border-border bg-background text-foreground/75 hover:bg-slate-50 hover:text-foreground";
const ACTIVE_LINK = "border-[#1c2742] bg-[#1c2742] text-white hover:bg-[#2b3b60] hover:text-white";

export default function PortalNavigation({ active, canOpenAdmin = false, className = "" }) {
  const links = [
    { id: "reports", href: "/reports", label: "Reports", Icon: FileText },
    { id: "punch-list", href: "/punch-list", label: "Punch List", Icon: ClipboardList },
    { id: "gallery", href: "/gallery", label: "Gallery", Icon: Images },
    { id: "clients", href: "/clients", label: "Clients", Icon: CircleUserRound },
  ];
  if (canOpenAdmin) links.push({ id: "admin", href: "/admin/portal-access", label: "Admin", Icon: ShieldCheck });

  return (
    <nav aria-label="Portal navigation" className={`flex flex-wrap items-center gap-2 ${className}`}>
      {links.map(({ id, href, label, Icon }) => (
        <a key={id} href={href} onClick={id === "admin" ? (event) => navigateAdminPage(event, href) : undefined} aria-current={active === id ? "page" : undefined}
          className={`${BASE_LINK} ${active === id ? ACTIVE_LINK : INACTIVE_LINK}`}>
          <Icon className="h-4 w-4" />
          {label}
        </a>
      ))}
    </nav>
  );
}
