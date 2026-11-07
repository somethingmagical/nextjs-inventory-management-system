"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

const tabs = [
  { label: "Warehouse Reports", href: "/reports/warehouse" },
  { label: "Sale Reports", href: "/reports/sale" },
  { label: "Stock Reports", href: "/reports/stock" },
  { label: "Purchase Reports", href: "/reports/purchase" },
  { label: "Top Selling Products Reports", href: "/reports/top-selling-products" },
  { label: "More", href: "/reports/more", more: true },
];

export default function ReportsTabs() {
  const pathname = usePathname();

  return (
    <nav className="rpt-tabs" aria-label="Reports">
      {tabs.map((tab) => {
        const active = pathname === tab.href
          || (tab.href === "/reports/warehouse" && pathname === "/reports");
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`rpt-tab ${active ? "is-active" : ""} ${tab.more ? "rpt-more" : ""}`}
            href={tab.href}
            key={tab.href}
          >
            {tab.label}
            {tab.more && <ChevronDown aria-hidden="true" />}
          </Link>
        );
      })}
    </nav>
  );
}
