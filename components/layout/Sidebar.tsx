"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { PERMISSION, type Permission } from "@/lib/permissions";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "Inventory";

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

type NavigationLink = {
  label: string;
  href?: string;
  permission: Permission;
  activePrefix?: string;
  excludePrefix?: string;
};

type NavigationItem = {
  label: string;
  icon: string;
  href?: string;
  activePrefix?: string;
  permission?: Permission;
  children?: NavigationLink[];
};

const navigation: NavigationItem[] = [
  { label: "Dashboard", icon: "dashboard", href: "/dashboard", permission: PERMISSION.manageDashboard },
  {
    label: "Products",
    icon: "boxes",
    children: [
      { label: "Products", href: "/products", permission: PERMISSION.manageProducts, activePrefix: "/products" },
      { label: "Product Category", href: "/product-categories", permission: PERMISSION.manageProductCategories, activePrefix: "/product-categories" },
      { label: "Brands", href: "/brands", permission: PERMISSION.manageBrands, activePrefix: "/brands" },
      // { label: "Units", permission: PERMISSION.manageUnits },
      // { label: "Base Units", permission: PERMISSION.manageUnits },
      // { label: "Print Barcode", permission: PERMISSION.manageProducts },
    ],
  },
  { label: "Adjustments", icon: "sliders", href: "/adjustments", permission: PERMISSION.manageAdjustments },
  // { label: "Quotations", icon: "fileText", permission: PERMISSION.manageQuotations },
  {
    label: "Purchases",
    icon: "receipt",
    children: [
      { label: "Purchases", href: "/purchases", permission: PERMISSION.managePurchase, activePrefix: "/purchases", excludePrefix: "/purchases/returns" },
      { label: "Purchases Returns", href: "/purchases/returns", permission: PERMISSION.managePurchaseReturn, activePrefix: "/purchases/returns" },
    ],
  },
  {
    label: "Sales",
    icon: "shoppingCart",
    children: [
      { label: "Sales", href: "/sales", permission: PERMISSION.manageSale, activePrefix: "/sales", excludePrefix: "/sales/returns" },
      { label: "Sales Returns", href: "/sales/returns", permission: PERMISSION.manageSaleReturn, activePrefix: "/sales/returns" },
    ],
  },
  { label: "Transfers", icon: "repeat", href: "/transfers", permission: PERMISSION.manageTransfers },
  {
    label: "Expenses",
    icon: "wallet",
    children: [
      { label: "Expenses", href: "/expenses", permission: PERMISSION.manageExpenses, activePrefix: "/expenses" },
      { label: "Expense Categories", href: "/expense-categories", permission: PERMISSION.manageExpenseCategories, activePrefix: "/expense-categories" },
    ],
  },
  {
    label: "Peoples",
    icon: "users",
    children: [
      { label: "Customers", href: "/customers", permission: PERMISSION.manageCustomers, activePrefix: "/customers" },
      { label: "Suppliers", href: "/suppliers", permission: PERMISSION.manageSuppliers, activePrefix: "/suppliers" },
      { label: "Users", href: "/users", permission: PERMISSION.manageUsers, activePrefix: "/users" },
    ],
  },
  { label: "Roles/Permissions", icon: "shieldCheck", href: "/roles", permission: PERMISSION.manageRoles },
  { label: "Warehouse", icon: "warehouse", href: "/warehouse", permission: PERMISSION.manageWarehouses, activePrefix: "/warehouse" },
  { label: "Reports", icon: "chart", href: "/reports/warehouse", permission: PERMISSION.manageReports },
  // { label: "Currencies", icon: "dollar", permission: PERMISSION.manageCurrency },
  // { label: "Languages", icon: "languages", permission: PERMISSION.manageLanguage },
  // {
  //   label: "Templates",
  //   icon: "layoutTemplate",
  //   children: [
  //     { label: "SMS Templates", permission: PERMISSION.manageSmsTemplates },
  //     { label: "Email Templates", permission: PERMISSION.manageEmailTemplates },
  //   ],
  // },
  // { label: "Settings", icon: "settings", permission: PERMISSION.manageSetting },
];

export function getActiveNavigationIcon(pathname: string): string | null {
  for (const item of navigation) {
    if (item.children?.some((child) => (
      child.activePrefix
      && pathname.startsWith(child.activePrefix)
      && (!child.excludePrefix || !pathname.startsWith(child.excludePrefix))
    ))) {
      return item.icon;
    }

    if (
      item.href === pathname
      || (item.href && pathname.startsWith(`${item.href}/`))
      || (item.activePrefix && pathname.startsWith(item.activePrefix))
    ) {
      return item.icon;
    }
  }
  return null;
}

