import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";

export async function getExpenseCategoryAccess() {
  return requirePermission(PERMISSION.manageExpenseCategories);
}
