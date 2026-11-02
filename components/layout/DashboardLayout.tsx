"use client";

import { useState, type ReactNode } from "react";
import Footer from "./Footer";
import Header from "./Header";
import Sidebar from "./Sidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className={`gg-app ${isCollapsed ? "is-collapsed" : ""}`}>
      <Sidebar />
      <div className="gg-main">
        <Header onToggleSidebar={() => setIsCollapsed((collapsed) => !collapsed)} />
        {children}
        <Footer />
      </div>
    </div>
  );
}
