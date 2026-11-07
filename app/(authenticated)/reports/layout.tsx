import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";
import ReportsTabs from "./ReportsTabs";

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading reports...</p>
        </main>
      }
    >
      <AuthorizedReports>{children}</AuthorizedReports>
    </Suspense>
  );
}

async function AuthorizedReports({ children }: { children: ReactNode }) {
  await connection();
  const access = await requirePermission(PERMISSION.manageReports);

  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;

  return (
    <DashboardLayout
      user={{ name: displayName, image: access.user.image }}
      pageTitle=""
      pageIcon="chart"
      headerContent={<ReportsTabs />}
    >
      {children}
    </DashboardLayout>
  );
}
