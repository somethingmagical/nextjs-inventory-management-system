import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";

export async function getPurchaseAccess() {
  return requirePermission(PERMISSION.managePurchase);
}

export async function getPurchaseViewAccess() {
  return requirePermission(PERMISSION.viewPurchases);
}
