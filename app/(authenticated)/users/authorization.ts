import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";

export async function getUserManagementAccess() {
  return requirePermission(PERMISSION.manageUsers);
}
