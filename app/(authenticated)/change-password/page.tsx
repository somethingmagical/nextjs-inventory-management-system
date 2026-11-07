import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import ChangePasswordForm from "./ChangePasswordForm";

export const metadata: Metadata = {
  title: "Change Password",
  description: "Change your Inventory account password",
};

export default function ChangePasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading password settings...</p>
        </main>
      }
    >
      <AuthenticatedChangePassword />
    </Suspense>
  );
}

async function AuthenticatedChangePassword() {
  await connection();
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { firstName: true, lastName: true, email: true, image: true },
  });

  if (!user) {
    redirect("/");
  }

  const name = `${user.firstName} ${user.lastName}`.trim() || user.email;

  return (
    <DashboardLayout user={{ name, image: user.image }} pageTitle="Change Password">
      <ChangePasswordForm />
    </DashboardLayout>
  );
}
