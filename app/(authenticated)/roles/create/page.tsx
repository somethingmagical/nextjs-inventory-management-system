import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { isAdminRole } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";
import { getRoleManagementAccess } from "../authorization";
import { createRole } from "../actions";
import RoleForm from "../RoleForm";

export const metadata: Metadata = {
  title: "Create Role",
  description: "Create a role and assign permissions",
};

export default function CreateRolePage() {
  return (
    <Suspense fallback={<main className="gg-content" aria-busy="true"><p className="gg-muted">Loading role form...</p></main>}>
      <AuthorizedCreateRole />
    </Suspense>
  );
}

async function AuthorizedCreateRole() {
  await connection();
  const access = await getRoleManagementAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const name = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;
  const availablePermissions = isAdminRole(access.user.roleName)
    ? PERMISSIONS
    : PERMISSIONS.filter((permission) => access.user.permissions.includes(permission));
  return (
    <DashboardLayout user={{ name, image: access.user.image }} pageTitle="Roles">
      <RoleForm mode="create" action={createRole} availablePermissions={availablePermissions} />
    </DashboardLayout>
  );
}
