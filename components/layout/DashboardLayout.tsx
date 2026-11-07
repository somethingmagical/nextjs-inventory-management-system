"use client";

import { useContext, useEffect, type ReactNode } from "react";
import { DashboardHeaderConfigContext } from "./DashboardShell";

export default function DashboardLayout({
  children,
  pageTitle = "Dashboard",
  pageIcon = "dashboard",
  headerContent,
}: {
  children: ReactNode;
  user: { name: string; image: string | null };
  pageTitle?: string;
  pageIcon?: "dashboard" | "plus" | "chart";
  headerContent?: ReactNode;
}) {
  const updateHeaderConfig = useContext(DashboardHeaderConfigContext);

  if (!updateHeaderConfig) {
    throw new Error("DashboardLayout must be rendered inside the authenticated dashboard layout.");
  }

  useEffect(() => {
    updateHeaderConfig({ pageTitle, pageIcon, headerContent });
  }, [headerContent, pageIcon, pageTitle, updateHeaderConfig]);

  return children;
}
