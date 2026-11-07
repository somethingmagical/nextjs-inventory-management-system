"use server";

import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { PasswordActionState } from "./password-state";

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().min(8, "Your new password must be at least 8 characters."),
    confirmNewPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((values) => values.newPassword === values.confirmNewPassword, {
    path: ["confirmNewPassword"],
    message: "New password and confirmation do not match.",
  });

export async function changePassword(
  _previousState: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { status: "error", message: "Please sign in again before changing your password." };
  }

  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmNewPassword: formData.get("confirmNewPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the password fields and try again.",
    };
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { password: true },
  });

  if (!user) {
    return { status: "error", message: "Your account could not be found. Please sign in again." };
  }

  const currentPasswordMatches = await compare(parsed.data.currentPassword, user.password);
  if (!currentPasswordMatches) {
    return { status: "error", message: "Current password is incorrect." };
  }

  const isSamePassword = await compare(parsed.data.newPassword, user.password);
  if (isSamePassword) {
    return { status: "error", message: "Choose a new password different from your current password." };
  }

  const passwordHash = await hash(parsed.data.newPassword, 12);
  await db.user.update({
    where: { id: userId },
    data: { password: passwordHash },
    select: { id: true },
  });

  // Signing out after a password change could be added later; keep the current session active for now.
  return { status: "success", message: "Password updated." };
}
