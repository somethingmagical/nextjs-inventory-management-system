import { auth } from "@/auth";
import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import DashboardShell from "@/components/layout/DashboardShell";
import { getCurrentPermissions } from "@/lib/authorization";
import { db } from "@/lib/db";
import RouteSpinner from "@/components/layout/RouteSpinner";
import { getApplicationSettings } from "@/features/settings/application";

export default function AuthenticatedLayout({ children }: {
  children: ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <main className="gg-content gg-route-loading" aria-busy="true">
          <RouteSpinner />
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
  if (!session) redirect("/");

  const [user, permissions, settings] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: { firstName: true, lastName: true, email: true, image: true },
    }),
    getCurrentPermissions(),
    getApplicationSettings(),
  ]);
  if (!user) redirect("/");

  return (
    <DashboardShell
      user={{
        name: `${user.firstName} ${user.lastName}`.trim() || user.email,
        image: user.image,
      }}
      pageTitle="Dashboard"
      pageIcon="dashboard"
      permissions={permissions}
      appName={settings.appName}
      faviconPath={settings.faviconPath}
    >
      {children}
    </DashboardShell>
  );
}
