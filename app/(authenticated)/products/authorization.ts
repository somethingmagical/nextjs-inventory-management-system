import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";

export async function getProductAccess() {
  return requirePermission(PERMISSION.manageProducts);
}

export async function getProductViewAccess() {
  return requirePermission(PERMISSION.viewProducts);
}

export async function getBrandAccess() {
  return requirePermission(PERMISSION.manageBrands);
}

export async function getBrandViewAccess() {
  return requirePermission(PERMISSION.viewBrands);
}

export async function getProductCategoryAccess() {
  return requirePermission(PERMISSION.manageProductCategories);
}

export async function getProductCategoryViewAccess() {
  return requirePermission(PERMISSION.viewProductCategories);
}