export default function Sidebar({
  permissions,
  isCollapsed,
}: {
  permissions: Permission[];
  isCollapsed: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const allowedPermissions = useMemo(() => new Set(permissions), [permissions]);
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const visibleNavigation = useMemo(() => navigation.flatMap((item) => {
    if (item.permission && !allowedPermissions.has(item.permission)) return [];

    if (item.children) {
      const allowedChildren = item.children.filter((child) => allowedPermissions.has(child.permission));
      if (!allowedChildren.length) return [];
      if (!normalizedSearch) return [{ ...item, children: allowedChildren }];

      const parentMatches = item.label.toLocaleLowerCase().includes(normalizedSearch);
      const matchingChildren = parentMatches
        ? allowedChildren
        : allowedChildren.filter((child) => child.label.toLocaleLowerCase().includes(normalizedSearch));
      return matchingChildren.length ? [{ ...item, children: matchingChildren }] : [];
    }

    return !normalizedSearch || item.label.toLocaleLowerCase().includes(normalizedSearch)
      ? [item]
      : [];
  }), [allowedPermissions, normalizedSearch]);

  function toggleGroup(label: string) {
    setOpenGroups((groups) => groups.includes(label) ? groups.filter((group) => group !== label) : [...groups, label]);
  }

  return (
    <aside className="gg-sidebar">
      <Link className="gg-brand" href="/dashboard" aria-label={`${appName} dashboard`} title="Dashboard">
        <img className="gg-brand-favicon" src="/favicon.ico" alt="" width={30} height={30} aria-hidden="true" />
        {/* <span className="gg-brand-mark">I</span> */}
        <span className="gg-brand-name">{appName}</span>
      </Link>
      <div className="gg-sidebar-search">
        <div className="gg-input-icon">
          <Icon name="search" />
          <input
            className="gg-input"
            type="search"
            placeholder="Search"
            aria-label="Search navigation"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
      </div>
      <nav className="gg-nav" aria-label="Main navigation">
        {visibleNavigation.map((item) => {
          const children = item.children;

          const isOpen = openGroups.includes(item.label)
            || Boolean(normalizedSearch && children)
            || children?.some((child) => child.activePrefix && pathname.startsWith(child.activePrefix));
          const content = (
            <>
              <Icon name={item.icon} className="gg-nav-ico" />
              <span className="gg-nav-label">{item.label}</span>
              {children ? <Icon name="chevronRight" className="gg-nav-chev" /> : null}
            </>
          );
          if (children) {
            const primaryLink = children.find((child) => child.href);
            const handleGroupClick = () => {
              const isIconMode = isCollapsed || window.matchMedia("(max-width: 820px)").matches;
              if (isIconMode && primaryLink?.href) {
                router.push(primaryLink.href);
                return;
              }
              toggleGroup(item.label);
            };

            return (
              <div key={item.label} className={`gg-nav-group ${isOpen ? "is-open" : ""}`}>
                <button
                  className="gg-nav-item gg-nav-toggle"
                  type="button"
                  aria-expanded={isOpen}
                  aria-label={item.label}
                  title={item.label}
                  onClick={handleGroupClick}
                >
                  {content}
                </button>
                <div className="gg-nav-sub">
                  {children.map((child) => {
                    const active = child.activePrefix
                      ? pathname.startsWith(child.activePrefix)
                        && (!child.excludePrefix || !pathname.startsWith(child.excludePrefix))
                      : false;
                    const className = `gg-nav-item ${active ? "is-active" : ""}`;
                    return child.href ? (
                      <Link className={className} href={child.href} key={child.label}>
                        <span className="gg-nav-label">{child.label}</span>
                      </Link>
                    ) : (
                      <a className={className} href="#" key={child.label} onClick={(event) => event.preventDefault()}>
                        <span className="gg-nav-label">{child.label}</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            );
          }
          const active = item.href === pathname
            || (item.href && pathname.startsWith(`${item.href}/`))
            || (item.activePrefix && pathname.startsWith(item.activePrefix));
          return (
            <Link
              key={item.label}
              className={`gg-nav-item ${active ? "is-active" : ""}`}
              href={item.href ?? "#"}
            >
              {content}
            </Link>
          );
        })}
        {normalizedSearch && visibleNavigation.length === 0 && (
          <p className="gg-muted gg-nav-empty" role="status">No navigation items found.</p>
        )}
      </nav>
    </aside>
  );
}
