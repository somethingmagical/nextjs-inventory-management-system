"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { createAdjustment, searchAdjustmentProducts } from "../actions";
import {
  initialAdjustmentActionState,
  type AdjustmentActionState,
} from "../action-state";

type WarehouseOption = { id: string; name: string };
type ProductResult = {
  id: string;
  name: string;
  code: string;
  productUnit: string;
  stock: string;
};
type AdjustmentItem = ProductResult & {
  quantity: string;
  type: "Addition" | "Subtraction";
};

const minimumSearchLength = 2;

export default function AdjustmentForm({ warehouses }: { warehouses: WarehouseOption[] }) {
  const [state, formAction, isPending] = useActionState<AdjustmentActionState, FormData>(
    createAdjustment,
    initialAdjustmentActionState,
  );
  const [warehouseId, setWarehouseId] = useState("");
  const [date, setDate] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductResult[]>([]);
  const [items, setItems] = useState<AdjustmentItem[]>([]);
  const [searchError, setSearchError] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const trimmedQuery = query.trim();

    if (!warehouseId || trimmedQuery.length < minimumSearchLength) {
      setResults([]);
      setIsSearching(false);
      setSearchError("");
      return;
    }

    const timeout = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const result = await searchAdjustmentProducts(warehouseId, trimmedQuery);
        if (cancelled) return;

        setIsSearching(false);
        if (result.status === "error") {
          setResults([]);
          setSearchError(result.message);
          return;
        }

        setSearchError("");
        setResults(result.products);
      } catch {
        if (cancelled) return;
        setResults([]);
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

  function chooseWarehouse(value: string) {
    setWarehouseId(value);
    setItems([]);
    setQuery("");
    setResults([]);
    setSearchError("");
  }

  function addProduct(product: ProductResult) {
    setItems((current) => current.some((item) => item.id === product.id)
      ? current
      : [...current, { ...product, quantity: "1", type: "Addition" }]);
    setQuery("");
    setResults([]);
    setSearchError("");
  }

  function updateItem(productId: string, updates: Partial<Pick<AdjustmentItem, "quantity" | "type">>) {
    setItems((current) => current.map((item) => (
      item.id === productId ? { ...item, ...updates } : item
    )));
  }

  return (
    <form className="gg-card gg-card-pad adjustment-form" action={formAction}>
      {state.status === "error" && (
        <p className="warehouse-toast is-visible" role="alert">
          <span>{state.message}</span>
        </p>
      )}
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(items.map(({ id, quantity, type }) => ({
          productId: id,
          quantity,
          type,
        })))}
      />

      <div className="adjustment-top">
        <div className="gg-field">
          <label className="gg-label" htmlFor="adjustment-warehouse">
            Warehouse <span className="gg-req">*</span>
          </label>
          <select
            className="gg-select"
            id="adjustment-warehouse"
            name="warehouseId"
            value={warehouseId}
            onChange={(event) => chooseWarehouse(event.target.value)}
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
          <label className="gg-label" htmlFor="adjustment-date">
            Date <span className="gg-req">*</span>
          </label>
          <input
            className="gg-input gg-num"
            id="adjustment-date"
            name="date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
            disabled={isPending}
          />
        </div>
      </div>

      <div className="gg-field adjustment-product-search">
        <label className="gg-label" htmlFor="adjustment-product-search">Product</label>
        <div className="gg-input-icon">
          <Search aria-hidden="true" />
          <input
            className="gg-input"
            id="adjustment-product-search"
            type="search"
            placeholder={warehouseId ? "Search product by code or name" : "Choose a warehouse to search"}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={120}
            disabled={!warehouseId || isPending}
            autoComplete="off"
            aria-autocomplete="list"
            aria-controls="adjustment-product-results"
          />
        </div>
        {isSearching && <p className="gg-muted adjustment-search-feedback">Searching products...</p>}
        {searchError && <p className="warehouse-field-error" role="alert">{searchError}</p>}
        {results.length > 0 && (
          <ul className="adjustment-search-results" id="adjustment-product-results" role="listbox" aria-label="Product search results">
            {results.map((product) => {
              const alreadyAdded = items.some((item) => item.id === product.id);
              return (
                <li key={product.id}>
                  <button
                    className="adjustment-search-result"
                    type="button"
                    role="option"
                    aria-selected={alreadyAdded}
                    disabled={alreadyAdded}
                    onClick={() => addProduct(product)}
                  >
                    <span className="adjustment-search-result-name">
                      <strong>{product.name}</strong>
                      <span className="gg-chip-code">{product.code}</span>
                    </span>
                    <span className="gg-muted">
                      Stock: {product.stock} {product.productUnit}
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
        {warehouseId && query.trim().length >= minimumSearchLength && !isSearching && !searchError && results.length === 0 && (
          <p className="gg-muted adjustment-search-feedback">No products match this search.</p>
        )}
      </div>

      <h2 className="gg-label adjustment-items-label">
        Order items <span className="gg-req">*</span>
      </h2>
      <div className="gg-table-wrap">
        <table className="gg-table">
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col">Code</th>
              <th scope="col">Stock</th>
              <th scope="col">Qty</th>
              <th scope="col">Type</th>
              <th scope="col" className="adjustment-action-heading">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="gg-td-strong">{item.name}</td>
                <td><span className="gg-chip-code">{item.code}</span></td>
                <td><span className="stock-chip gg-num">{item.stock} {item.productUnit}</span></td>
                <td>
                  <div className="gg-stepper">
                    <button
                      type="button"
                      aria-label={`Decrease ${item.name} quantity`}
                      onClick={() => updateItem(item.id, {
                        quantity: String(Math.max(1, (Number(item.quantity) || 1) - 1)),
                      })}
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
                      onChange={(event) => updateItem(item.id, { quantity: event.target.value })}
                      aria-label={`${item.name} adjustment quantity`}
                      required
                      disabled={isPending}
                    />
                    <button
                      type="button"
                      aria-label={`Increase ${item.name} quantity`}
                      onClick={() => updateItem(item.id, {
                        quantity: String((Number(item.quantity) || 0) + 1),
                      })}
                      disabled={isPending}
                    >
                      <Plus aria-hidden="true" size={15} />
                    </button>
                  </div>
                </td>
                <td>
                  <select
                    className="gg-select adjustment-type-select"
                    value={item.type}
                    onChange={(event) => {
                    const type = event.target.value;
                    if (type === "Addition" || type === "Subtraction") {
                      updateItem(item.id, { type });
                    }
                    }}
                    aria-label={`${item.name} adjustment type`}
                    disabled={isPending}
                  >
                    <option value="Addition">Addition</option>
                    <option value="Subtraction">Subtraction</option>
                  </select>
                </td>
                <td className="adjustment-action-cell">
                  <button
                    className="gg-icon-btn adjustment-remove-button"
                    type="button"
                    aria-label={`Remove ${item.name}`}
                    title="Remove"
                    onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
                    disabled={isPending}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="product-empty-cell" colSpan={6}>
                  <p className="warehouse-empty-title">No products added</p>
                  <p className="gg-muted">Search for a product and add it to this adjustment.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="gg-form-actions">
        <button
          className="gg-btn gg-btn--primary"
          type="submit"
          disabled={isPending || !warehouseId || items.length === 0}
        >
          <Plus aria-hidden="true" />
          {isPending ? "Saving..." : "Save Adjustment"}
        </button>
        <Link className="gg-btn gg-btn--secondary" href="/adjustments">Cancel</Link>
      </div>
    </form>
  );
}
