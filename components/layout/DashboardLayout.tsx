"use client";

import { Suspense, useState, type ReactNode } from "react";
import Footer from "./Footer";
import Header from "./Header";
import RouteLoadingBar from "./RouteLoadingBar";
import Sidebar from "./Sidebar";

export default function DashboardLayout({
  children,
  user,
  pageTitle = "Dashboard",
}: {
  children: ReactNode;
  user: { name: string; image: string | null };
  pageTitle?: string;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <>
      <Suspense fallback={null}>
        <RouteLoadingBar />
      </Suspense>
      <div className={`gg-app ${isCollapsed ? "is-collapsed" : ""}`}>
        <Sidebar />
        <div className="gg-main">
          <Header
            onToggleSidebar={() => setIsCollapsed((collapsed) => !collapsed)}
            user={user}
            pageTitle={pageTitle}
          />
          {children}
          <Footer />
        </div>
      </div>
    </>
  );
}
