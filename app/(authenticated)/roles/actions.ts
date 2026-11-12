"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PERMISSION, withImpliedViewPermissions } from "@/lib/permissions";
import { canManageRoleInHierarchy, isAdminRole } from "@/lib/authorization";
import { getRoleManagementAccess } from "./authorization";
import type { RoleActionState } from "./action-state";
import { roleFormSchema, roleIdSchema } from "./role-schema";

function parseRoleForm(formData: FormData) {
  return roleFormSchema.safeParse({
    name: formData.get("name"),
    permissions: formData.getAll("permissions"),
  });
}

export async function createRole(
  _previousState: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  const access = await getRoleManagementAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before creating a role." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage roles." };
  }

  const parsed = parseRoleForm(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const permissions = withImpliedViewPermissions(parsed.data.permissions);
  if (
    !isAdminRole(access.user.roleName) &&
    permissions.some((permission) => !access.user.permissions.includes(permission))
  ) {
    return { status: "error", message: "A role cannot have permissions above your own." };
  }
  if (isAdminRole(parsed.data.name) && !isAdminRole(access.user.roleName)) {
    return {
      status: "error",
      message: "Only an administrator can create the admin role.",
      fieldErrors: { name: ["The admin role name is reserved."] },
    };
  }

  try {
    await db.role.create({
      data: {
        name: parsed.data.name,
        permissions: {
          create: permissions.map((permission) => ({ permission })),
        },
      },
      select: { id: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        status: "error",
        message: "A role with that name already exists.",
        fieldErrors: { name: ["Choose a unique role name."] },
      };
    }
    throw error;
  }

  revalidatePath("/roles");
  redirect("/roles?created=1");
}

export async function updateRole(
  roleId: string,
  _previousState: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  const access = await getRoleManagementAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before updating a role." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage roles." };
  }

  const parsedId = roleIdSchema.safeParse(roleId);
  if (!parsedId.success) {
    return { status: "error", message: "This role could not be found." };
  }

  const parsed = parseRoleForm(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const permissions = withImpliedViewPermissions(parsed.data.permissions);

  try {
    const updated = await db.$transaction(async (transaction) => {
      const currentRole = await transaction.role.findFirst({
        where: { id: parsedId.data, deletedAt: null },
        select: { id: true, name: true, permissions: { select: { permission: true } } },
      });
      if (!currentRole) return false;

      const currentUserExists = await transaction.user.findFirst({
        where: { id: access.user.id, deletedAt: null },
        select: { id: true },
      });
      if (!currentUserExists) {
        return { status: "error" as const, message: "Your user account is no longer available." };
      }

      const actorIsAdmin = isAdminRole(access.user.roleName);
      if (
        !actorIsAdmin &&
        (currentRole.id === access.user.roleId ||
          !canManageRoleInHierarchy(access.user, {
            name: currentRole.name,
            permissions: currentRole.permissions.map(({ permission }) => permission),
          }))
      ) {
        return {
          status: "error" as const,
          message: "You cannot edit a role at or above your own level.",
        };
      }

      if (
        !actorIsAdmin &&
        permissions.some((permission) => !access.user.permissions.includes(permission))
      ) {
        return { status: "error" as const, message: "A role cannot have permissions above your own." };
      }

      const keepsManageRoles = permissions.includes(PERMISSION.manageRoles);
      if (isAdminRole(currentRole.name) && !keepsManageRoles) {
        return {
          status: "error" as const,
          message: "The admin role must always retain Manage Roles.",
        };
      }
      if (isAdminRole(currentRole.name) && parsed.data.name !== "admin") {
        return {
          status: "error" as const,
          message: "The admin role name cannot be changed.",
          fieldErrors: { name: ["The admin role name is reserved."] },
        };
      }
      if (isAdminRole(parsed.data.name) && !isAdminRole(access.user.roleName)) {
        return {
          status: "error" as const,
          message: "Only an administrator can use the admin role name.",
          fieldErrors: { name: ["The admin role name is reserved."] },
        };
      }

      await transaction.role.update({
        where: { id: currentRole.id },
        data: { name: parsed.data.name },
      });
      await transaction.rolePermission.deleteMany({ where: { roleId: currentRole.id } });
      await transaction.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: currentRole.id,
          permission,
        })),
      });
      return true;
    });

    if (updated === false) {
      return { status: "error", message: "This role no longer exists or has been deleted." };
    }
    if (typeof updated !== "boolean") return updated;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        status: "error",
        message: "A role with that name already exists.",
        fieldErrors: { name: ["Choose a unique role name."] },
      };
    }
    throw error;
  }

  revalidatePath("/roles");
  revalidatePath(`/roles/${encodeURIComponent(parsedId.data)}/edit`);
  redirect("/roles?updated=1");
}

export async function deleteRole(roleId: string): Promise<RoleActionState> {
  const access = await getRoleManagementAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before deleting a role." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage roles." };
  }

  const parsedId = roleIdSchema.safeParse(roleId);
  if (!parsedId.success) {
    return { status: "error", message: "This role could not be found." };
  }

  const result = await db.$transaction(async (transaction) => {
    const role = await transaction.role.findFirst({
      where: { id: parsedId.data, deletedAt: null },
      select: { id: true, name: true, permissions: { select: { permission: true } } },
    });
    if (!role) {
      return { status: "error" as const, message: "This role no longer exists or has already been deleted." };
    }

    if (
      !canManageRoleInHierarchy(access.user, {
        name: role.name,
        permissions: role.permissions.map(({ permission }) => permission),
      })
    ) {
      return {
        status: "error" as const,
        message: "You cannot delete a role at or above your own level.",
      };
    }

    const assignedUsers = await transaction.user.count({
      where: { roleId: role.id },
    });
    if (assignedUsers > 0) {
      return {
        status: "error" as const,
        message: `“${role.name}” is assigned to ${assignedUsers} user${assignedUsers === 1 ? "" : "s"} and cannot be deleted.`,
      };
    }

    const deleted = await transaction.role.updateMany({
      where: { id: role.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return deleted.count === 1
      ? { status: "success" as const }
      : { status: "error" as const, message: "This role could not be deleted. Refresh and try again." };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

  if (result.status === "error") {
    return { status: "error", message: result.message };
  }

  revalidatePath("/roles");
  return { status: "success", message: "Role deleted successfully." };
}
