"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Minus, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import {
  calculatePurchaseLineTotals,
  calculatePurchaseTotals,
} from "@/lib/purchase-pricing";
import useDialogFocus from "@/components/shared/useDialogFocus";
import { createPurchase, searchPurchaseProducts } from "@/app/(authenticated)/purchases/actions";
import {
  initialPurchaseCreateActionState,
  type PurchaseCreateActionState,
} from "@/app/(authenticated)/purchases/create/action-state";

type Option = { id: string; name: string };
type ProductResult = {
  id: string;
  code: string;
  name: string;
  netUnitCost: string;
  unit: string;
  stock: string;
};
type PurchaseDraftItem = ProductResult & {
  stockUnit: string;
  quantity: string;
  discountType: "Fixed" | "Percentage";
  discount: string;
  taxType: "Inclusive" | "Exclusive";
  orderTax: string;
};

type PurchaseItemEdit = Pick<
  PurchaseDraftItem,
  "netUnitCost" | "unit" | "discountType" | "discount" | "taxType" | "orderTax"
>;

const minimumSearchLength = 2;

export default function PurchaseForm({
  warehouses,
  suppliers,
  units,
}: {
  warehouses: Option[];
  suppliers: Option[];
  units: string[];
}) {
  const [date, setDate] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });
  const [warehouseId, setWarehouseId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<ProductResult[]>([]);
  const [items, setItems] = useState<PurchaseDraftItem[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemEdit, setItemEdit] = useState<PurchaseItemEdit | null>(null);
  const [itemEditError, setItemEditError] = useState("");
  const [orderTax, setOrderTax] = useState("0.00");
  const [orderDiscount, setOrderDiscount] = useState("0.00");
  const [shipping, setShipping] = useState("0.00");
  const [status, setStatus] = useState<"Pending" | "Ordered" | "Received">("Received");
  const [notes, setNotes] = useState("");
  const [searchError, setSearchError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [actionState, formAction, isPending] = useActionState<
    PurchaseCreateActionState,
    FormData
  >(createPurchase, initialPurchaseCreateActionState);
  const itemDialogRef = useRef<HTMLElement>(null);
  useDialogFocus(itemDialogRef, Boolean(editingItemId && itemEdit));

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
        const result = await searchPurchaseProducts(warehouseId, trimmedQuery);
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

  function selectWarehouse(nextWarehouseId: string) {
    setWarehouseId(nextWarehouseId);
    setItems([]);
    setQuery("");
    setProducts([]);
    setSearchError("");
  }

  function addProduct(product: ProductResult) {
    setItems((current) => current.some((item) => item.id === product.id)
      ? current
      : [...current, {
          ...product,
          stockUnit: product.unit,
          quantity: "1",
          discountType: "Fixed",
          discount: "0.00",
          taxType: "Exclusive",
          orderTax: "0.00",
        }]);
    setQuery("");
    setProducts([]);
  }

  function setQuantity(productId: string, quantity: string) {
    setItems((current) => current.map((item) => (
      item.id === productId ? { ...item, quantity } : item
    )));
  }

  function openItemEditor(item: PurchaseDraftItem) {
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

    setItems((current) => current.map((entry) => (
      entry.id === editingItemId ? { ...entry, ...itemEdit } : entry
    )));
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
        nextLineTotals.set(item.id, calculatePurchaseLineTotals({
          unitCost: item.netUnitCost,
          quantity: item.quantity,
          discountType: item.discountType,
          discount: item.discount,
          taxType: item.taxType,
          taxRate: item.orderTax,
        }));
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
    <main className="gg-content">
      <div className="page-head">
        <h1 className="gg-page-title">Create Purchase</h1>
        <Link className="gg-btn gg-btn--secondary" href="/purchases">
          <ArrowLeft aria-hidden="true" />
          Back
        </Link>
      </div>

      <form className="gg-card gg-card-pad purchase-form-card" action={formAction}>
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
            unit: item.unit,
            discountType: item.discountType,
            discount: item.discount,
            taxType: item.taxType,
            orderTax: item.orderTax,
          })))}
        />
        <div className="purchase-top">
          <div className="gg-field">
            <label className="gg-label" htmlFor="purchase-date">
              Date <span className="gg-req">*</span>
            </label>
            <input
              className="gg-input gg-num"
              id="purchase-date"
              name="date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
              disabled={isPending}
            />
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="purchase-warehouse">
              Warehouse <span className="gg-req">*</span>
            </label>
            <select
              className="gg-select"
              id="purchase-warehouse"
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
            <label className="gg-label" htmlFor="purchase-supplier">
              Supplier <span className="gg-req">*</span>
            </label>
            <select
              className="gg-select"
              id="purchase-supplier"
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
          <label className="gg-label" htmlFor="purchase-product-search">Product</label>
          <div className="gg-input-icon">
            <Search aria-hidden="true" />
            <input
              className="gg-input"
              id="purchase-product-search"
              type="search"
              placeholder={warehouseId ? "Search product by code or name" : "Choose a warehouse to search"}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={120}
              disabled={!warehouseId || isPending}
              autoComplete="off"
              aria-autocomplete="list"
              aria-controls="purchase-product-results"
            />
          </div>
          {isSearching && <p className="gg-muted adjustment-search-feedback">Searching products...</p>}
          {searchError && <p className="warehouse-field-error" role="alert">{searchError}</p>}
          {products.length > 0 && (
            <ul
              className="adjustment-search-results"
              id="purchase-product-results"
              role="listbox"
              aria-label="Product search results"
            >
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
            <p className="gg-muted adjustment-search-feedback">No products match this search.</p>
          )}
        </div>

        <h2 className="gg-label purchase-items-label">
          Order items <span className="gg-req">*</span>
        </h2>
        <div className="gg-table-wrap">
          <table className="gg-table purchase-items-table">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col" className="gg-num">Net Unit Cost</th>
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
                          aria-label={`Edit ${item.name} purchase details`}
                          title="Edit product purchase details"
                          onClick={() => openItemEditor(item)}
                        >
                          <Pencil aria-hidden="true" />
                        </button>
                      </span>
                    </div>
                  </td>
                  <td className="gg-num">$ {item.netUnitCost}</td>
                  <td><span className="stock-chip gg-num">{item.stock} {item.stockUnit}</span></td>
                  <td>
                    <div className="gg-stepper">
                      <button
                        type="button"
                        aria-label={`Decrease ${item.name} quantity`}
                        onClick={() => setQuantity(item.id, String(Math.max(1, (Number(item.quantity) || 1) - 1)))}
                        disabled={isPending}
                      >
                        <Minus aria-hidden="true" size={15} />
                      </button>
                      <input
                        className="gg-num"
                        type="number"
                        min="1"
                        step="0.001"
                        value={item.quantity}
                        onChange={(event) => setQuantity(item.id, event.target.value)}
                        aria-label={`${item.name} quantity`}
                        disabled={isPending}
                      />
                      <button
                        type="button"
                        aria-label={`Increase ${item.name} quantity`}
                        onClick={() => setQuantity(item.id, String((Number(item.quantity) || 0) + 1))}
                        disabled={isPending}
                      >
                        <Plus aria-hidden="true" size={15} />
                      </button>
                    </div>
                  </td>
                  <td className="gg-num">
                    {totals ? `$ ${totals.discount.toFixed(2)}` : "—"}
                    {item.discountType === "Percentage" && ` (${item.discount}%)`}
                  </td>
                  <td className="gg-num">
                    {totals ? `$ ${totals.tax.toFixed(2)}` : "—"}
                    {item.orderTax !== "0" && item.orderTax !== "0.00" && ` (${item.orderTax}%)`}
                  </td>
                  <td className="gg-num gg-td-strong">
                    {totals ? `$ ${totals.subtotal.toFixed(2)}` : "—"}
                  </td>
                  <td className="purchase-item-action-cell">
                    <button
                      className="gg-icon-btn purchase-item-remove"
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
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
                    <p className="gg-muted">Search for a product and add it to this purchase.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="purchase-totals-box" aria-label="Purchase totals">
          <div className="purchase-totals-row">
            <span>Order Tax</span>
            <span className="gg-num">
              {orderTotals
                ? `$ ${orderTotals.orderTax.toFixed(2)} (${orderTax || "0"}%)`
                : "—"}
            </span>
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
        {pricingError && <p className="warehouse-field-error" role="alert">{pricingError}</p>}

        <div className="purchase-three-col">
          <div className="gg-field">
            <label className="gg-label" htmlFor="purchase-order-tax">Order Tax</label>
            <div className="gg-input-group">
              <input className="gg-input gg-num" id="purchase-order-tax" name="orderTax" type="number" min="0" max="100" step="0.01" value={orderTax} onChange={(event) => setOrderTax(event.target.value)} disabled={isPending} />
              <span className="gg-input-suffix">%</span>
            </div>
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="purchase-discount">Discount</label>
            <div className="gg-input-group">
              <input className="gg-input gg-num" id="purchase-discount" name="discount" type="number" min="0" step="0.01" value={orderDiscount} onChange={(event) => setOrderDiscount(event.target.value)} disabled={isPending} />
              <span className="gg-input-suffix">$</span>
            </div>
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="purchase-shipping">Shipping</label>
            <div className="gg-input-group">
              <input className="gg-input gg-num" id="purchase-shipping" name="shipping" type="number" min="0" step="0.01" value={shipping} onChange={(event) => setShipping(event.target.value)} disabled={isPending} />
              <span className="gg-input-suffix">$</span>
            </div>
          </div>
        </div>

        <div className="gg-field purchase-status-field">
          <label className="gg-label" htmlFor="purchase-status">Status <span className="gg-req">*</span></label>
          <select className="gg-select" id="purchase-status" name="status" value={status} onChange={(event) => {
            if (event.target.value === "Received" || event.target.value === "Pending" || event.target.value === "Ordered") {
              setStatus(event.target.value);
            }
          }} disabled={isPending}>
            <option value="Received">Received</option>
            <option value="Pending">Pending</option>
            <option value="Ordered">Ordered</option>
          </select>
        </div>
        <div className="gg-field purchase-notes-field">
          <label className="gg-label" htmlFor="purchase-notes">Notes</label>
          <textarea className="gg-textarea" id="purchase-notes" name="notes" placeholder="Enter Notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={5000} disabled={isPending} />
        </div>

        <div className="gg-form-actions">
          <button className="gg-btn gg-btn--primary" type="submit" disabled={isPending || items.length === 0 || Boolean(pricingError)}>
            <Check aria-hidden="true" />
            {isPending ? "Saving..." : "Save Purchase"}
          </button>
          <Link className="gg-btn gg-btn--secondary" href="/purchases">Cancel</Link>
        </div>
      </form>
      {editingItemId && itemEdit && (
        <div
          className="purchase-item-overlay is-open"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeItemEditor();
          }}
        >
          <section
            ref={itemDialogRef}
            tabIndex={-1}
            className="gg-modal purchase-item-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="purchase-item-modal-title"
          >
            <div className="gg-modal-head">
              <h2 className="gg-card-title" id="purchase-item-modal-title">
                {items.find((item) => item.id === editingItemId)?.name ?? "Product"}
              </h2>
              <button
                className="gg-modal-close"
                type="button"
                aria-label="Close product details"
                onClick={closeItemEditor}
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <div className="gg-modal-body purchase-item-modal-body">
              <div className="gg-field">
                <label className="gg-label" htmlFor="purchase-item-cost">
                  Product Cost <span className="gg-req">*</span>
                </label>
                <div className="gg-input-group">
                  <input
                    className="gg-input gg-num"
                    id="purchase-item-cost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={itemEdit.netUnitCost}
                    onChange={(event) => setItemEdit((current) => current && ({
                      ...current,
                      netUnitCost: event.target.value,
                    }))}
                    required
                  />
                  <span className="gg-input-suffix">$</span>
                </div>
              </div>
              <div className="gg-field">
                <label className="gg-label" htmlFor="purchase-item-tax-type">
                  Tax Type <span className="gg-req">*</span>
                </label>
                <select
                  className="gg-select"
                  id="purchase-item-tax-type"
                  value={itemEdit.taxType}
                  onChange={(event) => {
                    const taxType = event.target.value;
                    if (taxType === "Inclusive" || taxType === "Exclusive") {
                      setItemEdit((current) => current && ({ ...current, taxType }));
                    }
                  }}
                >
                  <option value="Inclusive">Inclusive</option>
                  <option value="Exclusive">Exclusive</option>
                </select>
              </div>
              <div className="gg-field">
                <label className="gg-label" htmlFor="purchase-item-tax">Order Tax</label>
                <div className="gg-input-group">
                  <input
                    className="gg-input gg-num"
                    id="purchase-item-tax"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={itemEdit.orderTax}
                    onChange={(event) => setItemEdit((current) => current && ({
                      ...current,
                      orderTax: event.target.value,
                    }))}
                  />
                  <span className="gg-input-suffix">%</span>
                </div>
              </div>
              <div className="gg-field">
                <label className="gg-label" htmlFor="purchase-item-discount-type">
                  Discount Type <span className="gg-req">*</span>
                </label>
                <select
                  className="gg-select"
                  id="purchase-item-discount-type"
                  value={itemEdit.discountType}
                  onChange={(event) => {
                    const discountType = event.target.value;
                    if (discountType === "Fixed" || discountType === "Percentage") {
                      setItemEdit((current) => current && ({
                        ...current,
                        discountType,
                      }));
                    }
                  }}
                >
                  <option value="Fixed">Fixed</option>
                  <option value="Percentage">Percentage</option>
                </select>
              </div>
              <div className="gg-field">
                <label className="gg-label" htmlFor="purchase-item-discount">
                  Discount <span className="gg-req">*</span>
                </label>
                <input
                  className="gg-input gg-num"
                  id="purchase-item-discount"
                  type="number"
                  min="0"
                  max={itemEdit.discountType === "Percentage" ? "100" : undefined}
                  step="0.01"
                  value={itemEdit.discount}
                  onChange={(event) => setItemEdit((current) => current && ({
                    ...current,
                    discount: event.target.value,
                  }))}
                  required
                />
              </div>
              <div className="gg-field">
                <label className="gg-label" htmlFor="purchase-item-unit">
                  Purchase Unit <span className="gg-req">*</span>
                </label>
                <select
                  className="gg-select"
                  id="purchase-item-unit"
                  value={itemEdit.unit}
                  onChange={(event) => setItemEdit((current) => current && ({
                    ...current,
                    unit: event.target.value,
                  }))}
                  required
                >
                  {[...new Set([...units, itemEdit.unit])].map((unit) => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </div>
              {itemEditError && <p className="warehouse-field-error" role="alert">{itemEditError}</p>}
            </div>
            <div className="gg-modal-foot">
              <button className="gg-btn gg-btn--primary" type="button" onClick={saveItemEditor}>
                <Check aria-hidden="true" />
                Save
              </button>
              <button className="gg-btn gg-btn--secondary" type="button" onClick={closeItemEditor}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
