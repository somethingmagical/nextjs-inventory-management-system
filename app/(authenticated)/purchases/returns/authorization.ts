import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";

export async function getPurchaseReturnAccess() {
  return requirePermission(PERMISSION.managePurchaseReturn);
}

export async function getPurchaseReturnViewAccess() {
  return requirePermission(PERMISSION.viewPurchaseReturns);
}
