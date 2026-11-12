import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getApplicationSettings } from "@/features/settings/application";
import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";
import SettingsForm from "./SettingsForm";
import ThemeCustomizer from "./ThemeCustomizer";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage website name, favicon, and header logo",
};

export default function SettingsPage() {
  return (
    <Suspense fallback={<main className="gg-content" aria-busy="true"><p className="gg-muted">Loading settings...</p></main>}>
      <AuthorizedSettingsPage />
    </Suspense>
  );
}

async function AuthorizedSettingsPage() {
  await connection();
  const access = await requirePermission(PERMISSION.manageSetting);
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const settings = await getApplicationSettings();
  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;

  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Settings">
      <main className="gg-content">
        {access.user.roleName === "admin" && <SettingsForm settings={settings} />}
        <ThemeCustomizer />
      </main>
    </DashboardLayout>
  );
}
