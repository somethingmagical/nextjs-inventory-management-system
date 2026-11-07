"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, Minus, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { calculatePurchaseLineTotals, calculatePurchaseTotals } from "@/lib/purchase-pricing";
import {
  fetchPurchaseReturnProductStocks,
  savePurchaseReturn,
  searchPurchaseReturnProducts,
} from "@/app/(authenticated)/purchases/returns/actions";
import {
  initialPurchaseReturnCreateActionState,
  type PurchaseReturnCreateActionState,
} from "@/app/(authenticated)/purchases/returns/create/action-state";

type Option = { id: string; name: string };
type ProductResult = {
  id: string;
  code: string;
  name: string;
  netUnitCost: string;
  unit: string;
  stock: string;
};
type PurchaseReturnDraftItem = ProductResult & {
  quantity: string;
  discountType: "Fixed" | "Percentage";
  discount: string;
  taxType: "Inclusive" | "Exclusive";
  orderTax: string;
};
export type PurchaseReturnFormInitialData = {
  id: string;
  date: string;
  warehouseId: string;
  supplierId: string;
  status: "Pending" | "Ordered" | "Received";
  orderTax: string;
  discount: string;
  shipping: string;
  notes: string | null;
  items: PurchaseReturnDraftItem[];
};
type PurchaseReturnItemEdit = Pick<
  PurchaseReturnDraftItem,
  "netUnitCost" | "unit" | "discountType" | "discount" | "taxType" | "orderTax"
>;

const minimumSearchLength = 2;

