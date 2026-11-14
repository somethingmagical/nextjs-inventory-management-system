"use client";

import { useActionState } from "react";
import { updatePurchaseDeliveryStatus } from "@/app/(authenticated)/purchases/actions";
import type { PurchaseDeliveryStatusActionState } from "@/app/(authenticated)/purchases/actions";

const initialState: PurchaseDeliveryStatusActionState = {
  status: "idle",
  message: "",
};

export default function PurchaseDeliveryStatusForm({
  purchaseId,
  deliveryStatus,
}: {
  purchaseId: string;
  deliveryStatus: "Pending" | "InTransit" | "Delivered";
}) {
  const [state, formAction, isPending] = useActionState(
    updatePurchaseDeliveryStatus,
    initialState,
  );

  return (
    <form className="purchase-delivery-status-form" action={formAction}>
      <input type="hidden" name="purchaseId" value={purchaseId} />
      <label className="gg-label" htmlFor="purchase-delivery-status">
        Delivery status
      </label>
      <div className="purchase-delivery-status-controls">
        <select
          className="gg-select"
          id="purchase-delivery-status"
          name="deliveryStatus"
          defaultValue={deliveryStatus}
          disabled={isPending}
        >
          <option value="Pending">Pending</option>
          <option value="InTransit">In transit</option>
          <option value="Delivered">Delivered</option>
        </select>
        <button className="gg-btn gg-btn--secondary" type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Update status"}
        </button>
      </div>
      {state.message && (
        <p
          className={state.status === "error" ? "warehouse-field-error" : "gg-muted"}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
