"use client";

import Link from "next/link";
import { Prisma } from "@prisma/client";
import { useActionState, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Minus, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  calculatePurchaseLineTotals,
  calculatePurchaseTotals,
} from "@/lib/purchase-pricing";
import {
  createSaleReturn,
  updateSaleReturn,
} from "@/app/(authenticated)/sales/returns/create/actions";
import {
  initialSaleReturnCreateActionState,
  type SaleReturnCreateActionState,
} from "@/app/(authenticated)/sales/returns/create/action-state";

type SaleReturnItem = {
  id: string;
  code: string;
  name: string;
  price: string;
  unit: string;
  stock: string;
  quantity: string;
  maxQuantity: string;
  discountType: "Fixed" | "Percentage";
  discount: string;
  taxType: "Inclusive" | "Exclusive";
  orderTax: string;
};

type SaleReturnItemEdit = Pick<
  SaleReturnItem,
  "price" | "unit" | "discountType" | "discount" | "taxType" | "orderTax"
>;

export type SaleReturnFormInitialData = {
  id?: string;
  saleId: string;
  saleReference: string;
  customerName: string;
  warehouseName: string;
  date?: string;
  status?: "Pending" | "Ordered" | "Received";
  orderTax: string;
  discount?: string;
  shipping?: string;
  notes?: string | null;
  items: SaleReturnItem[];
};

