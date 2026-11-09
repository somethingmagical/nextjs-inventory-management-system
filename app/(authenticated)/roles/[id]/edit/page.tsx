import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import { canManageRoleInHierarchy, isAdminRole } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";
import { getRoleManagementAccess } from "../../authorization";
import { updateRole } from "../../actions";
import { roleIdSchema } from "../../role-schema";
import RoleForm from "../../RoleForm";

export const metadata: Metadata = {
  title: "Edit Role",
  description: "Update a role and its permissions",
};

type EditRolePageProps = { params: Promise<{ id: string }> };

export default function EditRolePage({ params }: EditRolePageProps) {
  return (
    <Suspense fallback={<main className="gg-content" aria-busy="true"><p className="gg-muted">Loading role...</p></main>}>
      <AuthorizedEditRole params={params} />
    </Suspense>
  );
}

async function AuthorizedEditRole({ params }: EditRolePageProps) {
  await connection();
  const access = await getRoleManagementAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const { id } = await params;
  const parsedId = roleIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const role = await db.role.findFirst({
    where: { id: parsedId.data, deletedAt: null },
    select: {
      id: true,
      name: true,
      permissions: { select: { permission: true } },
    },
  });
  if (!role) notFound();
  if (
    !canManageRoleInHierarchy(access.user, {
      name: role.name,
      permissions: role.permissions.map(({ permission }) => permission),
    }) ||
    (!isAdminRole(access.user.roleName) && role.id === access.user.roleId)
  ) {
    redirect("/roles");
  }

  const name = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;
  const updateAction = updateRole.bind(null, role.id);
  const availablePermissions = isAdminRole(access.user.roleName)
    ? PERMISSIONS
    : PERMISSIONS.filter((permission) => access.user.permissions.includes(permission));
  return (
    <DashboardLayout user={{ name, image: access.user.image }} pageTitle="Roles">
      <RoleForm
        mode="edit"
        action={updateAction}
        initialName={role.name}
        initialPermissions={role.permissions.map(({ permission }) => permission)}
        availablePermissions={availablePermissions}
      />
    </DashboardLayout>
  );
}
