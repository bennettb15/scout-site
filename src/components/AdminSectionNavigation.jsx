const tabs = [
  { id: "portal-access", href: "/admin/portal-access", label: "Portal Access" },
  { id: "customers", href: "/admin/customers", label: "Customers" },
];

export default function AdminSectionNavigation({ active }) {
  return (
    <nav aria-label="Admin sections" className="mb-6 flex flex-wrap gap-6 border-b border-slate-200">
      {tabs.map((tab) => (
        <a key={tab.id} href={tab.href} aria-current={active === tab.id ? "page" : undefined}
          className={`inline-flex min-h-11 items-center border-b-2 px-1 pb-2 text-sm font-semibold transition-colors ${active === tab.id
            ? "border-[#1c2742] text-[#1c2742]"
            : "border-transparent text-foreground/60 hover:text-foreground"}`}>
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
