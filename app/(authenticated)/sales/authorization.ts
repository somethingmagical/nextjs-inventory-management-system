import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";

export async function getSaleAccess() {
  return requirePermission(PERMISSION.manageSale);
}

export async function getSaleViewAccess() {
  return requirePermission(PERMISSION.viewSales);
}

export async function getSaleReturnAccess() {
  return requirePermission(PERMISSION.manageSaleReturn);
}

export async function getSaleReturnViewAccess() {
  return requirePermission(PERMISSION.viewSaleReturns);
}
