"use client";

import Link from "next/link";
import { Prisma } from "@prisma/client";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Minus,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  calculatePurchaseLineTotals,
  calculatePurchaseTotals,
} from "@/lib/purchase-pricing";
import useDialogFocus from "@/components/shared/useDialogFocus";
import {
  createSale,
  searchSaleProducts,
  updateSale,
  type SaleProductSearchResult,
} from "@/app/(authenticated)/sales/create/actions";
import {
  initialSaleCreateActionState,
  type SaleCreateActionState,
} from "@/app/(authenticated)/sales/create/action-state";

type Option = { id: string; name: string };
type SaleProduct = Extract<SaleProductSearchResult, { status: "success" }>["products"][number];
type SaleItem = SaleProduct & {
  quantity: string;
  discountType: "Fixed" | "Percentage";
  discount: string;
  taxType: "Inclusive" | "Exclusive";
  orderTax: string;
};
type SaleItemEdit = Pick<SaleItem, "price" | "unit" | "discountType" | "discount" | "taxType" | "orderTax">;
export type SaleFormInitialData = {
  id: string;
  date: string;
  warehouseId: string;
  customerId: string;
  status: "Pending" | "Ordered" | "Received";
  orderTax: string;
  discount: string;
  shipping: string;
  paid: string;
  paymentType: string;
  notes: string | null;
  items: SaleItem[];
};

const minimumSearchLength = 2;
const paymentTypes = ["Cash", "Card", "Bank Transfer", "Other"];

