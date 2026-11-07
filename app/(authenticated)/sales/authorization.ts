import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";

export async function getSaleAccess() {
  return requirePermission(PERMISSION.manageSale);
}

export async function getSaleReturnAccess() {
  return requirePermission(PERMISSION.manageSaleReturn);
}
