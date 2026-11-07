import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";

export async function getExpenseAccess() {
  return requirePermission(PERMISSION.manageExpenses);
}