export default function SaleForm({
  warehouses,
  customers,
  units,
  defaultCustomerId,
  initialData,
}: {
  warehouses: Option[];
  customers: Option[];
  units: string[];
  defaultCustomerId: string;
  initialData?: SaleFormInitialData;
}) {
  const [date, setDate] = useState(() => {
    if (initialData) return initialData.date;
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });
  const [warehouseId, setWarehouseId] = useState(initialData?.warehouseId ?? "");
  const [customerId, setCustomerId] = useState(initialData?.customerId ?? defaultCustomerId);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<SaleProduct[]>([]);
  const [items, setItems] = useState<SaleItem[]>(initialData?.items ?? []);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemEdit, setItemEdit] = useState<SaleItemEdit | null>(null);
  const [itemEditError, setItemEditError] = useState("");
  const [orderTax, setOrderTax] = useState(initialData?.orderTax ?? "0.00");
  const [orderDiscount, setOrderDiscount] = useState(initialData?.discount ?? "0.00");
  const [shipping, setShipping] = useState(initialData?.shipping ?? "0.00");
  const [status, setStatus] = useState<"Pending" | "Ordered" | "Received">(initialData?.status ?? "Received");
  const [initialPaid, setInitialPaid] = useState("0.00");
  const [paymentType, setPaymentType] = useState(initialData?.paymentType ?? "Cash");
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [searchError, setSearchError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const saleAction = initialData
    ? updateSale.bind(null, initialData.id)
    : createSale;
  const [actionState, formAction, isPending] = useActionState<SaleCreateActionState, FormData>(
    saleAction,
    initialSaleCreateActionState,
  );

  useEffect(() => {
    if (!editingItemId) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeItemEditor();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editingItemId]);

  useEffect(() => {
    let cancelled = false;
    const trimmedQuery = query.trim();

    if (!warehouseId || trimmedQuery.length < minimumSearchLength) {
      setProducts([]);
      setSearchError("");
      setIsSearching(false);
      return () => {
        cancelled = true;
      };
    }

    setIsSearching(true);
    setSearchError("");
    const timeout = window.setTimeout(async () => {
      try {
        const result = await searchSaleProducts(warehouseId, trimmedQuery);
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

  function chooseWarehouse(nextWarehouseId: string) {
    setWarehouseId(nextWarehouseId);
    setItems([]);
    setQuery("");
    setProducts([]);
    setSearchError("");
  }

  function addProduct(product: SaleProduct) {
    setItems((current) => current.some((item) => item.id === product.id)
      ? current
      : [...current, {
          ...product,
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

  function openItemEditor(item: SaleItem) {
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

  const isInitialPaidValid = /^\d{1,10}(?:\.\d{1,2})?$/.test(initialPaid);
  const effectivePaid = initialData?.paid ?? initialPaid;
  const paymentStatus = getPaymentStatus(effectivePaid, orderTotals?.grandTotal.toString() ?? "0");

  return (
    <main className="gg-content">
      <div className="page-head">
        <h1 className="gg-page-title">{initialData ? "Edit Sale" : "Create Sale"}</h1>
        <Link className="gg-btn gg-btn--secondary" href="/sales">
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
            price: item.price,
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
            <label className="gg-label" htmlFor="sale-date">Date <span className="gg-req">*</span></label>
            <div className="date-field purchase-date-field">
              <input
                className="gg-input gg-num"
                id="sale-date"
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
            <label className="gg-label" htmlFor="sale-warehouse">Warehouse <span className="gg-req">*</span></label>
            <select
              className="gg-select"
              id="sale-warehouse"
              name="warehouseId"
              value={warehouseId}
              onChange={(event) => chooseWarehouse(event.target.value)}
              required
              disabled={isPending}
            >
              <option value="">Choose Warehouse</option>
              {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </select>
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="sale-customer">Customer <span className="gg-req">*</span></label>
            <select
              className="gg-select"
              id="sale-customer"
              name="customerId"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              required
              disabled={isPending}
            >
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </div>
        </div>

        <div className="gg-field purchase-product-search">
          <label className="gg-label" htmlFor="sale-product-search">Product</label>
          <div className="gg-input-icon">
            <Search aria-hidden="true" />
            <input
              className="gg-input"
              id="sale-product-search"
              type="search"
              placeholder={warehouseId ? "Search Product by Code Name" : "Choose a warehouse to search"}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              maxLength={120}
              disabled={!warehouseId || isPending}
              autoComplete="off"
              aria-autocomplete="list"
              aria-controls="sale-product-results"
            />
          </div>
          {isSearching && <p className="gg-muted adjustment-search-feedback">Searching products...</p>}
          {searchError && <p className="warehouse-field-error" role="alert">{searchError}</p>}
          {products.length > 0 && (
            <ul className="adjustment-search-results" id="sale-product-results" role="listbox" aria-label="Product search results">
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
                        Price: $ {product.price} · Stock: {product.stock} {product.unit}
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
            <p className="gg-muted adjustment-search-feedback">No products with available stock match this search.</p>
          )}
        </div>

        <h2 className="gg-label purchase-items-label">Order items <span className="gg-req">*</span></h2>
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
                            aria-label={`Edit ${item.name} sale details`}
                            title="Edit product sale details"
                            onClick={() => openItemEditor(item)}
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
                          aria-label={`Decrease ${item.name} quantity`}
                          onClick={() => setQuantity(item.id, String(Math.max(0.001, (Number(item.quantity) || 1) - 1)))}
                          disabled={isPending}
                        >
                          <Minus aria-hidden="true" size={15} />
                        </button>
                        <input
                          className="gg-num"
                          type="number"
                          min="0.001"
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
                    <td className="gg-num gg-td-strong">{totals ? `$ ${totals.subtotal.toFixed(2)}` : "—"}</td>
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
                    <p className="gg-muted">Search for a product with stock in the selected warehouse.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="purchase-totals-box" aria-label="Sale totals">
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
        {pricingError && <p className="warehouse-field-error" role="alert">{pricingError}</p>}

        <div className="purchase-three-col">
          <div className="gg-field">
            <label className="gg-label" htmlFor="sale-order-tax">Order Tax</label>
            <div className="gg-input-group">
              <input className="gg-input gg-num" id="sale-order-tax" name="orderTax" type="number" min="0" max="100" step="0.01" value={orderTax} onChange={(event) => setOrderTax(event.target.value)} disabled={isPending} />
              <span className="gg-input-suffix">%</span>
            </div>
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="sale-discount">Discount</label>
            <div className="gg-input-group">
              <input className="gg-input gg-num" id="sale-discount" name="discount" type="number" min="0" step="0.01" value={orderDiscount} onChange={(event) => setOrderDiscount(event.target.value)} disabled={isPending} />
              <span className="gg-input-suffix">$</span>
            </div>
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="sale-shipping">Shipping</label>
            <div className="gg-input-group">
              <input className="gg-input gg-num" id="sale-shipping" name="shipping" type="number" min="0" step="0.01" value={shipping} onChange={(event) => setShipping(event.target.value)} disabled={isPending} />
              <span className="gg-input-suffix">$</span>
            </div>
          </div>
        </div>

        <div className="purchase-three-col">
          <div className="gg-field">
            <label className="gg-label" htmlFor="sale-status">Status <span className="gg-req">*</span></label>
            <select
              className="gg-select"
              id="sale-status"
              name="status"
              value={status}
              onChange={(event) => {
                if (event.target.value === "Received" || event.target.value === "Pending" || event.target.value === "Ordered") {
                  setStatus(event.target.value);
                }
              }}
              disabled={isPending}
            >
              <option value="Received">Received</option>
              <option value="Pending">Pending</option>
              <option value="Ordered">Ordered</option>
            </select>
          </div>
          {!initialData && <div className="gg-field">
            <label className="gg-label" htmlFor="sale-initial-paid">Initial Paid Amount</label>
            <div className="gg-input-group">
              <input className="gg-input gg-num" id="sale-initial-paid" name="paid" type="number" min="0" step="0.01" value={initialPaid} onChange={(event) => setInitialPaid(event.target.value)} disabled={isPending} />
              <span className="gg-input-suffix">$</span>
            </div>
            {!isInitialPaidValid && <span className="warehouse-field-error">Enter a valid amount with up to 2 decimal places.</span>}
          </div>}
          <div className="gg-field">
            <label className="gg-label" htmlFor="sale-payment-type">Payment Type</label>
            <select className="gg-select" id="sale-payment-type" name="paymentType" value={paymentType} onChange={(event) => setPaymentType(event.target.value)} disabled={isPending}>
              {!paymentTypes.includes(paymentType) && <option value={paymentType}>{paymentType}</option>}
              {paymentTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
        </div>

        <div className="purchase-three-col">
          <div className="gg-field">
            <label className="gg-label" htmlFor="sale-payment-status">Payment Status <span className="gg-req">*</span></label>
            <select className="gg-select" id="sale-payment-status" value={paymentStatus} disabled aria-readonly="true">
              <option value="Unpaid">Unpaid</option>
              <option value="Partial">Partial</option>
              <option value="Paid">Paid</option>
            </select>
            {initialData && (
              <span className="gg-muted">
                Existing payments ($ {initialData.paid}) will be preserved and recalculated against the updated total.
              </span>
            )}
          </div>
        </div>

        <div className="gg-field purchase-notes-field">
          <label className="gg-label" htmlFor="sale-notes">Notes</label>
          <textarea className="gg-textarea" id="sale-notes" name="notes" placeholder="Enter Notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={5000} disabled={isPending} />
        </div>

        <div className="gg-form-actions">
          <button className="gg-btn gg-btn--primary" type="submit" disabled={isPending || items.length === 0 || Boolean(pricingError) || (!initialData && !isInitialPaidValid)}>
            <Check aria-hidden="true" />
            {isPending ? "Saving..." : initialData ? "Update Sale" : "Save Sale"}
          </button>
          <Link className="gg-btn gg-btn--secondary" href={initialData ? `/sales/${encodeURIComponent(initialData.id)}` : "/sales"}>Cancel</Link>
        </div>
      </form>

      {editingItemId && itemEdit && (
        <SaleItemEditModal
          item={items.find((item) => item.id === editingItemId)}
          edit={itemEdit}
          units={units}
          error={itemEditError}
          onChange={setItemEdit}
          onSave={saveItemEditor}
          onClose={closeItemEditor}
        />
      )}
    </main>
  );
}

function getPaymentStatus(paid: string, grandTotal: string) {
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(paid)) return "Unpaid";
  const paidAmount = new Prisma.Decimal(paid);
  const total = new Prisma.Decimal(grandTotal);
  if (paidAmount.isZero()) return "Unpaid";
  if (paidAmount.greaterThanOrEqualTo(total)) return "Paid";
  return "Partial";
}

function SaleItemEditModal({
  item,
  edit,
  units,
  error,
  onChange,
  onSave,
  onClose,
}: {
  item?: SaleItem;
  edit: SaleItemEdit;
  units: string[];
  error: string;
  onChange: (edit: SaleItemEdit) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef);
  if (!item) return null;

  return (
    <div
      className="purchase-item-overlay is-open"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section ref={dialogRef} tabIndex={-1} className="gg-modal purchase-item-modal" role="dialog" aria-modal="true" aria-labelledby="sale-item-modal-title">
        <div className="gg-modal-head">
          <h2 className="gg-card-title" id="sale-item-modal-title">{item.name}</h2>
          <button className="gg-modal-close" type="button" aria-label="Close product details" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="gg-modal-body purchase-item-modal-body">
          <div className="gg-field">
            <label className="gg-label" htmlFor="sale-item-price">Product Price <span className="gg-req">*</span></label>
            <div className="gg-input-group">
              <input className="gg-input gg-num" id="sale-item-price" type="number" min="0" step="0.01" value={edit.price} onChange={(event) => onChange({ ...edit, price: event.target.value })} />
              <span className="gg-input-suffix">$</span>
            </div>
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="sale-item-tax-type">Tax Type <span className="gg-req">*</span></label>
            <select className="gg-select" id="sale-item-tax-type" value={edit.taxType} onChange={(event) => {
              if (event.target.value === "Inclusive" || event.target.value === "Exclusive") onChange({ ...edit, taxType: event.target.value });
            }}>
              <option value="Inclusive">Inclusive</option>
              <option value="Exclusive">Exclusive</option>
            </select>
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="sale-item-tax">Order Tax</label>
            <div className="gg-input-group">
              <input className="gg-input gg-num" id="sale-item-tax" type="number" min="0" max="100" step="0.01" value={edit.orderTax} onChange={(event) => onChange({ ...edit, orderTax: event.target.value })} />
              <span className="gg-input-suffix">%</span>
            </div>
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="sale-item-discount-type">Discount Type <span className="gg-req">*</span></label>
            <select className="gg-select" id="sale-item-discount-type" value={edit.discountType} onChange={(event) => {
              if (event.target.value === "Fixed" || event.target.value === "Percentage") onChange({ ...edit, discountType: event.target.value });
            }}>
              <option value="Fixed">Fixed</option>
              <option value="Percentage">Percentage</option>
            </select>
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="sale-item-discount">Discount <span className="gg-req">*</span></label>
            <input className="gg-input gg-num" id="sale-item-discount" type="number" min="0" step="0.01" value={edit.discount} onChange={(event) => onChange({ ...edit, discount: event.target.value })} />
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="sale-item-unit">Sale Unit <span className="gg-req">*</span></label>
            <select className="gg-select" id="sale-item-unit" value={edit.unit} onChange={(event) => onChange({ ...edit, unit: event.target.value })}>
              {!units.includes(edit.unit) && <option value={edit.unit}>{edit.unit}</option>}
              {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </div>
          {error && <p className="warehouse-field-error" role="alert">{error}</p>}
        </div>
        <div className="gg-modal-foot">
          <button className="gg-btn gg-btn--primary" type="button" onClick={onSave}>
            <Check aria-hidden="true" />Save
          </button>
          <button className="gg-btn gg-btn--secondary" type="button" onClick={onClose}>Cancel</button>
        </div>
      </section>
    </div>
  );
}
