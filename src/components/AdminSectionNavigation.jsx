import { Building2, ShieldCheck } from "lucide-react";

const tabs = [
  { id: "portal-access", href: "/admin/portal-access", label: "Portal Access", Icon: ShieldCheck },
  { id: "customers", href: "/admin/customers", label: "Customers", Icon: Building2 },
];

export default function AdminSectionNavigation({ active }) {
  return (
    <nav aria-label="Admin sections" className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-[#cbd8e7] bg-[#eaf0f7] p-3 shadow-sm">
      <span className="px-2 text-xs font-bold uppercase tracking-widest text-[#52647d]">Admin pages</span>
      <div className="flex flex-wrap gap-2">
        {tabs.map(({ id, href, label, Icon }) => (
          <a key={id} href={href} aria-current={active === id ? "page" : undefined}
            className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-bold shadow-sm transition-colors ${active === id
              ? "border-[#1c2742] bg-[#1c2742] text-white hover:bg-[#2b3b60]"
              : "border-[#b9c9db] bg-white text-[#1c2742] hover:bg-[#f7f9fc]"}`}>
            <Icon className="h-4 w-4" />
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}
