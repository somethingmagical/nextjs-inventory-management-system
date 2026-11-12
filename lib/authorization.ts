import "server-only";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  PERMISSIONS,
  permissionIsGranted,
  withImpliedViewPermissions,
  type Permission,
} from "@/lib/permissions";

export async function requirePermission(permission: Permission) {
  const session = await auth();
  if (!session?.user?.id) {
    return { status: "unauthenticated" as const };
  }

  const user = await db.user.findFirst({
    where: {
      id: session.user.id,
      deletedAt: null,
      roleRecord: { deletedAt: null },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      image: true,
      role: true,
      roleId: true,
      roleRecord: {
        select: {
          name: true,
          permissions: {
            where: { permission: { in: [...PERMISSIONS] } },
            select: { permission: true },
          },
        },
      },
    },
  });

  if (!user) {
    return { status: "unauthenticated" as const };
  }

  const allowed =
    user.roleRecord.name === "admin" ||
    permissionIsGranted(
      user.roleRecord.permissions.map(({ permission: assigned }) => assigned),
      permission,
    );

  if (!allowed) {
    return { status: "forbidden" as const };
  }

  return {
    status: "allowed" as const,
    userId: user.id,
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      image: user.image,
      role: user.role,
      roleId: user.roleId,
      roleName: user.roleRecord.name,
      permissions: withImpliedViewPermissions(
        user.roleRecord.permissions.map(({ permission: assigned }) => assigned),
      ),
    },
  };
}

export async function requireAdminRole() {
  const session = await auth();
  if (!session?.user?.id) {
    return { status: "unauthenticated" as const };
  }

  const user = await db.user.findFirst({
    where: {
      id: session.user.id,
      deletedAt: null,
      roleRecord: { deletedAt: null },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      image: true,
      role: true,
      roleId: true,
      roleRecord: { select: { name: true } },
    },
  });

  if (!user) {
    return { status: "unauthenticated" as const };
  }
  if (user.roleRecord.name !== "admin") {
    return { status: "forbidden" as const };
  }

  return {
    status: "allowed" as const,
    userId: user.id,
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      image: user.image,
      role: user.role,
      roleId: user.roleId,
      roleName: user.roleRecord.name,
    },
  };
}

export function isAdminRole(roleName: string): boolean {
  return roleName.toLowerCase() === "admin";
}

export function canManageRoleInHierarchy(
  actor: { roleName: string; permissions: readonly string[] },
  target: { name: string; permissions: readonly string[] },
): boolean {
  const actorPermissions = withImpliedViewPermissions(actor.permissions);
  const targetPermissions = withImpliedViewPermissions(target.permissions);
  return (
    isAdminRole(actor.roleName) ||
    (!isAdminRole(target.name) &&
      targetPermissions.every((permission) => actorPermissions.includes(permission)))
  );
}

export async function can(permission: Permission): Promise<boolean> {
  const access = await requirePermission(permission);
  return access.status === "allowed";
}

export async function getCurrentPermissions(): Promise<Permission[]> {
  const session = await auth();
  if (!session?.user?.id) return [];

  const user = await db.user.findFirst({
    where: {
      id: session.user.id,
      deletedAt: null,
      roleRecord: { deletedAt: null },
    },
    select: {
      roleRecord: {
        select: {
          name: true,
          permissions: {
            where: { permission: { in: [...PERMISSIONS] } },
            select: { permission: true },
          },
        },
      },
    },
  });

  if (!user) return [];
  if (user.roleRecord.name === "admin") return [...PERMISSIONS];

  return withImpliedViewPermissions(user.roleRecord.permissions.map(({ permission }) => permission));
}
