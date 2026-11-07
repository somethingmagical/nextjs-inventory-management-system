import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";

export async function getWarehouseAccess() {
  return requirePermission(PERMISSION.manageWarehouses);
}
