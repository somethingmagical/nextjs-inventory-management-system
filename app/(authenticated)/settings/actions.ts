"use server";

import { revalidatePath, updateTag } from "next/cache";
import { updateApplicationSettings as updateSettings } from "@/features/settings/update";
import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";
import type { SettingsActionState } from "./action-state";

export async function updateApplicationSettings(
  _previousState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const access = await requirePermission(PERMISSION.manageSetting);
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before changing application settings." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to change application settings." };
  }

  const result = await updateSettings({
    appName: formData.get("appName"),
    favicon: formData.get("favicon"),
  });
  if (result.status === "error") {
    return { status: "error", message: result.message };
  }

  updateTag("application-settings");
  revalidatePath("/", "layout");
  revalidatePath("/settings");
  return { status: "success", message: "Application settings updated." };
}
