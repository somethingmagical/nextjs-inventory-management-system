import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import { canManageRoleInHierarchy } from "@/lib/authorization";
import { getUserManagementAccess } from "../../authorization";
import { userIdSchema } from "../../user-schema";
import { updateUser } from "./actions";
import UserForm from "../../create/UserForm";

export const metadata: Metadata = {
  title: "Edit User",
  description: "Update a staff account",
};

type EditUserPageProps = { params: Promise<{ id: string }> };

export default function EditUserPage({ params }: EditUserPageProps) {
  return (
    <Suspense fallback={<main className="gg-content" aria-busy="true"><p className="gg-muted">Loading user...</p></main>}>
      <AuthorizedEditUser params={params} />
    </Suspense>
  );
}

async function AuthorizedEditUser({ params }: EditUserPageProps) {
  await connection();
  const access = await getUserManagementAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const { id } = await params;
  const parsedId = userIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const [user, roles] = await Promise.all([
    db.user.findFirst({
      where: { id: parsedId.data, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        image: true,
        roleId: true,
        roleRecord: {
          select: {
            name: true,
            permissions: { select: { permission: true } },
          },
        },
      },
    }),
    db.role.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        permissions: { select: { permission: true } },
      },
    }),
  ]);
  if (!user) notFound();
  if (
    !canManageRoleInHierarchy(access.user, {
      name: user.roleRecord.name,
      permissions: user.roleRecord.permissions.map(({ permission }) => permission),
    })
  ) {
    redirect("/users");
  }
  const assignableRoles = roles.filter((role) =>
    canManageRoleInHierarchy(access.user, {
      name: role.name,
      permissions: role.permissions.map(({ permission }) => permission),
    }),
  );

  const name = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;
  const updateAction = updateUser.bind(null, user.id);
  const initialValues = {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phoneNumber: user.phoneNumber ?? "",
    role: assignableRoles.some((role) => role.id === user.roleId) ? user.roleId : "",
    image: user.image,
  };

  return (
    <DashboardLayout user={{ name, image: access.user.image }} pageTitle="Users">
      <UserForm mode="edit" action={updateAction} roles={assignableRoles} initialValues={initialValues} />
    </DashboardLayout>
  );
}
