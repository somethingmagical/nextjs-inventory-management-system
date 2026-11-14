import type { PurchaseDeliveryStatus, PurchaseStatus } from "@prisma/client";

export function getInitialPurchaseDeliveryStatus(
  status: PurchaseStatus,
): PurchaseDeliveryStatus {
  return status === "Received" ? "Delivered" : "Pending";
}
