import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";

export async function getRoleManagementAccess() {
  return requirePermission(PERMISSION.manageRoles);
}

export async function getRoleViewAccess() {
  return requirePermission(PERMISSION.viewRoles);
}
