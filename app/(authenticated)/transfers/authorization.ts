import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";

export async function getTransferAccess() {
  return requirePermission(PERMISSION.manageTransfers);
}
