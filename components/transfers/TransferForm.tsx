"use client";

import Link from "next/link";
import { Prisma } from "@prisma/client";
import { useActionState, useMemo, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import {
  createTransfer,
  updateTransfer,
} from "@/app/(authenticated)/transfers/create/actions";
import {
  calculatePurchaseLineTotals,
  calculatePurchaseTotals,
} from "@/lib/purchase-pricing";
import {
  initialTransferCreateActionState,
  type TransferCreateActionState,
} from "@/app/(authenticated)/transfers/create/action-state";
import TransferOrderItems, {
  type TransferDraftItem,
} from "./TransferOrderItems";

export type TransferWarehouseOption = {
  id: string;
  name: string;
};

export type TransferFormInitialData = {
  id: string;
  date: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  orderTax: string;
  discount: string;
  shipping: string;
  status: TransferStatusOption;
  notes: string | null;
  items: TransferDraftItem[];
};

const transferStatuses = ["Completed", "Sent", "Pending"] as const;
type TransferStatusOption = (typeof transferStatuses)[number];

export default function TransferForm({
  warehouses,
  initialData,
}: {
  warehouses: TransferWarehouseOption[];
  initialData?: TransferFormInitialData;
}) {
  const [date, setDate] = useState(() => {
    if (initialData) return initialData.date;
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });
  const [fromWarehouseId, setFromWarehouseId] = useState(initialData?.fromWarehouseId ?? "");
  const [toWarehouseId, setToWarehouseId] = useState(initialData?.toWarehouseId ?? "");
  const [items, setItems] = useState<TransferDraftItem[]>(initialData?.items ?? []);
  const [orderTax, setOrderTax] = useState(initialData?.orderTax ?? "0.00");
  const [discount, setDiscount] = useState(initialData?.discount ?? "0.00");
  const [shipping, setShipping] = useState(initialData?.shipping ?? "0.00");
  const [status, setStatus] = useState<TransferStatusOption>(initialData?.status ?? "Completed");
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const transferAction = initialData
    ? updateTransfer.bind(null, initialData.id)
    : createTransfer;
  const [actionState, formAction, isPending] = useActionState<
    TransferCreateActionState,
    FormData
  >(transferAction, initialTransferCreateActionState);

  const { orderTotals, pricingError } = useMemo(() => {
    try {
      const lineTotals = items.map((item) => calculatePurchaseLineTotals({
        unitCost: item.netUnitCost,
        quantity: item.quantity,
        discountType: item.discountType,
        discount: item.discount,
        taxType: item.taxType,
        taxRate: item.orderTax,
      }));
      return {
        orderTotals: calculatePurchaseTotals({
          lineSubtotals: lineTotals.map((line) => line.subtotal),
          orderTaxRate: orderTax,
          discount,
          shipping,
        }),
        pricingError: "",
      };
    } catch (error) {
      return {
        orderTotals: null,
        pricingError: error instanceof Error ? error.message : "Enter valid pricing values.",
      };
    }
  }, [items, orderTax, discount, shipping]);
  const itemsAreValid = items.length > 0 && items.every((item) => {
    try {
      const quantity = new Prisma.Decimal(item.quantity);
      const stock = new Prisma.Decimal(item.stock);
      return quantity.isFinite()
        && quantity.greaterThanOrEqualTo(1)
        && quantity.decimalPlaces() <= 3
        && quantity.lessThanOrEqualTo(stock);
    } catch {
      return false;
    }
  });

  function chooseFromWarehouse(nextWarehouseId: string) {
    setFromWarehouseId(nextWarehouseId);
    if (nextWarehouseId && nextWarehouseId === toWarehouseId) setToWarehouseId("");
    if (!initialData) setItems([]);
  }

  return (
    <main className="gg-content">
      <div className="page-head">
        <h1 className="gg-page-title">{initialData ? "Edit Transfer" : "Create Transfer"}</h1>
        <Link className="gg-btn gg-btn--secondary" href={initialData ? `/transfers/${encodeURIComponent(initialData.id)}` : "/transfers"}>
          <ArrowLeft aria-hidden="true" />
          Back
        </Link>
      </div>

      <form className="gg-card gg-card-pad transfer-form-card" action={formAction}>
        {actionState.status === "error" && (
          <p className="warehouse-toast is-visible" role="alert">
            <span>{actionState.message}</span>
          </p>
        )}
        <input
          type="hidden"
          name="items"
          value={JSON.stringify(items.map((item) => ({
            productId: item.id,
            netUnitCost: item.netUnitCost,
            quantity: item.quantity,
            discountType: item.discountType,
            discount: item.discount,
            taxType: item.taxType,
            orderTax: item.orderTax,
          })))}
        />
        <div className="transfer-top">
          <div className="gg-field">
            <label className="gg-label" htmlFor="transfer-date">
              Date <span className="gg-req">*</span>
            </label>
            <input
              className="gg-input gg-num"
              id="transfer-date"
              name="date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
              disabled={isPending}
            />
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="transfer-from-warehouse">
              From Warehouse <span className="gg-req">*</span>
            </label>
            <select
              className="gg-select"
              id="transfer-from-warehouse"
              name="fromWarehouseId"
              value={fromWarehouseId}
              onChange={(event) => chooseFromWarehouse(event.target.value)}
              required
              disabled={isPending}
            >
              <option value="">Choose Warehouse</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
              ))}
            </select>
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="transfer-to-warehouse">
              To Warehouse <span className="gg-req">*</span>
            </label>
            <select
              className="gg-select"
              id="transfer-to-warehouse"
              name="toWarehouseId"
              value={toWarehouseId}
              onChange={(event) => setToWarehouseId(event.target.value)}
              required
              disabled={isPending}
            >
              <option value="">Choose Warehouse</option>
              {warehouses.map((warehouse) => (
                <option
                  key={warehouse.id}
                  value={warehouse.id}
                  disabled={warehouse.id === fromWarehouseId}
                >
                  {warehouse.name}{warehouse.id === fromWarehouseId ? " (source warehouse)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {warehouses.length < 2 && (
          <p className="warehouse-field-error" role="status">
            Add at least two active warehouses before creating a transfer.
          </p>
        )}
        {fromWarehouseId && fromWarehouseId === toWarehouseId && (
          <p className="warehouse-field-error" role="alert">Source and destination warehouses must be different.</p>
        )}

        <TransferOrderItems
          key={fromWarehouseId}
          warehouseId={fromWarehouseId}
          items={items}
          onItemsChange={setItems}
          disabled={isPending}
          transferId={initialData?.id ?? null}
        />

        <div className="transfer-totals-box" aria-label="Transfer totals">
          <div className="transfer-totals-row">
            <span>Order Tax</span>
            <span className="gg-num">
              {orderTotals ? `$ ${orderTotals.orderTax.toFixed(2)} (${orderTax || "0"}%)` : "—"}
            </span>
          </div>
          <div className="transfer-totals-row">
            <span>Discount</span>
            <span className="gg-num">{orderTotals ? `$ ${orderTotals.discount.toFixed(2)}` : "—"}</span>
          </div>
          <div className="transfer-totals-row">
            <span>Shipping</span>
            <span className="gg-num">{orderTotals ? `$ ${orderTotals.shipping.toFixed(2)}` : "—"}</span>
          </div>
          <div className="transfer-totals-row transfer-grand-total">
            <span>Grand Total</span>
            <span className="gg-num">{orderTotals ? `$ ${orderTotals.grandTotal.toFixed(2)}` : "—"}</span>
          </div>
        </div>
        {pricingError && <p className="warehouse-field-error" role="alert">{pricingError}</p>}

        <div className="transfer-three-col">
          <div className="gg-field">
            <label className="gg-label" htmlFor="transfer-order-tax">Order Tax</label>
            <div className="gg-input-group">
              <input
                className="gg-input gg-num"
                id="transfer-order-tax"
                name="orderTax"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={orderTax}
                onChange={(event) => setOrderTax(event.target.value)}
                disabled={isPending}
              />
              <span className="gg-input-suffix">%</span>
            </div>
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="transfer-discount">Discount</label>
            <div className="gg-input-group">
              <input
                className="gg-input gg-num"
                id="transfer-discount"
                name="discount"
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
                disabled={isPending}
              />
              <span className="gg-input-suffix">$</span>
            </div>
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="transfer-shipping">Shipping</label>
            <div className="gg-input-group">
              <input
                className="gg-input gg-num"
                id="transfer-shipping"
                name="shipping"
                type="number"
                min="0"
                step="0.01"
                value={shipping}
                onChange={(event) => setShipping(event.target.value)}
                disabled={isPending}
              />
              <span className="gg-input-suffix">$</span>
            </div>
          </div>
        </div>

        <div className="gg-field transfer-status-field">
          <label className="gg-label" htmlFor="transfer-status">
            Status <span className="gg-req">*</span>
          </label>
          <select
            className="gg-select"
            id="transfer-status"
            name="status"
            value={status}
            onChange={(event) => {
              const nextStatus = transferStatuses.find((value) => value === event.target.value);
              if (nextStatus) setStatus(nextStatus);
            }}
            disabled={isPending}
          >
            {transferStatuses.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <div className="gg-field transfer-notes-field">
          <label className="gg-label" htmlFor="transfer-notes">Note</label>
          <textarea
            className="gg-textarea"
            id="transfer-notes"
            name="notes"
            placeholder="Enter Note"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={5000}
            disabled={isPending}
          />
        </div>

        <div className="gg-form-actions transfer-form-actions">
          <button
            className="gg-btn gg-btn--primary"
            type="submit"
            disabled={
              isPending
              || warehouses.length < 2
              || !fromWarehouseId
              || !toWarehouseId
              || fromWarehouseId === toWarehouseId
              || !itemsAreValid
              || Boolean(pricingError)
            }
          >
            <Check aria-hidden="true" />
            {isPending ? "Saving..." : "Save"}
          </button>
          <Link className="gg-btn gg-btn--secondary" href={initialData ? `/transfers/${encodeURIComponent(initialData.id)}` : "/transfers"} aria-disabled={isPending}>Cancel</Link>
        </div>
      </form>
    </main>
  );
}
