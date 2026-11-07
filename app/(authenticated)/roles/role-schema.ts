import { z } from "zod";
import { PERMISSIONS } from "@/lib/permissions";

export const roleIdSchema = z.string().trim().min(1).max(191);

export const roleFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a role name.").max(80, "Role name must be 80 characters or fewer."),
  permissions: z
    .array(z.enum(PERMISSIONS))
    .min(1, "Select at least one permission.")
    .max(PERMISSIONS.length)
    .refine((permissions) => new Set(permissions).size === permissions.length, {
      message: "Each permission can only be selected once.",
    }),
});

export type RoleFormValues = z.infer<typeof roleFormSchema>;
