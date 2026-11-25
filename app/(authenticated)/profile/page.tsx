import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import ProfileForm from "./ProfileForm";
import { PERMISSION, permissionIsGranted } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Profile",
  description: "Manage your Inventory profile",
};

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading profile...</p>
        </main>
      }
    >
      <AuthenticatedProfile />
    </Suspense>
  );
}

async function AuthenticatedProfile() {
  await connection();
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      phoneNumber: true,
      image: true,
      role: true,
      roleRecord: {
        select: {
          name: true,
          permissions: {
            where: { permission: PERMISSION.editOwnProfile },
            select: { permission: true },
          },
        },
      },
    },
  });

  if (!user) {
    redirect("/");
  }

  const name = `${user.firstName} ${user.lastName}`.trim() || user.email;

  return (
    <DashboardLayout user={{ name, image: user.image }} pageTitle="Profile">
      <ProfileForm
        canEditOwnProfile={
          user.roleRecord.name === "admin"
          || permissionIsGranted(
            user.roleRecord.permissions.map(({ permission }) => permission),
            PERMISSION.editOwnProfile,
          )
        }
        profile={{
          ...user,
          phoneNumber: user.phoneNumber ?? "",
        }}
      />
    </DashboardLayout>
  );
}
