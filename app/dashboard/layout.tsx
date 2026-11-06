import { Suspense, type ReactNode } from "react";
import { auth } from "@/auth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { redirect } from "next/navigation";
import { connection } from "next/server";

export default function DashboardRouteLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <div className="dash-section-gap">
            <p className="gg-muted">Loading dashboard...</p>
          </div>
        </main>
      }
    >
      <AuthenticatedDashboard>{children}</AuthenticatedDashboard>
    </Suspense>
  );
}

async function AuthenticatedDashboard({ children }: { children: ReactNode }) {
  await connection();
  const session = await auth();

  if (!session) {
    redirect("/");
  }

  return (
    <DashboardLayout
      user={{
        name: session.user.name || session.user.email || "Account",
        image: session.user.image ?? null,
      }}
    >
      {children}
    </DashboardLayout>
  );
}
