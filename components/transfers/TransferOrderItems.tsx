"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Prisma } from "@prisma/client";
import { Check, Minus, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import {
  getTransferProductStocks,
  searchTransferProducts,
  type TransferProductSearchResult,
} from "@/app/(authenticated)/transfers/create/actions";
import { calculatePurchaseLineTotals } from "@/lib/purchase-pricing";

type ProductOption = Extract<TransferProductSearchResult, { status: "success" }>["products"][number];
type DiscountType = "Fixed" | "Percentage";
type TaxType = "Inclusive" | "Exclusive";

export type TransferDraftItem = ProductOption & {
  quantity: string;
  discountType: DiscountType;
  discount: string;
  taxType: TaxType;
  orderTax: string;
};

type ItemEdit = Pick<
  TransferDraftItem,
  "netUnitCost" | "discountType" | "discount" | "taxType" | "orderTax"
>;

const minimumSearchLength = 2;
const minimumTransferQuantity = new Prisma.Decimal(1);

function parseQuantity(value: string) {
  try {
    const quantity = new Prisma.Decimal(value);
    return quantity.isFinite() ? quantity : null;
  } catch {
    return null;
  }
}

export default function TransferOrderItems({
  warehouseId,
  items,
  onItemsChange,
  disabled = false,
  transferId = null,
}: {
  warehouseId: string;
  items: TransferDraftItem[];
  onItemsChange: Dispatch<SetStateAction<TransferDraftItem[]>>;
  disabled?: boolean;
  transferId?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [searchError, setSearchError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemEdit, setItemEdit] = useState<ItemEdit | null>(null);
  const [itemEditError, setItemEditError] = useState("");

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
        const result = await searchTransferProducts(warehouseId, trimmedQuery);
        if (cancelled) return;

        if (result.status === "error") {
          setProducts([]);
          setSearchError(result.message);
          return;
        }

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

  const productIdsKey = items.map((item) => item.id).sort().join(",");
  useEffect(() => {
    let cancelled = false;
    if (!warehouseId || !transferId || !productIdsKey) return;

    const productIds = productIdsKey.split(",");
    void getTransferProductStocks(warehouseId, productIds, transferId).then((result) => {
      if (cancelled) return;
      if (result.status === "error") {
        setSearchError(result.message);
        return;
      }
      const stockByProductId = new Map(result.stocks.map((stock) => [stock.productId, stock.stock]));
      onItemsChange((currentItems) => currentItems.map((item) => {
        const stock = stockByProductId.get(item.id);
        return stock === undefined || item.stock === stock ? item : { ...item, stock };
      }));
    }).catch(() => {
      if (!cancelled) {
        setSearchError("Source warehouse stock could not be refreshed. Please try again.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [warehouseId, transferId, productIdsKey, onItemsChange]);

  useEffect(() => {
    if (!editingItemId) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeItemEditor();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editingItemId]);

  const lineTotals = useMemo(() => {
    const totals = new Map<string, ReturnType<typeof calculatePurchaseLineTotals>>();
    for (const item of items) {
      try {
        totals.set(item.id, calculatePurchaseLineTotals({
          unitCost: item.netUnitCost,
          quantity: item.quantity,
          discountType: item.discountType,
          discount: item.discount,
          taxType: item.taxType,
          taxRate: item.orderTax,
        }));
      } catch {
        // The current row displays an invalid amount until the user corrects its fields.
      }
    }
    return totals;
  }, [items]);

  function changeItems(update: (current: TransferDraftItem[]) => TransferDraftItem[]) {
    onItemsChange(update);
  }

  function addProduct(product: ProductOption) {
    if (items.some((item) => item.id === product.id)) return;
    if (new Prisma.Decimal(product.stock).lessThan(minimumTransferQuantity)) return;

    onItemsChange([...items, {
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
    changeItems((current) => current.map((item) => (
      item.id === productId ? { ...item, quantity } : item
    )));
  }

  function stepQuantity(item: TransferDraftItem, direction: -1 | 1) {
    try {
      const current = new Prisma.Decimal(item.quantity);
      const stock = new Prisma.Decimal(item.stock);
      const step = new Prisma.Decimal(1);
      const next = direction === 1 ? current.plus(step) : current.minus(step);
      const bounded = direction === 1
        ? Prisma.Decimal.min(next, stock)
        : Prisma.Decimal.max(next, minimumTransferQuantity);
      setQuantity(item.id, bounded.toString());
    } catch {
      setQuantity(item.id, "1");
    }
  }

  function openItemEditor(item: TransferDraftItem) {
    setEditingItemId(item.id);
    setItemEdit({
      netUnitCost: item.netUnitCost,
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

    changeItems((current) => current.map((entry) => (
      entry.id === editingItemId ? { ...entry, ...itemEdit } : entry
    )));
    closeItemEditor();
  }

  const activeItem = editingItemId ? items.find((item) => item.id === editingItemId) : undefined;

  return (
    <>
      <div className="gg-field transfer-product-search">
        <label className="gg-label" htmlFor="transfer-product-search">Product</label>
        <div className="gg-input-icon">
          <Search aria-hidden="true" />
          <input
            className="gg-input"
            id="transfer-product-search"
            type="search"
            placeholder={warehouseId ? "Search Product by Code Name" : "Choose a source warehouse to search"}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={120}
            disabled={!warehouseId || disabled}
            autoComplete="off"
            aria-autocomplete="list"
            aria-controls="transfer-product-results"
          />
        </div>
        {isSearching && <p className="gg-muted adjustment-search-feedback">Searching products...</p>}
        {searchError && <p className="warehouse-field-error" role="alert">{searchError}</p>}
        {products.length > 0 && (
          <ul
            className="adjustment-search-results"
            id="transfer-product-results"
            role="listbox"
            aria-label="Products in the source warehouse"
          >
            {products.map((product) => {
              const alreadyAdded = items.some((item) => item.id === product.id);
              const canTransferMinimum = new Prisma.Decimal(product.stock).greaterThanOrEqualTo(minimumTransferQuantity);
              return (
                <li key={product.id}>
                  <button
                    className="adjustment-search-result"
                    type="button"
                    role="option"
                    aria-selected={alreadyAdded}
                    disabled={disabled || alreadyAdded || !canTransferMinimum}
                    onClick={() => addProduct(product)}
                  >
                    <span className="adjustment-search-result-name">
                      <strong>{product.name}</strong>
                      <span className="gg-chip-code">{product.code}</span>
                    </span>
                    <span className="gg-muted">
                      Stock in source: {product.stock} {product.unit}
                      {alreadyAdded ? " · Added" : !canTransferMinimum ? " · Less than minimum quantity" : ""}
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

      <h2 className="gg-label transfer-items-label">
        Order items <span className="gg-req">*</span>
      </h2>
      <div className="gg-table-wrap">
        <table className="gg-table transfer-items-table">
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col" className="gg-num">Net Unit Cost</th>
              <th scope="col">Stock</th>
              <th scope="col">Qty</th>
              <th scope="col">Discount</th>
              <th scope="col">Tax</th>
              <th scope="col" className="gg-num">Subtotal</th>
              <th scope="col" className="transfer-item-action-heading">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const totals = lineTotals.get(item.id);
              let quantityError = "";
              const quantity = parseQuantity(item.quantity);
              if (!quantity) {
                quantityError = "Enter a valid quantity.";
              } else {
                const stock = new Prisma.Decimal(item.stock);
                if (quantity.lessThan(minimumTransferQuantity)) quantityError = "Minimum quantity is 1.";
                else if (quantity.greaterThan(stock)) quantityError = "Quantity exceeds source stock.";
              }

              return (
                <tr key={item.id}>
                  <td>
                    <div className="transfer-product-cell">
                      <span className="transfer-product-code">{item.code}</span>
                      <span className="transfer-product-name-row">
                        <span className="gg-chip-unit">{item.name}</span>
                        <button
                          className="transfer-item-edit"
                          type="button"
                          aria-label={`Edit ${item.name} transfer details`}
                          title="Edit product transfer details"
                          onClick={() => openItemEditor(item)}
                          disabled={disabled}
                        >
                          <Pencil aria-hidden="true" />
                        </button>
                      </span>
                    </div>
                    {quantityError && <span className="warehouse-field-error">{quantityError}</span>}
                  </td>
                  <td className="gg-num">$ {item.netUnitCost}</td>
                  <td><span className="stock-chip gg-num">{item.stock} {item.unit}</span></td>
                  <td>
                    <div className="gg-stepper">
                      <button
                        type="button"
                        aria-label={`Decrease ${item.name} quantity`}
                        onClick={() => stepQuantity(item, -1)}
                        disabled={disabled || !quantity || quantity.lessThanOrEqualTo(minimumTransferQuantity)}
                      >
                        <Minus aria-hidden="true" size={15} />
                      </button>
                      <input
                        className="gg-num"
                        type="number"
                        min="1"
                        max={item.stock}
                        step="0.001"
                        value={item.quantity}
                        onChange={(event) => setQuantity(item.id, event.target.value)}
                        aria-label={`${item.name} transfer quantity`}
                        disabled={disabled}
                      />
                      <button
                        type="button"
                        aria-label={`Increase ${item.name} quantity`}
                        onClick={() => stepQuantity(item, 1)}
                        disabled={disabled || !quantity || quantity.greaterThanOrEqualTo(new Prisma.Decimal(item.stock))}
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
                  <td className="transfer-item-action-cell">
                    <button
                      className="gg-icon-btn transfer-item-remove"
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => changeItems((current) => current.filter((entry) => entry.id !== item.id))}
                      disabled={disabled}
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
                  <p className="gg-muted">Search for a product with stock in the source warehouse.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!disabled && editingItemId && itemEdit && activeItem && (
        <div
          className="gg-overlay is-open transfer-item-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeItemEditor();
          }}
        >
          <section className="gg-modal" role="dialog" aria-modal="true" aria-labelledby="transfer-item-title">
            <div className="gg-modal-head">
              <span className="gg-card-title" id="transfer-item-title">{activeItem.name}</span>
              <button className="gg-modal-close" type="button" aria-label="Close" onClick={closeItemEditor}>
                <X aria-hidden="true" />
              </button>
            </div>
            <div className="gg-modal-body transfer-item-modal-body">
              <div className="gg-field">
                <label className="gg-label" htmlFor="transfer-item-cost">Product Cost <span className="gg-req">*</span></label>
                <div className="gg-input-group">
                  <input
                    className="gg-input gg-num"
                    id="transfer-item-cost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={itemEdit.netUnitCost}
                    onChange={(event) => setItemEdit({ ...itemEdit, netUnitCost: event.target.value })}
                  />
                  <span className="gg-input-suffix">$</span>
                </div>
              </div>
              <div className="gg-field">
                <label className="gg-label" htmlFor="transfer-item-tax-type">Tax Type <span className="gg-req">*</span></label>
                <select
                  className="gg-select"
                  id="transfer-item-tax-type"
                  value={itemEdit.taxType}
                  onChange={(event) => {
                    if (event.target.value === "Inclusive" || event.target.value === "Exclusive") {
                      setItemEdit({ ...itemEdit, taxType: event.target.value });
                    }
                  }}
                >
                  <option value="Inclusive">Inclusive</option>
                  <option value="Exclusive">Exclusive</option>
                </select>
              </div>
              <div className="gg-field">
                <label className="gg-label" htmlFor="transfer-item-tax-rate">Order Tax</label>
                <div className="gg-input-group">
                  <input
                    className="gg-input gg-num"
                    id="transfer-item-tax-rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={itemEdit.orderTax}
                    onChange={(event) => setItemEdit({ ...itemEdit, orderTax: event.target.value })}
                  />
                  <span className="gg-input-suffix">%</span>
                </div>
              </div>
              <div className="gg-field">
                <label className="gg-label" htmlFor="transfer-item-discount-type">Discount Type <span className="gg-req">*</span></label>
                <select
                  className="gg-select"
                  id="transfer-item-discount-type"
                  value={itemEdit.discountType}
                  onChange={(event) => {
                    if (event.target.value === "Fixed" || event.target.value === "Percentage") {
                      setItemEdit({ ...itemEdit, discountType: event.target.value });
                    }
                  }}
                >
                  <option value="Fixed">Fixed</option>
                  <option value="Percentage">Percentage</option>
                </select>
              </div>
              <div className="gg-field">
                <label className="gg-label" htmlFor="transfer-item-discount">Discount <span className="gg-req">*</span></label>
                <input
                  className="gg-input gg-num"
                  id="transfer-item-discount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={itemEdit.discount}
                  onChange={(event) => setItemEdit({ ...itemEdit, discount: event.target.value })}
                />
              </div>
              <div className="gg-field">
                <label className="gg-label" htmlFor="transfer-item-unit">Product Unit <span className="gg-req">*</span></label>
                <select className="gg-select" id="transfer-item-unit" value={activeItem.unit} disabled>
                  <option value={activeItem.unit}>{activeItem.unit}</option>
                </select>
                <span className="gg-muted">Product unit is set by the product record.</span>
              </div>
            </div>
            {itemEditError && <p className="warehouse-field-error transfer-item-edit-error" role="alert">{itemEditError}</p>}
            <div className="gg-modal-foot">
              <button className="gg-btn gg-btn--primary" type="button" onClick={saveItemEditor}>
                <Check aria-hidden="true" />
                Save
              </button>
              <button className="gg-btn gg-btn--secondary" type="button" onClick={closeItemEditor}>Cancel</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
