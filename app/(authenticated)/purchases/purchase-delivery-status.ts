import type { PurchaseDeliveryStatus } from "@prisma/client";

export function formatPurchaseDeliveryStatus(status: PurchaseDeliveryStatus) {
  return status === "InTransit" ? "In transit" : status;
}

export function purchaseDeliveryStatusBadgeClass(status: PurchaseDeliveryStatus) {
  switch (status) {
    case "Delivered":
      return "gg-badge--success";
    case "InTransit":
      return "gg-badge--info";
    case "Pending":
      return "gg-badge--neutral";
  }
}
