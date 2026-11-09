import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getApplicationSettings } from "@/features/settings/application";
import { requireAdminRole } from "@/lib/authorization";
import SettingsForm from "./SettingsForm";
import ThemeCustomizer from "./ThemeCustomizer";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage website name and favicon",
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
  const access = await requireAdminRole();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const settings = await getApplicationSettings();
  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;

  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Settings">
      <main className="gg-content">
        <SettingsForm settings={settings} />
        <ThemeCustomizer />
      </main>
    </DashboardLayout>
  );
}