export default function SaleReturnForm({
  units,
  initialData,
}: {
  units: string[];
  initialData: SaleReturnFormInitialData;
}) {
  const [date, setDate] = useState(() => {
    if (initialData.date) return initialData.date;
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });
  const [status, setStatus] = useState<"Pending" | "Ordered" | "Received">(initialData.status ?? "Received");
  const [items, setItems] = useState(initialData.items);
  const [orderTax, setOrderTax] = useState(initialData.orderTax);
  const [discount, setDiscount] = useState(initialData.discount ?? "0.00");
  const [shipping, setShipping] = useState(initialData.shipping ?? "0.00");
  const [notes, setNotes] = useState(initialData.notes ?? "");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemEdit, setItemEdit] = useState<SaleReturnItemEdit | null>(null);
  const [itemEditError, setItemEditError] = useState("");
  const [quantityError, setQuantityError] = useState("");
  const saleReturnAction = initialData.id
    ? updateSaleReturn.bind(null, initialData.id)
    : createSaleReturn;
  const [actionState, formAction, isPending] = useActionState<
    SaleReturnCreateActionState,
    FormData
  >(saleReturnAction, initialSaleReturnCreateActionState);

  useEffect(() => {
    if (!editingItemId) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeItemEditor();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editingItemId]);

  function closeItemEditor() {
    setEditingItemId(null);
    setItemEdit(null);
    setItemEditError("");
  }

  function setQuantity(productId: string, value: string) {
    const item = items.find((entry) => entry.id === productId);
    if (!item) return;
    if (value === "") {
      setQuantityError("Enter a return quantity or remove the line.");
    } else {
      if (!/^\d{1,9}(?:\.\d{1,3})?$/.test(value)) {
        setQuantityError("Return quantity must be a positive number with at most 3 decimal places.");
        return;
      }
      const quantity = new Prisma.Decimal(value);
      if (quantity.greaterThan(new Prisma.Decimal(item.maxQuantity))) {
        setQuantityError(`${item.name}: returned quantity cannot exceed ${item.maxQuantity} ${item.unit}.`);
        return;
      }
      if (quantity.lessThanOrEqualTo(0)) {
        setQuantityError("Return quantity must be greater than zero. Remove the line to exclude it.");
        return;
      }
    }

    setQuantityError("");
    setItems((current) => current.map((entry) => (
      entry.id === productId ? { ...entry, quantity: value } : entry
    )));
  }

  function stepQuantity(item: SaleReturnItem, direction: -1 | 1) {
    let current = new Prisma.Decimal("0.001");
    try {
      if (/^\d+(?:\.\d{1,3})?$/.test(item.quantity)) current = new Prisma.Decimal(item.quantity);
    } catch {
      current = new Prisma.Decimal("0.001");
    }

    const next = current.plus(direction);
    setQuantity(item.id, next.greaterThan(0) ? next.toString() : "0.001");
  }

  function openItemEditor(item: SaleReturnItem) {
    setEditingItemId(item.id);
    setItemEdit({
      price: item.price,
      unit: item.unit,
      discountType: item.discountType,
      discount: item.discount,
      taxType: item.taxType,
      orderTax: item.orderTax,
    });
    setItemEditError("");
  }

  function saveItemEditor() {
    if (!editingItemId || !itemEdit) return;
    const item = items.find((entry) => entry.id === editingItemId);
    if (!item) {
      closeItemEditor();
      return;
    }

    try {
      calculatePurchaseLineTotals({
        unitCost: itemEdit.price,
        quantity: item.quantity,
        discountType: itemEdit.discountType,
        discount: itemEdit.discount,
        taxType: itemEdit.taxType,
        taxRate: itemEdit.orderTax,
      });
    } catch (error) {
      setItemEditError(error instanceof Error ? error.message : "Enter valid line details.");
      return;
    }

    setItems((current) => current.map((entry) => (
      entry.id === editingItemId ? { ...entry, ...itemEdit } : entry
    )));
    closeItemEditor();
  }

  const { lineTotals, orderTotals, pricingError } = useMemo(() => {
    const nextLineTotals = new Map<string, ReturnType<typeof calculatePurchaseLineTotals>>();
    try {
      for (const item of items) {
        nextLineTotals.set(item.id, calculatePurchaseLineTotals({
          unitCost: item.price,
          quantity: item.quantity,
          discountType: item.discountType,
          discount: item.discount,
          taxType: item.taxType,
          taxRate: item.orderTax,
        }));
      }
      const nextOrderTotals = calculatePurchaseTotals({
        lineSubtotals: Array.from(nextLineTotals.values(), (line) => line.subtotal),
        orderTaxRate: orderTax,
        discount,
        shipping,
      });
      return { lineTotals: nextLineTotals, orderTotals: nextOrderTotals, pricingError: "" };
    } catch (error) {
      return {
        lineTotals: nextLineTotals,
        orderTotals: null,
        pricingError: error instanceof Error ? error.message : "Enter valid return pricing values.",
      };
    }
  }, [items, orderTax, discount, shipping]);

  return (
    <form className="gg-card gg-card-pad purchase-form-card" action={formAction}>
      <input type="hidden" name="saleId" value={initialData.saleId} />
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(items.map((item) => ({
          productId: item.id,
          price: item.price,
          quantity: item.quantity,
          unit: item.unit,
          discountType: item.discountType,
          discount: item.discount,
          taxType: item.taxType,
          orderTax: item.orderTax,
        })))}
      />
      {actionState.status === "error" && (
        <p className="warehouse-toast is-visible" role="alert">
          <span>{actionState.message}</span>
        </p>
      )}
      <div className="purchase-top">
        <div className="gg-field">
          <label className="gg-label" htmlFor="sale-return-date">Date <span className="gg-req">*</span></label>
          <div className="date-field purchase-date-field">
            <input
              className="gg-input gg-num"
              id="sale-return-date"
              name="date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
              disabled={isPending}
            />
            <CalendarDays aria-hidden="true" />
          </div>
        </div>
        <div className="gg-field">
          <label className="gg-label" htmlFor="sale-return-reference">Sale Reference <span className="gg-req">*</span></label>
          <input
            className="gg-input"
            id="sale-return-reference"
            value={initialData.saleReference}
            disabled
            readOnly
          />
        </div>
        <div className="gg-field">
          <label className="gg-label" htmlFor="sale-return-status">Status <span className="gg-req">*</span></label>
          <select
            className="gg-select"
            id="sale-return-status"
            name="status"
            value={status}
            onChange={(event) => {
              if (event.target.value === "Pending" || event.target.value === "Ordered" || event.target.value === "Received") {
                setStatus(event.target.value);
              }
            }}
            disabled={isPending}
          >
            <option value="Pending">Pending</option>
            <option value="Ordered">Ordered</option>
            <option value="Received">Received</option>
          </select>
        </div>
      </div>

      <dl className="sale-return-origin" aria-label="Original sale">
        <div><dt>Customer</dt><dd>{initialData.customerName}</dd></div>
        <div><dt>Warehouse</dt><dd>{initialData.warehouseName}</dd></div>
      </dl>

      <h2 className="gg-label purchase-items-label">Product List</h2>
      <h3 className="gg-label purchase-items-label">Order items <span className="gg-req">*</span></h3>
      <div className="gg-table-wrap">
        <table className="gg-table">
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col" className="gg-num">Net Unit Price</th>
              <th scope="col">Stock</th>
              <th scope="col">Qty</th>
              <th scope="col">Discount</th>
              <th scope="col">Tax</th>
              <th scope="col" className="gg-num">Subtotal</th>
              <th scope="col" className="purchase-item-action-heading">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const totals = lineTotals.get(item.id);
              return (
                <tr key={item.id}>
                  <td>
                    <div className="purchase-product-cell">
                      <span className="purchase-product-code">{item.code}</span>
                      <span className="purchase-product-name-row">
                        <span className="gg-chip-unit">{item.name}</span>
                        <button
                          className="purchase-item-edit"
                          type="button"
                          aria-label={`Edit ${item.name} return details`}
                          onClick={() => openItemEditor(item)}
                          disabled={isPending}
                        >
                          <Pencil aria-hidden="true" />
                        </button>
                      </span>
                    </div>
                  </td>
                  <td className="gg-num">$ {item.price}</td>
                  <td><span className="stock-chip gg-num">{item.stock} {item.unit}</span></td>
                  <td>
                    <div className="gg-stepper">
                      <button
                        type="button"
                        aria-label={`Decrease ${item.name} return quantity`}
                        onClick={() => stepQuantity(item, -1)}
                        disabled={isPending}
                      >
                        <Minus aria-hidden="true" size={15} />
                      </button>
                      <input
                        className="gg-num"
                        type="number"
                        min="0.001"
                        max={item.maxQuantity}
                        step="0.001"
                        value={item.quantity}
                        onChange={(event) => setQuantity(item.id, event.target.value)}
                        aria-label={`${item.name} return quantity, maximum ${item.maxQuantity}`}
                        disabled={isPending}
                      />
                      <button
                        type="button"
                        aria-label={`Increase ${item.name} return quantity`}
                        onClick={() => stepQuantity(item, 1)}
                        disabled={isPending}
                      >
                        <Plus aria-hidden="true" />
                      </button>
                    </div>
                    <span className="gg-muted sale-return-max">Max {item.maxQuantity}</span>
                  </td>
                  <td className="gg-num">
                    {totals ? `$ ${totals.discount.toFixed(2)}` : "—"}
                    {item.discountType === "Percentage" && ` (${item.discount}%)`}
                  </td>
                  <td className="gg-num">
                    {totals ? `$ ${totals.tax.toFixed(2)}` : "—"}
                    {item.orderTax !== "0" && item.orderTax !== "0.00" && ` (${item.orderTax}%)`}
                  </td>
                  <td className="gg-num gg-td-strong">{totals ? `$ ${totals.subtotal.toFixed(2)}` : "—"}</td>
                  <td className="purchase-item-action-cell">
                    <button
                      className="gg-icon-btn purchase-item-remove"
                      type="button"
                      aria-label={`Remove ${item.name} from return`}
                      onClick={() => {
                        setQuantityError("");
                        setItems((current) => current.filter((entry) => entry.id !== item.id));
                      }}
                      disabled={isPending}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td className="product-empty-cell" colSpan={8}>
                  <p className="warehouse-empty-title">No products added</p>
                  <p className="gg-muted">Add at least one product from the original sale.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {quantityError && <p className="warehouse-field-error" role="alert">{quantityError}</p>}

      <div className="purchase-totals-box" aria-label="Sale return totals">
        <div className="purchase-totals-row">
          <span>Order Tax</span>
          <span className="gg-num">{orderTotals ? `$ ${orderTotals.orderTax.toFixed(2)} (${orderTax || "0"}%)` : "—"}</span>
        </div>
        <div className="purchase-totals-row">
          <span>Discount</span>
          <span className="gg-num">{orderTotals ? `$ ${orderTotals.discount.toFixed(2)}` : "—"}</span>
        </div>
        <div className="purchase-totals-row">
          <span>Shipping</span>
          <span className="gg-num">{orderTotals ? `$ ${orderTotals.shipping.toFixed(2)}` : "—"}</span>
        </div>
        <div className="purchase-totals-row purchase-grand-total">
          <span>Grand Total</span>
          <span className="gg-num">{orderTotals ? `$ ${orderTotals.grandTotal.toFixed(2)}` : "—"}</span>
        </div>
      </div>

      <div className="purchase-three-col">
        <div className="gg-field">
          <label className="gg-label" htmlFor="sale-return-order-tax">Order Tax</label>
          <div className="gg-input-group">
            <input
              className="gg-input gg-num"
              id="sale-return-order-tax"
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
          <label className="gg-label" htmlFor="sale-return-discount">Discount</label>
          <div className="gg-input-group">
            <input
              className="gg-input gg-num"
              id="sale-return-discount"
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
          <label className="gg-label" htmlFor="sale-return-shipping">Shipping</label>
          <div className="gg-input-group">
            <input
              className="gg-input gg-num"
              id="sale-return-shipping"
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
      {pricingError && <p className="warehouse-field-error" role="alert">{pricingError}</p>}

      <div className="gg-field purchase-notes-field sale-return-notes">
        <label className="gg-label" htmlFor="sale-return-notes">Notes</label>
        <textarea
          className="gg-textarea"
          id="sale-return-notes"
          name="notes"
          placeholder="Enter Notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={5000}
          disabled={isPending}
        />
      </div>

      <div className="gg-form-actions">
        <button
          className="gg-btn gg-btn--primary"
          type="submit"
          disabled={isPending || items.length === 0 || Boolean(pricingError) || Boolean(quantityError)}
        >
          <Check aria-hidden="true" />
          {isPending ? "Saving..." : "Save"}
        </button>
        <Link className="gg-btn gg-btn--secondary" href="/sales/returns">Cancel</Link>
      </div>

      {editingItemId && itemEdit && (
        <SaleReturnItemEditModal
          item={items.find((entry) => entry.id === editingItemId)}
          edit={itemEdit}
          units={units}
          isPending={isPending}
          error={itemEditError}
          onChange={setItemEdit}
          onSave={saveItemEditor}
          onClose={closeItemEditor}
        />
      )}
    </form>
  );
}

