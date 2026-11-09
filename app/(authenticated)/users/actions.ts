"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { canManageRoleInHierarchy } from "@/lib/authorization";
import { getUserManagementAccess } from "./authorization";
import { userIdSchema } from "./user-schema";
import type { UserActionState } from "./create/action-state";

const deleteUserInputSchema = z.object({ userId: userIdSchema });

export async function deleteUser(userId: string): Promise<UserActionState> {
  const access = await getUserManagementAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before deleting a user." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage users." };
  }

  const parsed = deleteUserInputSchema.safeParse({ userId });
  if (!parsed.success) return { status: "error", message: "This user could not be found." };
  if (parsed.data.userId === access.user.id) {
    return { status: "error", message: "You cannot delete your own account." };
  }

  const result = await db.$transaction(async (transaction) => {
    const target = await transaction.user.findFirst({
      where: { id: parsed.data.userId, deletedAt: null },
      select: {
        id: true,
        roleId: true,
        roleRecord: {
          select: {
            name: true,
            permissions: { select: { permission: true } },
          },
        },
      },
    });
    if (!target) {
      return {
        status: "error" as const,
        message: "This user no longer exists or has already been deleted.",
      };
    }

    if (
      !canManageRoleInHierarchy(access.user, {
        name: target.roleRecord.name,
        permissions: target.roleRecord.permissions.map(({ permission }) => permission),
      })
    ) {
      return {
        status: "error" as const,
        message: "You cannot delete a user at or above your own level.",
      };
    }

    if (target.roleRecord.name.toLowerCase() === "admin") {
      const activeAdmins = await transaction.user.count({
        where: { roleId: target.roleId, deletedAt: null },
      });
      if (activeAdmins <= 1) {
        return {
          status: "error" as const,
          message: "The last administrator cannot be deleted. Assign another administrator first.",
        };
      }
    }

    const updated = await transaction.user.updateMany({
      where: { id: target.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (updated.count !== 1) {
      return {
        status: "error" as const,
        message: "This user could not be deleted. Refresh and try again.",
      };
    }

    return { status: "success" as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

  if (result.status === "error") return result;

  revalidatePath("/users");
  return { status: "success", message: "User deleted successfully." };
}
