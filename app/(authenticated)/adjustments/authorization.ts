import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";

export async function getAdjustmentAccess() {
  return requirePermission(PERMISSION.manageAdjustments);
}
