"use client";

import { createContext, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import type { Permission } from "@/lib/permissions";
import Footer from "./Footer";
import Header from "./Header";
import RouteLoadingBar from "./RouteLoadingBar";
import Sidebar from "./Sidebar";

type DashboardHeaderConfig = {
  pageTitle: string;
  pageIcon: "dashboard" | "plus" | "chart";
  headerContent?: ReactNode;
};

export const DashboardHeaderConfigContext = createContext<
  ((config: DashboardHeaderConfig) => void) | null
>(null);

export default function DashboardShell({
  children,
  user,
  pageTitle,
  pageIcon,
  permissions,
  headerContent,
  appName,
  faviconPath,
  headerLogoPath,
}: {
  children: ReactNode;
  user: { name: string; image: string | null };
  pageTitle: string;
  pageIcon: "dashboard" | "plus" | "chart";
  permissions: Permission[];
  headerContent?: ReactNode;
  appName: string;
  faviconPath: string;
  headerLogoPath: string | null;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const [headerConfig, setHeaderConfig] = useState<DashboardHeaderConfig>({
    pageTitle,
    pageIcon,
    headerContent,
  });
  const updateHeaderConfig = useCallback((config: DashboardHeaderConfig) => {
    setHeaderConfig(config);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 820px)");
    const updateMobileMode = () => {
      setIsMobile(mediaQuery.matches);
      if (!mediaQuery.matches) setIsMobileNavigationOpen(false);
    };
    updateMobileMode();
    mediaQuery.addEventListener("change", updateMobileMode);
    return () => mediaQuery.removeEventListener("change", updateMobileMode);
  }, []);

  return (
    <DashboardHeaderConfigContext.Provider value={updateHeaderConfig}>
      <Suspense fallback={null}>
        <RouteLoadingBar />
      </Suspense>
      <div className={`gg-app ${isCollapsed ? "is-collapsed" : ""}${isMobileNavigationOpen ? " is-mobile-nav-open" : ""}`}>
        <Sidebar
          permissions={permissions}
          isCollapsed={isCollapsed}
          isMobileNavigationOpen={isMobileNavigationOpen}
          onNavigate={() => setIsMobileNavigationOpen(false)}
          appName={appName}
          faviconPath={faviconPath}
          headerLogoPath={headerLogoPath}
        />
        {isMobileNavigationOpen && (
          <button
            className="gg-mobile-nav-backdrop"
            type="button"
            aria-label="Close navigation"
            onClick={() => setIsMobileNavigationOpen(false)}
          />
        )}
        <div className="gg-main">
          <Header
            onToggleSidebar={() => {
              if (isMobile) setIsMobileNavigationOpen((open) => !open);
              else setIsCollapsed((collapsed) => !collapsed);
            }}
            sidebarExpanded={isMobile ? isMobileNavigationOpen : !isCollapsed}
            user={user}
            pageTitle={headerConfig.pageTitle}
            pageIcon={headerConfig.pageIcon}
            permissions={permissions}
            headerContent={headerConfig.headerContent}
          />
          {children}
          <Footer appName={appName} />
        </div>
      </div>
    </DashboardHeaderConfigContext.Provider>
  );
}
