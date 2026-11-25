import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import BusinessInsightsPanel from "@/components/business-insights/BusinessInsightsPanel";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Business Insights",
  description: "AI-generated business insights based on inventory performance",
};

export default function BusinessInsightsPage() {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading business insights...</p>
        </main>
      }
    >
      <AuthorizedBusinessInsightsPage />
    </Suspense>
  );
}

async function AuthorizedBusinessInsightsPage() {
  await connection();
  const access = await requirePermission(PERMISSION.viewBusinessInsights);

  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim()
    || access.user.email;

  return (
    <DashboardLayout
      user={{ name: displayName, image: access.user.image }}
      pageTitle="Business Insights"
      pageIcon="chart"
    >
      <main className="gg-content">
        <div className="page-head">
          <div>
            <h1 className="gg-page-title">Business Insights</h1>
            <p className="gg-muted">
              Generate operational recommendations from recent business activity.
            </p>
          </div>
        </div>
        <BusinessInsightsPanel />
      </main>
    </DashboardLayout>
  );
}
