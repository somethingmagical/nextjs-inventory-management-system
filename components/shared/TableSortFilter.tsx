"use client";

import { Suspense, useEffect, useId, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SortOrder, TableSortOption } from "@/lib/table-sorting";
import TableFilterPopover from "./TableFilterPopover";

export default function TableSortFilter({
  children,
  popover = true,
  ...props
}: {
  sortBy: string;
  sortOrder: SortOrder;
  options: readonly TableSortOption[];
  children?: ReactNode;
  popover?: boolean;
}) {
  const sortControls = (
    <div className="table-filter-sort">
      <span className="table-filter-sort-title">Sort</span>
      <Suspense fallback={<div className="gg-table-sort-filter" aria-busy="true" />}>
        <TableSortFilterContent {...props} />
      </Suspense>
    </div>
  );
  if (!popover) return sortControls;

  return (
    <TableFilterPopover>
      {children}
      {sortControls}
    </TableFilterPopover>
  );
}

function TableSortFilterContent({
  sortBy,
  sortOrder,
  options,
}: {
  sortBy: string;
  sortOrder: SortOrder;
  options: readonly TableSortOption[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sortId = useId();
  const [selectedSortBy, setSelectedSortBy] = useState(sortBy);
  const [selectedSortOrder, setSelectedSortOrder] = useState(sortOrder);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSelectedSortBy(sortBy);
    setSelectedSortOrder(sortOrder);
  }, [sortBy, sortOrder]);

  function applySort(nextSortBy = selectedSortBy, nextSortOrder = selectedSortOrder) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    params.set("sortBy", nextSortBy);
    params.set("sortOrder", nextSortOrder);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  return (
    <div className="gg-table-sort-filter" aria-busy={isPending}>
      <label className="sr-only" htmlFor={`${sortId}-by`}>Sort table by</label>
      <select
        className="gg-select"
        id={`${sortId}-by`}
        value={selectedSortBy}
        onChange={(event) => {
          setSelectedSortBy(event.target.value);
          applySort(event.target.value, selectedSortOrder);
        }}
      >
        {options.map((option) => (
          <option value={option.value} key={option.value}>{option.label}</option>
        ))}
      </select>
      <label className="sr-only" htmlFor={`${sortId}-order`}>Sort direction</label>
      <select
        className="gg-select"
        id={`${sortId}-order`}
        value={selectedSortOrder}
        onChange={(event) => {
          const value = event.target.value === "asc" ? "asc" : "desc";
          setSelectedSortOrder(value);
          applySort(selectedSortBy, value);
        }}
      >
        <option value="asc">Ascending</option>
        <option value="desc">Descending</option>
      </select>
    </div>
  );
}
