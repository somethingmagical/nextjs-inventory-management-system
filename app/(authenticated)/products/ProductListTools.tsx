import Link from "next/link";
import AutoSearchForm from "@/components/shared/AutoSearchForm";
import DynamicFilterControl from "@/components/shared/DynamicFilterControl";
import TableFilterPopover from "@/components/shared/TableFilterPopover";
import type { TableSortOption } from "@/lib/table-sorting";

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
  sortBy: string;
  sortOrder: "asc" | "desc";
  sortOptions: readonly TableSortOption[];
};

export default function ProductListTools({
  warehouses,
  suppliers,
  query,
  pageSize,
  warehouseId,
  supplierId,
  status,
  sortBy,
  sortOrder,
  sortOptions,
}: ProductListToolsProps) {
  const clearParams = new URLSearchParams();
  if (query) clearParams.set("q", query);
  clearParams.set("pageSize", String(pageSize));
  clearParams.set("sortBy", sortBy);
  clearParams.set("sortOrder", sortOrder);
  const clearHref = `/products?${clearParams.toString()}`;

  return (
    <>
      <div
        className="table-search-filter-group"
        role="group"
        aria-label="Search and filters"
      >
        <AutoSearchForm
          action="/products"
          className="warehouse-search-form"
          iconClassName="gg-input-icon warehouse-search-control"
          id="product-search"
          label="Search products"
          placeholder="Search products"
          value={query}
        />
        <TableFilterPopover label="Filter products">
          <DynamicFilterControl
            id="product-filter-warehouse"
            name="warehouseId"
            label="Warehouse"
            value={warehouseId ?? ""}
            options={[
              { value: "", label: "All warehouses" },
              ...warehouses.map((warehouse) => ({
                value: warehouse.id,
                label: warehouse.name,
              })),
            ]}
            visibleLabel
            wrapperClassName="product-filter-control"
          />
          <DynamicFilterControl
            id="product-filter-supplier"
            name="supplierId"
            label="Supplier"
            value={supplierId ?? ""}
            options={[
              { value: "", label: "All suppliers" },
              ...suppliers.map((supplier) => ({
                value: supplier.id,
                label: supplier.name,
              })),
            ]}
            visibleLabel
            wrapperClassName="product-filter-control"
          />
          <DynamicFilterControl
            id="product-filter-status"
            name="status"
            label="Status"
            value={status ?? ""}
            options={[
              { value: "", label: "All statuses" },
              { value: "Received", label: "Received" },
              { value: "Pending", label: "Pending" },
              { value: "Ordered", label: "Ordered" },
            ]}
            visibleLabel
            wrapperClassName="product-filter-control"
          />
          <div className="table-filter-sort">
            <span className="table-filter-sort-title">Sort</span>
            <DynamicFilterControl
              id="product-filter-sort-by"
              name="sortBy"
              label="Sort products by"
              value={sortBy}
              options={sortOptions}
              visibleLabel
              wrapperClassName="product-filter-control"
            />
            <DynamicFilterControl
              id="product-filter-sort-order"
              name="sortOrder"
              label="Sort direction"
              value={sortOrder}
              options={[
                { value: "asc", label: "Ascending" },
                { value: "desc", label: "Descending" },
              ]}
              visibleLabel
              wrapperClassName="product-filter-control"
            />
          </div>
          <div className="product-filter-actions">
            <Link className="gg-btn gg-btn--secondary" href={clearHref}>
              Clear
            </Link>
          </div>
        </TableFilterPopover>
      </div>
    </>
  );
}
