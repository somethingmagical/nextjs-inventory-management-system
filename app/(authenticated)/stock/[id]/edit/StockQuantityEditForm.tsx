"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { StockQuantityEditActionState } from "./action-state";
import { initialStockQuantityEditActionState } from "./action-state";

type StockQuantityEditAction = (
  state: StockQuantityEditActionState,
  formData: FormData,
) => Promise<StockQuantityEditActionState>;

export default function StockQuantityEditForm({
  action,
  expectedQuantity,
  warehouseId,
}: {
  action: StockQuantityEditAction;
  expectedQuantity: string;
  warehouseId: string;
}) {
  const [quantity, setQuantity] = useState(expectedQuantity);
  const [state, formAction, isPending] = useActionState(
    action,
    initialStockQuantityEditActionState,
  );

  return (
    <form className="gg-card gg-card-pad" action={formAction}>
      <input type="hidden" name="expectedQuantity" value={expectedQuantity} />
      {state.status === "error" && (
        <p className="warehouse-toast is-visible" role="alert">
          <span>{state.message}</span>
        </p>
      )}
      {state.status === "success" && (
        <p className="warehouse-toast warehouse-toast-success is-visible" role="status">
          <span>{state.message}</span>
        </p>
      )}
      <div className="gg-field">
        <label className="gg-label" htmlFor="stock-target-quantity">
          On-hand quantity <span className="gg-req">*</span>
        </label>
        <input
          className="gg-input gg-num"
          id="stock-target-quantity"
          name="targetQuantity"
          type="number"
          min="0"
          max="999999999.999"
          step="0.001"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          required
          disabled={isPending}
        />
        <p className="gg-muted">
          Availability status updates automatically from this quantity and the product&apos;s stock alert.
        </p>
      </div>
      <div className="gg-form-actions">
        <button className="gg-btn gg-btn--primary" type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save quantity"}
        </button>
        <Link
          className="gg-btn gg-btn--secondary"
          href={`/stock?warehouseId=${encodeURIComponent(warehouseId)}`}
          aria-disabled={isPending}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
