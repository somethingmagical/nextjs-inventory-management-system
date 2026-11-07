import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";

export async function getCustomerAccess() {
  return requirePermission(PERMISSION.manageCustomers);
}
