"use server";

import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getUserManagementAccess } from "../../authorization";
import { updateUserSchema, userIdSchema } from "../../user-schema";
import { getUserImageEntry, removeUserImage, saveUserImage } from "../../user-image";
import type { UserActionState } from "../../create/action-state";

export async function updateUser(
  userId: string,
  _previousState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const access = await getUserManagementAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before updating a user." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage users." };
  }

  const parsedId = userIdSchema.safeParse(userId);
  if (!parsedId.success) return { status: "error", message: "This user could not be found." };

  const parsed = updateUserSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phoneNumber: formData.get("phoneNumber") ?? "",
    role: formData.get("role"),
    password: formData.get("password") ?? "",
    confirmPassword: formData.get("confirmPassword") ?? "",
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const imageEntry = getUserImageEntry(formData);
  if (imageEntry.status === "invalid") {
    return { status: "error", message: "The selected image could not be read. Please choose it again." };
  }

  const user = await db.user.findFirst({
    where: { id: parsedId.data, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, email: true, phoneNumber: true, role: true, image: true },
  });
  if (!user) return { status: "error", message: "This user no longer exists or has been deleted." };

  const [existingEmail, role] = await Promise.all([
    db.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } }),
    db.role.findFirst({ where: { id: parsed.data.role, deletedAt: null }, select: { name: true } }),
  ]);
  if (existingEmail && existingEmail.id !== user.id) {
    return {
      status: "error",
      message: "That email address is already in use.",
      fieldErrors: { email: ["That email address is already in use."] },
    };
  }
  if (!role) {
    return { status: "error", message: "Select an available role.", fieldErrors: { role: ["Select an available role."] } };
  }

  const hasChanges =
    parsed.data.firstName !== user.firstName ||
    parsed.data.lastName !== user.lastName ||
    parsed.data.email !== user.email ||
    (parsed.data.phoneNumber || null) !== user.phoneNumber ||
    role.name !== user.role ||
    Boolean(parsed.data.password) ||
    Boolean(imageEntry.file);
  if (!hasChanges) redirect("/users");

  let uploadedImage: { path: string; filePath: string } | null = null;
  if (imageEntry.file) {
    const saved = await saveUserImage(imageEntry.file);
    if (saved.status === "error") {
      return { status: "error", message: saved.message, fieldErrors: { image: [saved.message] } };
    }
    uploadedImage = { path: saved.path, filePath: saved.filePath };
  }

  const passwordHash = parsed.data.password ? await hash(parsed.data.password, 12) : undefined;
  try {
    const result = await db.$transaction(async (transaction) => {
      const current = await transaction.user.findFirst({
        where: { id: user.id, deletedAt: null },
        select: { id: true, role: true },
      });
      if (!current) {
        return { status: "error" as const, message: "This user no longer exists or has been deleted." };
      }

      if (current.role === "admin" && role.name !== "admin") {
        const activeAdmins = await transaction.user.count({
          where: { role: "admin", deletedAt: null },
        });
        if (activeAdmins <= 1) {
          return {
            status: "error" as const,
            message: "The last administrator cannot be changed to another role.",
          };
        }
      }

      const updated = await transaction.user.updateMany({
        where: { id: current.id, deletedAt: null },
        data: {
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          email: parsed.data.email,
          phoneNumber: parsed.data.phoneNumber || null,
          role: role.name,
          ...(passwordHash ? { password: passwordHash } : {}),
          ...(uploadedImage ? { image: uploadedImage.path } : {}),
        },
      });
      return updated.count === 1
        ? { status: "success" as const }
        : { status: "error" as const, message: "This user could not be updated. Refresh and try again." };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.status === "error") {
      if (uploadedImage) await removeUserImage(uploadedImage.filePath);
      return { status: "error", message: result.message };
    }
  } catch (error) {
    if (uploadedImage) await removeUserImage(uploadedImage.filePath);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        status: "error",
        message: "That email address is already in use.",
        fieldErrors: { email: ["That email address is already in use."] },
      };
    }
    throw error;
  }

  revalidatePath("/users");
  revalidatePath(`/users/${encodeURIComponent(user.id)}/edit`);
  return { status: "success", message: "User updated successfully." };
}
