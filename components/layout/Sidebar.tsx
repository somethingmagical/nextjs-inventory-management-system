"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

const iconPaths: Record<string, ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="4" rx="1.5" /><rect x="14" y="11" width="7" height="10" rx="2" /><rect x="3" y="12" width="7" height="9" rx="2" /></>,
  boxes: <><path d="m3 7.5 9-4.5 9 4.5-9 4.5-9-4.5Z" /><path d="M3 7.5v9L12 21l9-4.5v-9M12 12v9" /></>,
  sliders: <><path d="M4 6h7M4 12h14M4 18h9" /><circle cx="15" cy="6" r="2.5" /><circle cx="12" cy="18" r="2.5" /></>,
  fileText: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M8 13h8M8 17h8" /></>,
  receipt: <><path d="M5 4.5h14v15l-2.5-1.5L14 19l-2.5-1.5L9 19l-2.5-1.5L4 19v-14Z" /><path d="M8 8h8M8 12h8" /></>,
  shoppingCart: <><circle cx="9" cy="18" r="1.5" /><circle cx="17" cy="18" r="1.5" /><path d="M3 4h2l2.4 9.4a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 7H7" /></>,
  shoppingBag: <><path d="M5 8h14l1 13H4L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></>,
  repeat: <><path d="M4 8h12a3 3 0 0 1 3 3v1M20 16H8a3 3 0 0 1-3-3v-1" /><path d="m16 4 4 4-4 4M8 20l-4-4 4-4" /></>,
  wallet: <><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9Z" /><path d="M15 12h5v3h-5M4 8h15" /></>,
  users: <><path d="M16 19a4 4 0 0 0-8 0" /><circle cx="12" cy="8" r="3" /><path d="M19 19a4 4 0 0 0-2.5-3.6M5 19a4 4 0 0 1 2.5-3.6" /></>,
  shieldCheck: <><path d="M12 3 5.5 6v5.5c0 4.1 2.6 7.7 6.5 9.5 3.9-1.8 6.5-5.4 6.5-9.5V6L12 3Z" /><path d="m9 12 2 2 4-4" /></>,
  warehouse: <><path d="m3 9 9-5 9 5M5 10v9h14v-9M9 19v-6h6v6" /></>,
  chart: <><path d="M4 18V7M9 18V4M14 18v-9M19 18v-5" /></>,
  dollar: <><path d="M12 3v18M16 7.5c0-1.4-1.7-2.5-4-2.5s-4 1.1-4 2.5 1.7 2.5 4 2.5 4 1.1 4 2.5-1.7 2.5-4 2.5-4-1.1-4-2.5" /></>,
  languages: <><path d="M4 7h16M4 12h10M4 17h7" /><path d="M18 5a7 7 0 0 1 0 14M16 9a7 7 0 0 1 0 12" /></>,
  layoutTemplate: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="13" y="3" width="8" height="4" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="12" width="7" height="9" rx="1.5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.8 1.8 0 0 0-3 .9v.2a2 2 0 1 1-4 0v-.2a1.8 1.8 0 0 0-3-.9l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.8 1.8 0 0 0-.9-3H2.8a2 2 0 1 1 0-4H3a1.8 1.8 0 0 0 .9-3l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.8 1.8 0 0 0 3-.9V2.8a2 2 0 1 1 4 0V3a1.8 1.8 0 0 0 3 .9l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.8 1.8 0 0 0 .9 3h.2a2 2 0 1 1 0 4h-.2a1.8 1.8 0 0 0-.9 3Z" /></>,
  search: <><circle cx="11" cy="11" r="5.5" /><path d="m16 16 4 4" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  grid: <><rect x="3" y="3" width="6" height="6" rx="1.5" /><rect x="15" y="3" width="6" height="4" rx="1.5" /><rect x="15" y="11" width="6" height="10" rx="1.5" /><rect x="3" y="13" width="6" height="8" rx="1.5" /></>,
  monitor: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  arrowRight: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  arrowLeft: <><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></>,
  banknote: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="3" /></>,
  minusCircle: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>,
};

export function Icon({ name, className, size = 18 }: { name: string; className?: string; size?: number }) {
  return (
    <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {iconPaths[name] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}

const navigation = [
  { label: "Dashboard", icon: "dashboard", href: "/dashboard" },
  { label: "Products", icon: "boxes", children: ["Products", "Product Categories", "Brands", "Units", "Base Units", "Print Barcode"] },
  { label: "Adjustments", icon: "sliders" },
  { label: "Quotations", icon: "fileText" },
  { label: "Purchases", icon: "receipt", children: ["Purchases", "Purchases Returns"] },
  { label: "Sales", icon: "shoppingCart", children: ["Sales", "Sales Returns"] },
  { label: "Transfers", icon: "repeat" },
  { label: "Expenses", icon: "wallet", children: ["Expenses", "Expense Categories"] },
  { label: "Peoples", icon: "users", children: ["Customers", "Suppliers", "Users"] },
  { label: "Roles/Permissions", icon: "shieldCheck" },
  { label: "Warehouse", icon: "warehouse", href: "/warehouse" },
  { label: "Reports", icon: "chart" },
  { label: "Currencies", icon: "dollar" },
  { label: "Languages", icon: "languages" },
  { label: "Templates", icon: "layoutTemplate", children: ["SMS Templates", "Email Templates"] },
  { label: "Settings", icon: "settings" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<string[]>([]);

  function toggleGroup(label: string) {
    setOpenGroups((groups) => groups.includes(label) ? groups.filter((group) => group !== label) : [...groups, label]);
  }

  return (
    <aside className="gg-sidebar">
      <Link className="gg-brand" href="/dashboard" aria-label="Inventory dashboard">
        <span className="gg-brand-mark">I</span>
        <span className="gg-brand-name">Inventory</span>
      </Link>
      <div className="gg-sidebar-search">
        <div className="gg-input-icon">
          <Icon name="search" />
          <input className="gg-input" type="search" placeholder="Search" aria-label="Search navigation" />
        </div>
      </div>
      <nav className="gg-nav" aria-label="Main navigation">
        {navigation.map((item) => {
          const isOpen = openGroups.includes(item.label);
          const content = (
            <>
              <Icon name={item.icon} className="gg-nav-ico" />
              <span className="gg-nav-label">{item.label}</span>
              {item.children ? <Icon name="chevronRight" className="gg-nav-chev" /> : null}
            </>
          );
          if (item.children) {
            return (
              <div key={item.label} className={`gg-nav-group ${isOpen ? "is-open" : ""}`}>
                <button className="gg-nav-item gg-nav-toggle" type="button" aria-expanded={isOpen} onClick={() => toggleGroup(item.label)}>{content}</button>
                <div className="gg-nav-sub">
                  {item.children.map((child) => <a className="gg-nav-item" href="#" key={child} onClick={(event) => event.preventDefault()}><span className="gg-nav-label">{child}</span></a>)}
                </div>
              </div>
            );
          }
          return (
            <Link
              key={item.label}
              className={`gg-nav-item ${
                item.href === pathname || (item.href === "/warehouse" && pathname.startsWith("/warehouse/"))
                  ? "is-active"
                  : ""
              }`}
              href={item.href ?? "#"}
            >
              {content}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