export default function PurchaseReturnForm({
  warehouses,
  suppliers,
  initialData,
}: {
  warehouses: Option[];
  suppliers: Option[];
  initialData?: PurchaseReturnFormInitialData;
}) {
  const [date, setDate] = useState(() => {
    if (initialData) return initialData.date;
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });
  const [warehouseId, setWarehouseId] = useState(initialData?.warehouseId ?? "");
  const [supplierId, setSupplierId] = useState(initialData?.supplierId ?? "");
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<ProductResult[]>([]);
  const [items, setItems] = useState<PurchaseReturnDraftItem[]>(initialData?.items ?? []);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemEdit, setItemEdit] = useState<PurchaseReturnItemEdit | null>(null);
  const [itemEditError, setItemEditError] = useState("");
  const [orderTax, setOrderTax] = useState(initialData?.orderTax ?? "0.00");
  const [orderDiscount, setOrderDiscount] = useState(initialData?.discount ?? "0.00");
  const [shipping, setShipping] = useState(initialData?.shipping ?? "0.00");
  const [status, setStatus] = useState<"Pending" | "Ordered" | "Received">(initialData?.status ?? "Received");
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [searchError, setSearchError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const stockRequestId = useRef(0);
  const [actionState, formAction, isPending] = useActionState<
    PurchaseReturnCreateActionState,
    FormData
  >(savePurchaseReturn, initialPurchaseReturnCreateActionState);

  useEffect(() => {
    let cancelled = false;
    const trimmedQuery = query.trim();

    if (!warehouseId || trimmedQuery.length < minimumSearchLength) {
      setProducts([]);
      setSearchError("");
      setIsSearching(false);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const result = await searchPurchaseReturnProducts(warehouseId, trimmedQuery);
        if (cancelled) return;

        if (result.status === "error") {
          setProducts([]);
          setSearchError(result.message);
          return;
        }

        setSearchError("");
        setProducts(result.products);
      } catch {
        if (cancelled) return;
        setProducts([]);
        setSearchError("Products could not be searched. Please try again.");
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [warehouseId, query]);

  async function selectWarehouse(nextWarehouseId: string) {
    setWarehouseId(nextWarehouseId);
    setQuery("");
    setProducts([]);
    setSearchError("");
    if (!initialData) {
      setItems([]);
      return;
    }

    const requestId = ++stockRequestId.current;
    const result = await fetchPurchaseReturnProductStocks(
      nextWarehouseId,
      items.map((item) => item.id),
    );
    if (requestId !== stockRequestId.current) return;
    if (result.status === "error") {
      setSearchError(result.message);
      return;
    }

    const stockByProductId = new Map(result.stocks.map((stock) => [stock.productId, stock.stock]));
    setItems((current) => current.map((item) => ({
      ...item,
      stock: stockByProductId.get(item.id) ?? item.stock,
    })));
  }

  function addProduct(product: ProductResult) {
    setItems((current) =>
      current.some((item) => item.id === product.id)
        ? current
        : [
            ...current,
            {
              ...product,
              quantity: "1",
              discountType: "Fixed",
              discount: "0.00",
              taxType: "Exclusive",
              orderTax: "0.00",
            },
          ],
    );
    setQuery("");
    setProducts([]);
  }

  function removeItem(productId: string) {
    setItems((current) => current.filter((item) => item.id !== productId));
    if (editingItemId === productId) closeItemEditor();
  }

  function setQuantity(productId: string, quantity: string) {
    const nextValue = quantity.trim();
    const numeric = Number(nextValue || "1");
    const safeValue = Number.isFinite(numeric) && numeric > 0 ? String(Math.floor(numeric)) : "1";

    setItems((current) =>
      current.map((item) => (item.id === productId ? { ...item, quantity: safeValue } : item)),
    );
  }

  function openItemEditor(item: PurchaseReturnDraftItem) {
    setEditingItemId(item.id);
    setItemEdit({
      netUnitCost: item.netUnitCost,
      unit: item.unit,
      discountType: item.discountType,
      discount: item.discount,
      taxType: item.taxType,
      orderTax: item.orderTax,
    });
    setItemEditError("");
  }

  function closeItemEditor() {
    setEditingItemId(null);
    setItemEdit(null);
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
        unitCost: itemEdit.netUnitCost,
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

    setItems((current) =>
      current.map((entry) =>
        entry.id === editingItemId ? { ...entry, ...itemEdit } : entry,
      ),
    );
    closeItemEditor();
  }

  useEffect(() => {
    if (!editingItemId) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeItemEditor();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editingItemId]);

  const { lineTotals, orderTotals, pricingError } = useMemo(() => {
    const nextLineTotals = new Map<string, ReturnType<typeof calculatePurchaseLineTotals>>();
    try {
      for (const item of items) {
        nextLineTotals.set(
          item.id,
          calculatePurchaseLineTotals({
            unitCost: item.netUnitCost,
            quantity: item.quantity,
            discountType: item.discountType,
            discount: item.discount,
            taxType: item.taxType,
            taxRate: item.orderTax,
          }),
        );
      }

      const nextOrderTotals = calculatePurchaseTotals({
        lineSubtotals: Array.from(nextLineTotals.values(), (totals) => totals.subtotal),
        orderTaxRate: orderTax,
        discount: orderDiscount,
        shipping,
      });
      return { lineTotals: nextLineTotals, orderTotals: nextOrderTotals, pricingError: "" };
    } catch (error) {
      return {
        lineTotals: nextLineTotals,
        orderTotals: null,
        pricingError: error instanceof Error ? error.message : "Enter valid pricing values.",
      };
    }
  }, [items, orderTax, orderDiscount, shipping]);

  return (
    <form className="gg-card gg-card-pad purchase-form-card" action={formAction}>
      {actionState.status === "error" && (
        <p className="warehouse-toast is-visible" role="alert">
          <span>{actionState.message}</span>
        </p>
      )}
      <input
        type="hidden"
        name="returnId"
        value={initialData?.id ?? ""}
        disabled={!initialData}
      />
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(items.map((item) => ({
          productId: item.id,
          netUnitCost: item.netUnitCost,
          quantity: item.quantity,
          unit: item.unit,
          discountType: item.discountType,
          discount: item.discount,
          taxType: item.taxType,
          orderTax: item.orderTax,
        })))}
      />
      <div className="purchase-top">
        <div className="gg-field">
          <label className="gg-label" htmlFor="purchase-return-date">
            Date <span className="gg-req">*</span>
          </label>
          <div className="purchase-date-field">
            <input
              className="gg-input gg-num"
              id="purchase-return-date"
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
          <label className="gg-label" htmlFor="purchase-return-warehouse">
            Warehouse <span className="gg-req">*</span>
          </label>
          <select
            className="gg-select"
            id="purchase-return-warehouse"
            name="warehouseId"
            value={warehouseId}
            onChange={(event) => selectWarehouse(event.target.value)}
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
          <label className="gg-label" htmlFor="purchase-return-supplier">
            Supplier <span className="gg-req">*</span>
          </label>
          <select
            className="gg-select"
            id="purchase-return-supplier"
            name="supplierId"
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
            required
            disabled={isPending}
          >
            <option value="">Choose Supplier</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="gg-field purchase-product-search">
        <label className="gg-label" htmlFor="purchase-return-product-search">Product</label>
        <div className="gg-input-icon">
          <Search aria-hidden="true" />
          <input
            className="gg-input"
            id="purchase-return-product-search"
            type="search"
            placeholder={warehouseId ? "Search product by code or name" : "Choose a warehouse to search"}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={120}
            disabled={!warehouseId || isPending}
            autoComplete="off"
          />
        </div>
        {isSearching && <p className="gg-muted adjustment-search-feedback">Searching products...</p>}
        {searchError && <p className="warehouse-field-error" role="alert">{searchError}</p>}
        {products.length > 0 && (
          <ul className="adjustment-search-results" role="listbox" aria-label="Product search results">
            {products.map((product) => {
              const alreadyAdded = items.some((item) => item.id === product.id);
              return (
                <li key={product.id}>
                  <button
                    className="adjustment-search-result"
                    type="button"
                    role="option"
                    aria-selected={alreadyAdded}
                    disabled={alreadyAdded || isPending}
                    onClick={() => addProduct(product)}
                  >
                    <span className="adjustment-search-result-name">
                      <strong>{product.name}</strong>
                      <span className="gg-chip-code">{product.code}</span>
                    </span>
                    <span className="gg-muted">
                      Current stock: {product.stock} {product.unit}
                      {alreadyAdded ? " · Added" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {warehouseId && query.trim().length === 1 && (
          <p className="gg-muted adjustment-search-feedback">Type at least 2 characters to search.</p>
        )}
        {warehouseId && query.trim().length >= minimumSearchLength && !isSearching && !searchError && products.length === 0 && (
          <p className="gg-muted adjustment-search-feedback">No products with stock match this search.</p>
        )}
      </div>

      <label className="gg-label purchase-items-label" htmlFor="purchase-return-items-table">
        Order items <span className="gg-req">*</span>
      </label>
      <div className="gg-table-wrap">
        <table className="gg-table" id="purchase-return-items-table">
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col">Net Unit Cost</th>
              <th scope="col">Stock</th>
              <th scope="col">Qty</th>
              <th scope="col">Discount</th>
              <th scope="col">Tax</th>
              <th scope="col" className="gg-num">Subtotal</th>
              <th scope="col" className="purchase-item-action-heading">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="gg-muted" style={{ textAlign: "center", padding: "24px 16px" }}>
                  No products added yet.
                </td>
              </tr>
            ) : (
              items.map((item) => {
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
                          >
                            <Pencil aria-hidden="true" />
                          </button>
                        </span>
                      </div>
                    </td>
                    <td className="gg-num">$ {item.netUnitCost}</td>
                    <td>
                      <span className="stock-chip gg-num">
                        {item.stock} {item.unit}
                      </span>
                    </td>
                    <td>
                      <div className="gg-stepper">
                        <button type="button" disabled={isPending} onClick={() => setQuantity(item.id, String(Math.max(1, Number(item.quantity || 1) - 1)))}>
                          <Minus aria-hidden="true" />
                        </button>
                        <input
                          className="gg-num"
                          value={item.quantity}
                          onChange={(event) => setQuantity(item.id, event.target.value)}
                          inputMode="numeric"
                          aria-label={`Quantity for ${item.name}`}
                          disabled={isPending}
                        />
                        <button type="button" disabled={isPending} onClick={() => setQuantity(item.id, String(Number(item.quantity || 1) + 1))}>
                          <Plus aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                    <td className="gg-num">$ {totals?.discount.toString() ?? "0.00"}</td>
                    <td className="gg-num">$ {totals?.tax.toString() ?? "0.00"}</td>
                    <td className="gg-num gg-td-strong">$ {totals?.subtotal.toString() ?? "0.00"}</td>
                    <td className="purchase-item-action-cell">
                      <button
                        className="gg-icon-btn"
                        type="button"
                        aria-label={`Remove ${item.name}`}
                        disabled={isPending}
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="purchase-totals-box">
        <div className="purchase-totals-row">
          <span>Order Tax</span>
          <span className="gg-num">
            $ {orderTotals ? orderTotals.orderTax.toString() : "0.00"} ({orderTax || "0.00"}) %
          </span>
        </div>
        <div className="purchase-totals-row">
          <span>Discount</span>
          <span className="gg-num">$ {orderTotals ? orderTotals.discount.toString() : "0.00"}</span>
        </div>
        <div className="purchase-totals-row">
          <span>Shipping</span>
          <span className="gg-num">$ {orderTotals ? orderTotals.shipping.toString() : "0.00"}</span>
        </div>
        <div className="purchase-totals-row purchase-grand-total">
          <span>Grand Total</span>
          <span className="gg-num">$ {orderTotals ? orderTotals.grandTotal.toString() : "0.00"}</span>
        </div>
      </div>

      {pricingError && <p className="warehouse-field-error" role="alert">{pricingError}</p>}

      <div className="purchase-three-col">
        <div className="gg-field">
          <label className="gg-label" htmlFor="purchase-return-order-tax">Order Tax</label>
          <div className="gg-input-group">
            <input
              className="gg-input gg-num"
              id="purchase-return-order-tax"
              name="orderTax"
              value={orderTax}
              onChange={(event) => setOrderTax(event.target.value)}
              disabled={isPending}
            />
            <span className="gg-input-suffix">%</span>
          </div>
        </div>
        <div className="gg-field">
          <label className="gg-label" htmlFor="purchase-return-discount">Discount</label>
          <div className="gg-input-group">
            <input
              className="gg-input gg-num"
              id="purchase-return-discount"
              name="discount"
              value={orderDiscount}
              onChange={(event) => setOrderDiscount(event.target.value)}
              disabled={isPending}
            />
            <span className="gg-input-suffix">$</span>
          </div>
        </div>
        <div className="gg-field">
          <label className="gg-label" htmlFor="purchase-return-shipping">Shipping</label>
          <div className="gg-input-group">
            <input
              className="gg-input gg-num"
              id="purchase-return-shipping"
              name="shipping"
              value={shipping}
              onChange={(event) => setShipping(event.target.value)}
              disabled={isPending}
            />
            <span className="gg-input-suffix">$</span>
          </div>
        </div>
      </div>

      <div className="gg-field purchase-status-field">
        <label className="gg-label" htmlFor="purchase-return-status">
          Status <span className="gg-req">*</span>
        </label>
        <select
          className="gg-select"
          id="purchase-return-status"
          name="status"
          value={status}
          onChange={(event) => setStatus(event.target.value as "Pending" | "Ordered" | "Received")}
          disabled={isPending}
        >
          <option value="Received">Received</option>
          <option value="Pending">Pending</option>
          <option value="Ordered">Ordered</option>
        </select>
      </div>

      <div className="gg-field purchase-notes-field">
        <label className="gg-label" htmlFor="purchase-return-notes">Notes</label>
        <textarea
          className="gg-textarea"
          id="purchase-return-notes"
          name="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Enter Notes"
          disabled={isPending}
        />
      </div>

      <div className="gg-form-actions">
        <button className="gg-btn gg-btn--primary" type="submit" disabled={isPending || items.length === 0 || Boolean(pricingError)}>
          <Check aria-hidden="true" />
          {isPending ? "Saving..." : "Save"}
        </button>
        <Link
          className="gg-btn gg-btn--secondary"
          href={initialData
            ? `/purchases/returns/${encodeURIComponent(initialData.id)}`
            : "/purchases/returns"}
        >
          <X aria-hidden="true" />
          Cancel
        </Link>
      </div>

      {editingItemId && itemEdit && (
        <div className="purchase-item-overlay" aria-live="polite">
          <div className="gg-card purchase-item-modal" role="dialog" aria-modal="true" aria-label="Edit return line item">
            <div className="gg-card-head gg-modal-head">
              <h3 className="gg-card-title">Edit Return Item</h3>
              <button className="gg-icon-btn" type="button" aria-label="Close item editor" onClick={closeItemEditor}>
                <X aria-hidden="true" />
              </button>
            </div>
            <div className="gg-card-pad purchase-item-modal-body">
              <div className="gg-field">
                <label className="gg-label" htmlFor="purchase-return-item-cost">Net Unit Cost</label>
                <input
                  className="gg-input gg-num"
                  id="purchase-return-item-cost"
                  value={itemEdit.netUnitCost}
                  onChange={(event) => setItemEdit((current) => current ? { ...current, netUnitCost: event.target.value } : current)}
                />
              </div>
              <div className="gg-grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--sp-4)", marginTop: "var(--sp-4)" }}>
                <div className="gg-field">
                  <label className="gg-label" htmlFor="purchase-return-item-tax-type">Tax Type</label>
                  <select
                    className="gg-select"
                    id="purchase-return-item-tax-type"
                    value={itemEdit.taxType}
                    onChange={(event) => setItemEdit((current) => current ? { ...current, taxType: event.target.value as "Inclusive" | "Exclusive" } : current)}
                  >
                    <option value="Exclusive">Exclusive</option>
                    <option value="Inclusive">Inclusive</option>
                  </select>
                </div>
                <div className="gg-field">
                  <label className="gg-label" htmlFor="purchase-return-item-discount-type">Discount Type</label>
                  <select
                    className="gg-select"
                    id="purchase-return-item-discount-type"
                    value={itemEdit.discountType}
                    onChange={(event) => setItemEdit((current) => current ? { ...current, discountType: event.target.value as "Fixed" | "Percentage" } : current)}
                  >
                    <option value="Fixed">Fixed</option>
                    <option value="Percentage">Percentage</option>
                  </select>
                </div>
              </div>
              <div className="gg-grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--sp-4)", marginTop: "var(--sp-4)" }}>
                <div className="gg-field">
                  <label className="gg-label" htmlFor="purchase-return-item-discount">Discount</label>
                  <input
                    className="gg-input gg-num"
                    id="purchase-return-item-discount"
                    value={itemEdit.discount}
                    onChange={(event) => setItemEdit((current) => current ? { ...current, discount: event.target.value } : current)}
                  />
                </div>
                <div className="gg-field">
                  <label className="gg-label" htmlFor="purchase-return-item-tax-rate">Tax %</label>
                  <input
                    className="gg-input gg-num"
                    id="purchase-return-item-tax-rate"
                    value={itemEdit.orderTax}
                    onChange={(event) => setItemEdit((current) => current ? { ...current, orderTax: event.target.value } : current)}
                  />
                </div>
              </div>
              {itemEditError && <p className="warehouse-field-error" role="alert">{itemEditError}</p>}
              <div className="gg-form-actions">
                <button className="gg-btn gg-btn--primary" type="button" onClick={saveItemEditor}>
                  <Check aria-hidden="true" />
                  Save
                </button>
                <button className="gg-btn gg-btn--secondary" type="button" onClick={closeItemEditor}>
                  <X aria-hidden="true" />
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
