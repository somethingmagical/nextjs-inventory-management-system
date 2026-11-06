"use client";

import { useState, type ReactNode } from "react";
import Footer from "./Footer";
import Header from "./Header";
import Sidebar from "./Sidebar";

export default function DashboardLayout({
  children,
  user,
}: {
  children: ReactNode;
  user: { name: string; image: string | null };
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className={`gg-app ${isCollapsed ? "is-collapsed" : ""}`}>
      <Sidebar />
      <div className="gg-main">
        <Header
          onToggleSidebar={() => setIsCollapsed((collapsed) => !collapsed)}
          user={user}
        />
        {children}
        <Footer />
      </div>
    </div>
  );
}
