import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";

export async function getWarehouseAccess() {
  return requirePermission(PERMISSION.manageWarehouses);
}

export async function getWarehouseViewAccess() {
  return requirePermission(PERMISSION.viewWarehouses);
}