function SaleReturnItemEditModal({
  item,
  edit,
  units,
  isPending,
  error,
  onChange,
  onSave,
  onClose,
}: {
  item?: SaleReturnItem;
  edit: SaleReturnItemEdit;
  units: string[];
  isPending: boolean;
  error: string;
  onChange: (edit: SaleReturnItemEdit) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  if (!item) return null;

  return (
    <div
      className="purchase-item-overlay is-open"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="gg-modal purchase-item-modal" role="dialog" aria-modal="true" aria-labelledby="sale-return-item-title">
        <div className="gg-modal-head">
          <h2 className="gg-card-title" id="sale-return-item-title">{item.name}</h2>
          <button className="gg-modal-close" type="button" aria-label="Close product details" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="gg-modal-body purchase-item-modal-body">
          <div className="gg-field">
            <label className="gg-label" htmlFor="sale-return-item-price">Product Price <span className="gg-req">*</span></label>
            <div className="gg-input-group">
              <input
                className="gg-input gg-num"
                id="sale-return-item-price"
                type="number"
                min="0"
                step="0.01"
                value={edit.price}
                onChange={(event) => onChange({ ...edit, price: event.target.value })}
                disabled={isPending}
              />
              <span className="gg-input-suffix">$</span>
            </div>
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="sale-return-item-tax-type">Tax Type <span className="gg-req">*</span></label>
            <select
              className="gg-select"
              id="sale-return-item-tax-type"
              value={edit.taxType}
              onChange={(event) => {
                if (event.target.value === "Inclusive" || event.target.value === "Exclusive") {
                  onChange({ ...edit, taxType: event.target.value });
                }
              }}
              disabled={isPending}
            >
              <option value="Inclusive">Inclusive</option>
              <option value="Exclusive">Exclusive</option>
            </select>
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="sale-return-item-tax">Order Tax</label>
            <div className="gg-input-group">
              <input
                className="gg-input gg-num"
                id="sale-return-item-tax"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={edit.orderTax}
                onChange={(event) => onChange({ ...edit, orderTax: event.target.value })}
                disabled={isPending}
              />
              <span className="gg-input-suffix">%</span>
            </div>
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="sale-return-item-discount-type">Discount Type <span className="gg-req">*</span></label>
            <select
              className="gg-select"
              id="sale-return-item-discount-type"
              value={edit.discountType}
              onChange={(event) => {
                if (event.target.value === "Fixed" || event.target.value === "Percentage") {
                  onChange({ ...edit, discountType: event.target.value });
                }
              }}
              disabled={isPending}
            >
              <option value="Fixed">Fixed</option>
              <option value="Percentage">Percentage</option>
            </select>
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="sale-return-item-discount">Discount <span className="gg-req">*</span></label>
            <input
              className="gg-input gg-num"
              id="sale-return-item-discount"
              type="number"
              min="0"
              step="0.01"
              value={edit.discount}
              onChange={(event) => onChange({ ...edit, discount: event.target.value })}
              disabled={isPending}
            />
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="sale-return-item-unit">Sale Unit <span className="gg-req">*</span></label>
            <select
              className="gg-select"
              id="sale-return-item-unit"
              value={edit.unit}
              onChange={(event) => onChange({ ...edit, unit: event.target.value })}
              disabled={isPending}
            >
              {!units.includes(edit.unit) && <option value={edit.unit}>{edit.unit}</option>}
              {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </div>
          {error && <p className="warehouse-field-error" role="alert">{error}</p>}
        </div>
        <div className="gg-modal-foot">
          <button className="gg-btn gg-btn--primary" type="button" onClick={onSave} disabled={isPending}>
            <Check aria-hidden="true" />
            Save
          </button>
          <button className="gg-btn gg-btn--secondary" type="button" onClick={onClose} disabled={isPending}>Cancel</button>
        </div>
      </section>
    </div>
  );
}
