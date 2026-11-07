import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";

export async function getProductAccess() {
  return requirePermission(PERMISSION.manageProducts);
}

export async function getBrandAccess() {
  return requirePermission(PERMISSION.manageBrands);
}

export async function getProductCategoryAccess() {
  return requirePermission(PERMISSION.manageProductCategories);
}
