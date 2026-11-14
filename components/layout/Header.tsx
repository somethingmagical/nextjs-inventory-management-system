import Link from "next/link";
import { usePathname } from "next/navigation";
import { getActiveNavigationIcon, Icon } from "./Sidebar";
import { PERMISSION, type Permission } from "@/lib/permissions";
import type { ReactNode } from "react";
import UserMenu from "./UserMenu";

export default function Header({
  onToggleSidebar,
  sidebarExpanded,
  user,
  pageTitle = "Dashboard",
  pageIcon = "dashboard",
  permissions,
  headerContent,
}: {
  onToggleSidebar: () => void;
  sidebarExpanded: boolean;
  user: { name: string; image: string | null };
  pageTitle?: string;
  pageIcon?: "dashboard" | "plus" | "chart";
  permissions: Permission[];
  headerContent?: ReactNode;
}) {
  const pathname = usePathname();
  const isDashboard = pathname === "/dashboard";
  const activePageTitle = isDashboard ? "Dashboard" : pageTitle;
  const activePageIcon = pathname ? getActiveNavigationIcon(pathname) : null;
  const showBreadcrumb = Boolean(activePageTitle && (isDashboard || !headerContent));

  return (
    <header className={`gg-topbar${headerContent && !isDashboard ? " gg-topbar--with-nav" : ""}`}>
      <button
        className="gg-icon-btn"
        type="button"
        onClick={onToggleSidebar}
        aria-label="Toggle navigation"
        aria-expanded={sidebarExpanded}
        aria-controls="main-navigation"
      >
        <Icon name="menu" />
      </button>
      <div className="gg-topbar-title">
        <span className="gg-page-chip"><Icon name={isDashboard ? "dashboard" : activePageIcon ?? pageIcon} /></span>
        {showBreadcrumb && <h1 className="gg-breadcrumb">{activePageTitle}</h1>}
      </div>
      {!isDashboard && headerContent}
      <div className="gg-topbar-spacer" />
      {permissions.includes(PERMISSION.managePosScreen) && (
        <Link className="gg-pos-btn" href="/pos"><Icon name="monitor" size={16} />POS</Link>
      )}
      <Link className="gg-icon-btn gg-apps-btn" href="/dashboard" aria-label="Apps" title="Dashboard">
        <Icon name="grid" />
      </Link>
      <UserMenu name={user.name} image={user.image} />
    </header>
  );
}
