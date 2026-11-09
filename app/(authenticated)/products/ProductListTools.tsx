"use client";

import { useEffect, useState } from "react";
import { Download, Filter, Info, Upload } from "lucide-react";

type FilterOption = {
  id: string;
  name: string;
};

type ProductListToolsProps = {
  warehouses: FilterOption[];
  suppliers: FilterOption[];
  query: string;
  pageSize: number;
  warehouseId?: string;
  supplierId?: string;
  status?: "Received" | "Pending" | "Ordered";
};

export default function ProductListTools({
  warehouses,
  suppliers,
  query,
  pageSize,
  warehouseId,
  supplierId,
  status,
}: ProductListToolsProps) {
  const [message, setMessage] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [message]);

  const clearParams = new URLSearchParams();
  if (query) clearParams.set("q", query);
  clearParams.set("pageSize", String(pageSize));
  const clearHref = `/products?${clearParams.toString()}`;

  return (
    <>
      <div className="product-filter-container">
        <button
          className="gg-icon-btn product-filter-button"
          type="button"
          aria-label="Filter products"
          title="Filter products"
          aria-expanded={isFilterOpen}
          aria-controls="product-filter-popover"
          onClick={() => setIsFilterOpen((open) => !open)}
        >
          <Filter aria-hidden="true" />
        </button>
        <div className="product-filter-popover" id="product-filter-popover" hidden={!isFilterOpen}>
          <form action="/products" method="get">
            {query && <input type="hidden" name="q" value={query} />}
            <input type="hidden" name="pageSize" value={String(pageSize)} />
            <label htmlFor="product-filter-warehouse">Warehouse</label>
            <select
              className="gg-select"
              id="product-filter-warehouse"
              name="warehouseId"
              defaultValue={warehouseId ?? ""}
            >
              <option value="">All warehouses</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
              ))}
            </select>
            <label htmlFor="product-filter-supplier">Supplier</label>
            <select
              className="gg-select"
              id="product-filter-supplier"
              name="supplierId"
              defaultValue={supplierId ?? ""}
            >
              <option value="">All suppliers</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
            <label htmlFor="product-filter-status">Status</label>
            <select
              className="gg-select"
              id="product-filter-status"
              name="status"
              defaultValue={status ?? ""}
            >
              <option value="">All statuses</option>
              <option value="Received">Received</option>
              <option value="Pending">Pending</option>
              <option value="Ordered">Ordered</option>
            </select>
            <div className="product-filter-actions">
              <a className="gg-btn gg-btn--secondary" href={clearHref}>Clear</a>
              <button className="gg-btn gg-btn--primary" type="submit">Apply filters</button>
            </div>
          </form>
        </div>
      </div>
      <button
        className="gg-btn gg-btn--secondary"
        type="button"
        onClick={() => setMessage("Product export is coming soon.")}
      >
        <Upload aria-hidden="true" />
        Export Products
      </button>
      <button
        className="gg-btn gg-btn--secondary"
        type="button"
        onClick={() => setMessage("Product import is coming soon.")}
      >
        <Download aria-hidden="true" />
        Import Products
      </button>
      {message && (
        <p className="warehouse-toast is-visible product-tools-toast" role="status">
          <Info size={18} aria-hidden="true" />
          <span>{message}</span>
        </p>
      )}
    </>
  );
}
