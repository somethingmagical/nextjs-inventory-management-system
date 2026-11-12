import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";

export async function getSupplierAccess() {
  return requirePermission(PERMISSION.manageSuppliers);
}

export async function getSupplierViewAccess() {
  return requirePermission(PERMISSION.viewSuppliers);
}
