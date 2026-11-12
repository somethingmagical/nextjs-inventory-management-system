"use client";

import { createContext, Suspense, useCallback, useState, type ReactNode } from "react";
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
  const [headerConfig, setHeaderConfig] = useState<DashboardHeaderConfig>({
    pageTitle,
    pageIcon,
    headerContent,
  });
  const updateHeaderConfig = useCallback((config: DashboardHeaderConfig) => {
    setHeaderConfig(config);
  }, []);

  return (
    <DashboardHeaderConfigContext.Provider value={updateHeaderConfig}>
      <Suspense fallback={null}>
        <RouteLoadingBar />
      </Suspense>
      <div className={`gg-app ${isCollapsed ? "is-collapsed" : ""}`}>
        <Sidebar
          permissions={permissions}
          isCollapsed={isCollapsed}
          appName={appName}
          faviconPath={faviconPath}
          headerLogoPath={headerLogoPath}
        />
        <div className="gg-main">
          <Header
            onToggleSidebar={() => setIsCollapsed((collapsed) => !collapsed)}
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
